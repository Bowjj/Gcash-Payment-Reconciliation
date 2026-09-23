create type public.reconciliation_status as enum ('VERIFIED', 'NEEDS_REVIEW', 'CASH', 'BANK');
create type public.reconciliation_reason as enum (
  'REFERENCE_MATCH', 'REFERENCE_NOT_FOUND', 'MISSING_REFERENCE', 'DUPLICATE_REFERENCE',
  'DUPLICATE_PAYMENT_REFERENCE', 'CASH_PAYMENT', 'BANK_MANUAL_VERIFICATION', 'UNKNOWN_PAYMENT_METHOD'
);

alter table public.payments add constraint payments_scope_unique unique (id, verification_run_id, business_id);
alter table public.gcash_transactions add constraint gcash_scope_unique unique (id, verification_run_id, business_id);

create table public.payment_matches (
  payment_id uuid primary key,
  verification_run_id uuid not null,
  business_id uuid not null,
  gcash_transaction_id uuid unique,
  status public.reconciliation_status not null,
  reason public.reconciliation_reason not null,
  reconciled_at timestamptz not null default now(),
  foreign key (payment_id, verification_run_id, business_id)
    references public.payments (id, verification_run_id, business_id) on delete cascade,
  foreign key (gcash_transaction_id, verification_run_id, business_id)
    references public.gcash_transactions (id, verification_run_id, business_id) on delete cascade,
  check (
    (status = 'VERIFIED' and reason = 'REFERENCE_MATCH' and gcash_transaction_id is not null)
    or (gcash_transaction_id is null and (
      (status = 'CASH' and reason = 'CASH_PAYMENT')
      or (status = 'BANK' and reason = 'BANK_MANUAL_VERIFICATION')
      or (status = 'NEEDS_REVIEW' and reason in ('REFERENCE_NOT_FOUND', 'MISSING_REFERENCE',
        'DUPLICATE_REFERENCE', 'DUPLICATE_PAYMENT_REFERENCE', 'UNKNOWN_PAYMENT_METHOD'))
    ))
  )
);
create index payment_matches_run_idx on public.payment_matches (business_id, verification_run_id, status);
alter table public.payment_matches enable row level security;
revoke all on public.payment_matches from anon, authenticated;
grant select on public.payment_matches to authenticated;
create policy payment_matches_select_member on public.payment_matches for select to authenticated
  using (private.member_role(business_id, (select auth.uid())) is not null);

create view public.gcash_reconciliation with (security_invoker = true) as
select g.*, m.payment_id as matched_payment_id, p.customer as matched_customer
from public.gcash_transactions g
left join public.payment_matches m on m.gcash_transaction_id = g.id
  and m.business_id = g.business_id and m.verification_run_id = g.verification_run_id
left join public.payments p on p.id = m.payment_id
  and p.business_id = m.business_id and p.verification_run_id = m.verification_run_id;
revoke all on public.gcash_reconciliation from anon, authenticated;
grant select on public.gcash_reconciliation to authenticated;

create function public.get_reconciliation_inputs(p_business_id uuid, p_run_id uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
begin
  if auth.uid() is null or private.member_role(p_business_id, auth.uid()) is null
    or not exists (select 1 from public.verification_runs where id = p_run_id and business_id = p_business_id) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'payments', (select coalesce(jsonb_agg(jsonb_build_object(
      'id', p.id, 'business_id', p.business_id, 'verification_run_id', p.verification_run_id,
      'method', p.method, 'reference_number', p.reference_number) order by p.row_index, p.id), '[]'::jsonb)
      from public.payments p where p.business_id = p_business_id and p.verification_run_id = p_run_id),
    'gcash', (select coalesce(jsonb_agg(jsonb_build_object(
      'id', g.id, 'business_id', g.business_id, 'verification_run_id', g.verification_run_id,
      'reference_number', g.reference_number, 'reference_occurrence_count', g.reference_occurrence_count)
      order by g.row_index, g.id), '[]'::jsonb)
      from public.gcash_transactions g where g.business_id = p_business_id and g.verification_run_id = p_run_id)
  );
end;
$$;
revoke all on function public.get_reconciliation_inputs(uuid, uuid) from public;
grant execute on function public.get_reconciliation_inputs(uuid, uuid) to authenticated;

