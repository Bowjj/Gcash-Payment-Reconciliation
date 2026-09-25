create function public.get_verification_export(p_business_id uuid, p_run_id uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  payload jsonb;
  source_rows bigint;
begin
  if auth.uid() is null or private.member_role(p_business_id, auth.uid()) is null or not exists (
    select 1 from public.verification_runs where id = p_run_id and business_id = p_business_id and status = 'succeeded'
  ) then raise exception 'completed run not found' using errcode = '42501'; end if;
  select (select count(*) from public.payments where business_id = p_business_id and verification_run_id = p_run_id)
    + (select count(*) from public.gcash_transactions where business_id = p_business_id and verification_run_id = p_run_id) into source_rows;
  if source_rows > 20000 then raise exception 'Export supports at most 20,000 combined source rows.' using errcode = 'PT413'; end if;

  -- One statement takes a consistent snapshot of sources, latest manual decisions and final counts.
  select jsonb_build_object(
    'workspaceName', (select name from public.businesses where id = p_business_id),
    'run', (select to_jsonb(r) from public.verification_run_summaries r where r.id = p_run_id and r.business_id = p_business_id),
    'payments', (select coalesce(jsonb_agg(to_jsonb(p) order by p.row_index, p.id), '[]'::jsonb)
      from public.payment_results p where p.business_id = p_business_id and p.verification_run_id = p_run_id),
    'gcash', (select coalesce(jsonb_agg(to_jsonb(g) order by g.source_order, g.row_index, g.id), '[]'::jsonb)
      from public.gcash_results g where g.business_id = p_business_id and g.verification_run_id = p_run_id)
  ) into payload;
  if jsonb_array_length(payload->'payments') <> (select count(*) from public.payments where business_id = p_business_id and verification_run_id = p_run_id) then
    raise exception 'Run contains payments without persisted reconciliation results.' using errcode = '22023';
  end if;
  if octet_length(payload::text) > 33554432 then
    raise exception 'Export data exceeds the 32 MB synchronous export limit.' using errcode = 'PT413';
  end if;
  return payload;
end;
$$;
revoke all on function public.get_verification_export(uuid, uuid) from public, anon;
grant execute on function public.get_verification_export(uuid, uuid) to authenticated;
