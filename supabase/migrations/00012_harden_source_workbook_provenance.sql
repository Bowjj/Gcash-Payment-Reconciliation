-- Source workbooks are created only by the atomic import RPC. Direct inserts
-- allowed a caller to attach arbitrary workbook JSON to a queued legacy run.
drop policy source_workbooks_insert on public.verification_source_workbooks;
revoke insert on public.verification_source_workbooks from authenticated;

create or replace function public.create_dual_file_import(
 p_business_id uuid, p_session_id uuid, p_payments jsonb, p_gcash jsonb,
 p_payment_source jsonb, p_gcash_source jsonb
) returns uuid language plpgsql security definer set search_path='' as $$
declare run_id uuid; source_count integer;
begin
 if auth.uid() is null or private.member_role(p_business_id, auth.uid()) is null then
   raise exception 'not authorized' using errcode='42501';
 end if;
 run_id := public.create_dual_file_import(p_business_id,p_session_id,p_payments,p_gcash);
 select count(*) into source_count from public.verification_source_workbooks where verification_run_id=run_id and business_id=p_business_id;
 if source_count > 0 then
   if source_count <> 2 or not exists (select 1 from public.verification_source_workbooks where verification_run_id=run_id and kind='payments' and source=p_payment_source)
     or not exists (select 1 from public.verification_source_workbooks where verification_run_id=run_id and kind='gcash' and source=p_gcash_source) then
     raise exception 'source files changed for this import session' using errcode='22023';
   end if;
 else
   insert into public.verification_source_workbooks (verification_run_id,business_id,kind,source) values
    (run_id,p_business_id,'payments',p_payment_source),(run_id,p_business_id,'gcash',p_gcash_source);
 end if;
 return run_id;
end;
$$;
revoke all on function public.create_dual_file_import(uuid,uuid,jsonb,jsonb,jsonb,jsonb) from public, anon;
grant execute on function public.create_dual_file_import(uuid,uuid,jsonb,jsonb,jsonb,jsonb) to authenticated;