-- Independently validate server-computed decisions against persisted sources at the RPC trust boundary.
create function private.expected_payment_matches(p_business_id uuid, p_run_id uuid)
returns table (payment_id uuid, gcash_transaction_id uuid, status text, reason text)
language sql stable set search_path = '' as $$
  with payments as (
    select p.*, count(*) filter (where method = 'GCASH') over (partition by reference_number) as payment_count
    from public.payments p where business_id = p_business_id and verification_run_id = p_run_id
  ), gcash as (
    select reference_number, count(*) as n, max(reference_occurrence_count) as occurrences, (array_agg(id))[1] as candidate
    from public.gcash_transactions where business_id = p_business_id and verification_run_id = p_run_id
    group by reference_number
  ), decisions as (
    select p.id, g.candidate, case
      when p.method = 'CASH' then 'CASH_PAYMENT'
      when p.method = 'BANK' then 'BANK_MANUAL_VERIFICATION'
      when p.method::text <> 'GCASH' then 'UNKNOWN_PAYMENT_METHOD'
      when coalesce(p.reference_number, '') = '' then 'MISSING_REFERENCE'
      when p.payment_count > 1 then 'DUPLICATE_PAYMENT_REFERENCE'
      when g.n is null then 'REFERENCE_NOT_FOUND'
      when g.n > 1 or g.occurrences > 1 then 'DUPLICATE_REFERENCE'
      else 'REFERENCE_MATCH' end as reason
    from payments p left join gcash g on g.reference_number = p.reference_number
  )
  select id, case when reason = 'REFERENCE_MATCH' then candidate else null end,
    case reason when 'REFERENCE_MATCH' then 'VERIFIED' when 'CASH_PAYMENT' then 'CASH'
      when 'BANK_MANUAL_VERIFICATION' then 'BANK' else 'NEEDS_REVIEW' end, reason
  from decisions;
$$;
revoke all on function private.expected_payment_matches(uuid, uuid) from public, anon, authenticated;

create function public.commit_reconciliation(p_business_id uuid, p_run_id uuid, p_results jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  expected jsonb;
begin
  if auth.uid() is null or private.member_role(p_business_id, auth.uid()) is null then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  perform id from public.verification_runs where id = p_run_id and business_id = p_business_id for update;
  if not found then raise exception 'run not found' using errcode = '42501'; end if;
  if p_results is null or jsonb_typeof(p_results) <> 'array' then
    raise exception 'results must be an array' using errcode = '22023';
  end if;
  select coalesce(jsonb_agg(to_jsonb(e) order by payment_id), '[]'::jsonb) into expected
    from private.expected_payment_matches(p_business_id, p_run_id) e;
  if jsonb_array_length(expected) = 0 or not exists (
    select 1 from public.gcash_transactions where business_id = p_business_id and verification_run_id = p_run_id
  ) then raise exception 'both saved datasets are required' using errcode = '22023'; end if;
  if expected is distinct from (select jsonb_agg(value order by value->>'payment_id') from jsonb_array_elements(p_results)) then
    raise exception 'results do not match saved sources; retry reconciliation' using errcode = '22023';
  end if;

  delete from public.payment_matches where business_id = p_business_id and verification_run_id = p_run_id;
  insert into public.payment_matches (payment_id, verification_run_id, business_id, gcash_transaction_id, status, reason)
    select r.payment_id, p_run_id, p_business_id, r.gcash_transaction_id,
      r.status::public.reconciliation_status, r.reason::public.reconciliation_reason
    from jsonb_to_recordset(expected) r (payment_id uuid, gcash_transaction_id uuid, status text, reason text);
  update public.verification_runs set status = 'succeeded', started_at = coalesce(started_at, now()),
    completed_at = now(), error_message = null where id = p_run_id and business_id = p_business_id;
  return (select jsonb_build_object('total', count(*), 'verified', count(*) filter (where status = 'VERIFIED'),
    'needsReview', count(*) filter (where status = 'NEEDS_REVIEW'), 'cash', count(*) filter (where status = 'CASH'),
    'bank', count(*) filter (where status = 'BANK'))
    from public.payment_matches where business_id = p_business_id and verification_run_id = p_run_id);
end;
$$;
revoke all on function public.commit_reconciliation(uuid, uuid, jsonb) from public, anon;
grant execute on function public.commit_reconciliation(uuid, uuid, jsonb) to authenticated;
