alter table public.payment_matches add constraint payment_matches_scope_unique
  unique (payment_id, verification_run_id, business_id);

create table public.verification_actions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  verification_run_id uuid not null,
  payment_id uuid not null,
  actor_id uuid not null references auth.users(id) on delete restrict,
  actor_email text,
  created_at timestamptz not null default clock_timestamp(),
  revision integer not null check (revision > 0),
  previous_status public.reconciliation_status not null,
  new_status public.reconciliation_status not null check (new_status in ('VERIFIED', 'NEEDS_REVIEW')),
  note text not null default '' check (char_length(note) <= 1000),
  unique (payment_id, revision),
  foreign key (payment_id, verification_run_id, business_id)
    references public.payment_matches (payment_id, verification_run_id, business_id) on delete cascade
);
create index verification_actions_scope_idx on public.verification_actions (business_id, verification_run_id, payment_id, revision desc);
alter table public.verification_actions enable row level security;
revoke all on public.verification_actions from anon, authenticated;
grant select on public.verification_actions to authenticated;
create policy verification_actions_read_member on public.verification_actions for select to authenticated
  using (private.member_role(business_id, (select auth.uid())) is not null);

create function public.review_payment(
  p_business_id uuid, p_run_id uuid, p_payment_id uuid, p_status public.reconciliation_status,
  p_note text, p_expected_revision integer
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  automated public.reconciliation_status;
  previous public.reconciliation_status;
  current_revision integer;
  action_id uuid;
begin
  if auth.uid() is null or coalesce(private.member_role(p_business_id, auth.uid())::text, '') not in ('owner', 'admin') then
    raise exception 'review requires owner or admin membership' using errcode = '42501';
  end if;
  if p_status is null or p_status not in ('VERIFIED', 'NEEDS_REVIEW') or p_note is null
    or char_length(p_note) > 1000 or p_expected_revision is null or p_expected_revision < 0 then
    raise exception 'invalid review decision' using errcode = '22023';
  end if;
  perform id from public.verification_runs where id = p_run_id and business_id = p_business_id and status = 'succeeded' for update;
  if not found then raise exception 'completed run not found' using errcode = '42501'; end if;
  select status into automated from public.payment_matches
    where payment_id = p_payment_id and business_id = p_business_id and verification_run_id = p_run_id for update;
  if not found then raise exception 'payment result not found' using errcode = '42501'; end if;
  if automated <> 'NEEDS_REVIEW' then raise exception 'only automated review items can be manually resolved' using errcode = '22023'; end if;
  select revision, new_status into current_revision, previous from public.verification_actions
    where payment_id = p_payment_id order by revision desc limit 1;
  current_revision := coalesce(current_revision, 0);
  previous := coalesce(previous, automated);
  if p_expected_revision <> current_revision then
    raise exception 'decision changed; refresh before saving' using errcode = 'PT409';
  end if;
  insert into public.verification_actions (business_id, verification_run_id, payment_id, actor_id, actor_email,
    revision, previous_status, new_status, note)
    values (p_business_id, p_run_id, p_payment_id, auth.uid(),
      (select email from auth.users where id = auth.uid()), current_revision + 1, previous, p_status, btrim(p_note))
    returning id into action_id;
  return action_id;
end;
$$;
revoke all on function public.review_payment(uuid, uuid, uuid, public.reconciliation_status, text, integer) from public, anon;
grant execute on function public.review_payment(uuid, uuid, uuid, public.reconciliation_status, text, integer) to authenticated;

create function private.protect_reviewed_automation() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (new.status, new.reason, new.gcash_transaction_id) is distinct from (old.status, old.reason, old.gcash_transaction_id)
    and exists (select 1 from public.verification_actions where payment_id = old.payment_id) then
    raise exception 'reviewed automated decision is immutable' using errcode = '22023';
  end if;
  return new;
end;
$$;
revoke all on function private.protect_reviewed_automation() from public, anon, authenticated;
create trigger payment_matches_protect_reviewed before update on public.payment_matches
  for each row execute function private.protect_reviewed_automation();

-- Keep match identities stable on retries so previously recorded audit actions cannot be cascaded away.
create or replace function public.commit_reconciliation(p_business_id uuid, p_run_id uuid, p_results jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare expected jsonb;
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
  insert into public.payment_matches (payment_id, verification_run_id, business_id, gcash_transaction_id, status, reason)
    select r.payment_id, p_run_id, p_business_id, r.gcash_transaction_id,
      r.status::public.reconciliation_status, r.reason::public.reconciliation_reason
    from jsonb_to_recordset(expected) r (payment_id uuid, gcash_transaction_id uuid, status text, reason text)
    on conflict (payment_id) do update set gcash_transaction_id = excluded.gcash_transaction_id,
      status = excluded.status, reason = excluded.reason
    where (payment_matches.status, payment_matches.reason, payment_matches.gcash_transaction_id)
      is distinct from (excluded.status, excluded.reason, excluded.gcash_transaction_id);
  update public.verification_runs set status = 'succeeded', started_at = coalesce(started_at, now()),
    completed_at = coalesce(completed_at, now()), error_message = null where id = p_run_id and business_id = p_business_id;
  return (select jsonb_build_object('total', count(*), 'verified', count(*) filter (where status = 'VERIFIED'),
    'needsReview', count(*) filter (where status = 'NEEDS_REVIEW'), 'cash', count(*) filter (where status = 'CASH'),
    'bank', count(*) filter (where status = 'BANK')) from public.payment_matches
    where business_id = p_business_id and verification_run_id = p_run_id);
end;
$$;

create view public.payment_results with (security_invoker = true) as
select p.*, p.amount::text as amount_decimal, m.status as automated_status, m.reason as automated_reason,
  m.gcash_transaction_id, coalesce(a.new_status, m.status) as effective_status,
  a.new_status as manual_status, coalesce(a.revision, 0) as review_revision,
  a.note as manual_note, a.actor_email as reviewed_by, a.created_at as reviewed_at
from public.payments p join public.payment_matches m
  on m.payment_id = p.id and m.business_id = p.business_id and m.verification_run_id = p.verification_run_id
left join lateral (select * from public.verification_actions v where v.payment_id = p.id
  and v.business_id = p.business_id and v.verification_run_id = p.verification_run_id order by v.revision desc limit 1) a on true;
revoke all on public.payment_results from anon, authenticated;
grant select on public.payment_results to authenticated;

create view public.gcash_results with (security_invoker = true) as
select g.*, g.amount::text as amount_decimal,
  case when g.raw_data->>'source_order' ~ '^[0-9]{1,9}$' then (g.raw_data->>'source_order')::integer else g.row_index end as source_order
from public.gcash_reconciliation g;
revoke all on public.gcash_results from anon, authenticated;
grant select on public.gcash_results to authenticated;

create view public.verification_run_summaries with (security_invoker = true) as
select r.*, s.total, s.verified, s.needs_review, s.cash, s.bank,
  (select p.raw_data->>'filename' from public.payments p where p.business_id = r.business_id and p.verification_run_id = r.id order by p.row_index, p.id limit 1) as payment_filename,
  (select g.raw_data->>'filename' from public.gcash_transactions g where g.business_id = r.business_id and g.verification_run_id = r.id order by g.row_index, g.id limit 1) as gcash_filename
from public.verification_runs r
cross join lateral (select count(*) as total,
  count(*) filter (where effective_status = 'VERIFIED') as verified,
  count(*) filter (where effective_status = 'NEEDS_REVIEW') as needs_review,
  count(*) filter (where effective_status = 'CASH') as cash,
  count(*) filter (where effective_status = 'BANK') as bank
  from public.payment_results p where p.business_id = r.business_id and p.verification_run_id = r.id) s;
revoke all on public.verification_run_summaries from anon, authenticated;
grant select on public.verification_run_summaries to authenticated;

create function public.list_payment_results(
  p_business_id uuid, p_run_id uuid, p_status text default 'ALL', p_search text default '',
  p_page integer default 1, p_sort text default 'source'
)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare page_rows jsonb; total_rows bigint;
begin
  if auth.uid() is null or private.member_role(p_business_id, auth.uid()) is null or not exists (
    select 1 from public.verification_runs where id = p_run_id and business_id = p_business_id and status = 'succeeded'
  ) then raise exception 'run not found' using errcode = '42501'; end if;
  if p_status is null or p_status not in ('ALL', 'VERIFIED', 'NEEDS_REVIEW', 'CASH', 'BANK')
    or p_search is null or char_length(p_search) > 100 or p_page is null or p_page < 1 or p_page > 100000
    or p_sort is null or p_sort not in ('source', 'customer', 'payment_date', 'status') then
    raise exception 'invalid result query' using errcode = '22023';
  end if;
  select count(*) into total_rows from public.payment_results p
    where p.business_id = p_business_id and p.verification_run_id = p_run_id
      and (p_status = 'ALL' or p.effective_status::text = p_status)
      and (strpos(lower(p.customer), lower(p_search)) > 0 or strpos(lower(coalesce(p.reference_number,'')), lower(p_search)) > 0);
  select coalesce(jsonb_agg(to_jsonb(rows)), '[]'::jsonb) into page_rows from (
    select p.id, p.customer, p.method, p.amount_decimal, p.reference_number, p.payment_date, p.photo_url,
      p.automated_status, p.automated_reason, p.effective_status, p.manual_status, p.row_index
    from public.payment_results p where p.business_id = p_business_id and p.verification_run_id = p_run_id
      and (p_status = 'ALL' or p.effective_status::text = p_status)
      and (strpos(lower(p.customer), lower(p_search)) > 0 or strpos(lower(coalesce(p.reference_number,'')), lower(p_search)) > 0)
    order by case when p_sort = 'customer' then p.customer end,
      case when p_sort = 'payment_date' then p.payment_date end nulls last,
      case when p_sort = 'status' then p.effective_status end,
      p.row_index, p.id
    limit 25 offset (p_page - 1) * 25
  ) rows;
  return jsonb_build_object('rows', page_rows, 'total', total_rows);
end;
$$;
revoke all on function public.list_payment_results(uuid, uuid, text, text, integer, text) from public, anon;
grant execute on function public.list_payment_results(uuid, uuid, text, text, integer, text) to authenticated;
