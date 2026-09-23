create or replace function public.create_payment_import(
  p_business_id uuid,
  p_rows jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  verification_run_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'payment rows must be a non-empty array' using errcode = '22023';
  end if;

  insert into public.verification_runs (business_id, requested_by, status)
  values (p_business_id, auth.uid(), 'queued')
  returning id into verification_run_id;

  insert into public.payments (
    verification_run_id,
    business_id,
    imported_by,
    customer,
    account,
    billing_period,
    amount,
    method,
    reference_number,
    payment_date,
    notes,
    paid_by,
    received_by,
    photo_url,
    created_at_source,
    row_index,
    raw_data
  )
  select
    verification_run_id,
    p_business_id,
    auth.uid(),
    payment.customer,
    payment.account,
    payment.billing_period,
    payment.amount::numeric,
    payment.method::public.payment_method,
    payment.reference_number,
    payment.payment_date,
    payment.notes,
    payment.paid_by,
    payment.received_by,
    payment.photo_url,
    payment.created_at_source,
    payment.row_index,
    payment.raw_data
  from jsonb_to_recordset(p_rows) as payment (
    customer text,
    account text,
    billing_period text,
    amount text,
    method text,
    reference_number text,
    payment_date timestamptz,
    notes text,
    paid_by text,
    received_by text,
    photo_url text,
    created_at_source timestamptz,
    row_index integer,
    raw_data jsonb
  );

  return verification_run_id;
end;
$$;

revoke all on function public.create_payment_import(uuid, jsonb) from public;
grant execute on function public.create_payment_import(uuid, jsonb) to authenticated;
