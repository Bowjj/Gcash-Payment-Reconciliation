alter table public.verification_runs add column import_session_id uuid;
create unique index verification_runs_import_session_idx
  on public.verification_runs (business_id, requested_by, import_session_id);

create function public.create_payment_import(p_business_id uuid, p_rows jsonb, p_session_id uuid)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  run_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'payment rows must be a non-empty array' using errcode = '22023';
  end if;
  insert into public.verification_runs (business_id, requested_by, status, import_session_id)
    values (p_business_id, auth.uid(), 'queued', p_session_id) returning id into run_id;
  insert into public.payments (
    verification_run_id, business_id, imported_by, customer, account, billing_period,
    amount, method, reference_number, payment_date, notes, paid_by, received_by,
    photo_url, created_at_source, row_index, raw_data
  )
  select run_id, p_business_id, auth.uid(), r.customer, r.account, r.billing_period,
    r.amount::numeric, r.method::public.payment_method, r.reference_number,
    r.payment_date, r.notes, r.paid_by, r.received_by, r.photo_url, r.created_at_source,
    r.row_index, r.raw_data
  from jsonb_to_recordset(p_rows) as r (
    customer text, account text, billing_period text, amount text, method text,
    reference_number text, payment_date timestamptz, notes text, paid_by text,
    received_by text, photo_url text, created_at_source timestamptz,
    row_index integer, raw_data jsonb
  );
  return run_id;
end;
$$;
revoke all on function public.create_payment_import(uuid, jsonb, uuid) from public;
grant execute on function public.create_payment_import(uuid, jsonb, uuid) to authenticated;

create or replace function public.create_payment_import(p_business_id uuid, p_rows jsonb)
returns uuid language sql security invoker set search_path = '' as $$
  select public.create_payment_import(p_business_id, p_rows, null::uuid);
$$;

create function public.create_dual_file_import(
  p_business_id uuid, p_session_id uuid, p_payments jsonb, p_gcash jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  run_id uuid;
begin
  if auth.uid() is null or private.member_role(p_business_id, auth.uid()) is null then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_session_id is null or p_payments is null or p_gcash is null
    or jsonb_typeof(p_payments) <> 'array' or jsonb_typeof(p_gcash) <> 'array'
    or jsonb_array_length(p_payments) = 0 or jsonb_array_length(p_gcash) = 0 then
    raise exception 'both datasets and a session are required' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_business_id::text || auth.uid()::text || p_session_id::text, 0));
  select id into run_id from public.verification_runs
    where business_id = p_business_id and requested_by = auth.uid() and import_session_id = p_session_id;
  if run_id is not null then
    return run_id;
  end if;

  run_id := public.create_payment_import(p_business_id, p_payments, p_session_id);

  insert into public.gcash_transactions (
    verification_run_id, business_id, imported_by, transaction_date, description,
    reference_number, amount, direction, reference_occurrence_count, row_index, raw_data
  )
  select run_id, p_business_id, auth.uid(), r.transaction_date, r.description,
    r.reference_number, r.amount::numeric, r.direction::public.gcash_transaction_direction,
    r.reference_occurrence_count, r.row_index, r.raw_data
  from jsonb_to_recordset(p_gcash) as r (
    transaction_date date, description text, reference_number text, amount text,
    direction text, reference_occurrence_count integer, row_index integer, raw_data jsonb
  );
  return run_id;
end;
$$;
revoke all on function public.create_dual_file_import(uuid, uuid, jsonb, jsonb) from public;
grant execute on function public.create_dual_file_import(uuid, uuid, jsonb, jsonb) to authenticated;
