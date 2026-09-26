-- Original uploads are run-owned, immutable, and deleted by the existing run cascade.
create table public.verification_source_workbooks (
  verification_run_id uuid not null,
  business_id uuid not null,
  kind text not null check (kind in ('payments', 'gcash')),
  source jsonb not null check (jsonb_typeof(source) = 'object' and source->>'version' = '1'
    and jsonb_typeof(source->'sheets') = 'array' and jsonb_typeof(source->'base64') = 'string'
    and length(source->>'base64') between 1 and 14000000),
  primary key (verification_run_id, kind),
  foreign key (verification_run_id, business_id) references public.verification_runs(id, business_id) on delete cascade
);
alter table public.verification_source_workbooks enable row level security;
revoke all on public.verification_source_workbooks from anon, authenticated;
grant select, insert on public.verification_source_workbooks to authenticated;
create policy source_workbooks_read on public.verification_source_workbooks for select to authenticated
 using (private.member_role(business_id, (select auth.uid())) is not null);
create policy source_workbooks_insert on public.verification_source_workbooks for insert to authenticated
 with check (private.member_role(business_id, (select auth.uid())) is not null and exists (
  select 1 from public.verification_runs r where r.id=verification_run_id and r.business_id=verification_source_workbooks.business_id
    and r.requested_by=(select auth.uid()) and r.status='queued'
 ));

-- Keep the old four-argument RPC for legacy callers. New imports save both originals
-- in the SAME transaction as their parsed rows; retries cannot replace originals.
create function public.create_dual_file_import(
 p_business_id uuid, p_session_id uuid, p_payments jsonb, p_gcash jsonb,
 p_payment_source jsonb, p_gcash_source jsonb
) returns uuid language plpgsql security invoker set search_path='' as $$
declare run_id uuid; source_count integer;
begin
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

create or replace function public.get_verification_export(p_business_id uuid, p_run_id uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare payload jsonb; source_rows bigint;
begin
 if auth.uid() is null or private.member_role(p_business_id,auth.uid()) is null or not exists (
  select 1 from public.verification_runs where id=p_run_id and business_id=p_business_id and status='succeeded'
 ) then raise exception 'completed run not found' using errcode='42501'; end if;
 select (select count(*) from public.payments where business_id=p_business_id and verification_run_id=p_run_id)
  +(select count(*) from public.gcash_transactions where business_id=p_business_id and verification_run_id=p_run_id) into source_rows;
 if source_rows>20000 then raise exception 'Export supports at most 20,000 combined source rows.' using errcode='PT413'; end if;
 select jsonb_build_object(
  'workspaceName',(select name from public.businesses where id=p_business_id),
  'run',(select to_jsonb(r) from public.verification_run_summaries r where r.id=p_run_id and r.business_id=p_business_id),
  'payments',(select coalesce(jsonb_agg(to_jsonb(p) order by p.row_index,p.id),'[]'::jsonb) from public.payment_results p where p.business_id=p_business_id and p.verification_run_id=p_run_id),
  'gcash',(select coalesce(jsonb_agg(to_jsonb(g) order by g.source_order,g.row_index,g.id),'[]'::jsonb) from public.gcash_results g where g.business_id=p_business_id and g.verification_run_id=p_run_id),
  'sources',(select coalesce(jsonb_object_agg(s.kind,s.source),'{}'::jsonb) from public.verification_source_workbooks s where s.business_id=p_business_id and s.verification_run_id=p_run_id)
 ) into payload;
 if jsonb_array_length(payload->'payments') <> (select count(*) from public.payments where business_id=p_business_id and verification_run_id=p_run_id) then
  raise exception 'Run contains payments without persisted reconciliation results.' using errcode='22023'; end if;
 if octet_length(payload::text)>33554432 then raise exception 'Export data exceeds the 32 MB synchronous export limit.' using errcode='PT413'; end if;
 return payload;
end;
$$;
