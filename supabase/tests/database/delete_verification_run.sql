begin;
select no_plan();

insert into auth.users (id,email)
select md5('delete-user-'||n)::uuid, 'delete-'||n||'@test.com' from generate_series(1,4) n;
insert into public.businesses (id,name,created_by) values
 (md5('delete-business-1')::uuid,'Delete A',md5('delete-user-1')::uuid),
 (md5('delete-business-2')::uuid,'Delete B',md5('delete-user-4')::uuid);
insert into public.business_members (business_id,user_id,role) values
 (md5('delete-business-1')::uuid,md5('delete-user-1')::uuid,'owner'),
 (md5('delete-business-1')::uuid,md5('delete-user-2')::uuid,'admin'),
 (md5('delete-business-1')::uuid,md5('delete-user-3')::uuid,'member'),
 (md5('delete-business-2')::uuid,md5('delete-user-4')::uuid,'owner');
insert into public.verification_runs (id,business_id,requested_by,status,started_at,completed_at,import_session_id)
select md5('delete-run-'||n)::uuid,md5('delete-business-'||case when n=5 then 2 else 1 end)::uuid,
 md5('delete-user-'||case when n=5 then 4 else 1 end)::uuid,'succeeded',now(),now(),gen_random_uuid() from generate_series(1,5) n;
insert into public.payments (id,verification_run_id,business_id,imported_by,customer,amount,method,reference_number,row_index,raw_data)
select md5(r.id::text||'-payment-'||n)::uuid,r.id,r.business_id,r.requested_by,'Customer '||n,1300,'GCASH',
 case when n=1 then '0045276500984' else 'NOT-FOUND' end,n,'{"filename":"Payment.xlsx"}'::jsonb
from public.verification_runs r cross join generate_series(1,2) n where r.id in (select md5('delete-run-'||n)::uuid from generate_series(1,5) n);
insert into public.gcash_transactions (id,verification_run_id,business_id,imported_by,amount,reference_number,row_index,raw_data)
select md5(r.id::text||'-gcash')::uuid,r.id,r.business_id,r.requested_by,1299,'0045276500984',1,'{"filename":"GCash.xlsx"}'::jsonb
from public.verification_runs r where r.id in (select md5('delete-run-'||n)::uuid from generate_series(1,5) n);
insert into public.payment_matches (payment_id,verification_run_id,business_id,gcash_transaction_id,status,reason)
select p.id,p.verification_run_id,p.business_id,case when p.row_index=1 then md5(p.verification_run_id::text||'-gcash')::uuid end,
 (case when p.row_index=1 then 'VERIFIED' else 'NEEDS_REVIEW' end)::public.reconciliation_status,
 (case when p.row_index=1 then 'REFERENCE_MATCH' else 'REFERENCE_NOT_FOUND' end)::public.reconciliation_reason
from public.payments p where p.verification_run_id in (select md5('delete-run-'||n)::uuid from generate_series(1,5) n);
insert into public.verification_actions (business_id,verification_run_id,payment_id,actor_id,revision,previous_status,new_status,note)
select p.business_id,p.verification_run_id,p.id,p.imported_by,1,'NEEDS_REVIEW','VERIFIED','Run-owned audit'
from public.payments p where p.row_index=2 and p.verification_run_id in (select md5('delete-run-'||n)::uuid from generate_series(1,5) n);

set role anon;
select throws_ok($$delete from public.verification_runs where id=md5('delete-run-2')::uuid$$,'42501',null,'anonymous deletion denied');
set role authenticated;
select set_config('request.jwt.claim.sub',md5('delete-user-3')::uuid::text,true);
with deleted as (delete from public.verification_runs where id=md5('delete-run-2')::uuid returning id)
select is((select count(*) from deleted),0::bigint,'member cannot delete even with known UUID');
select set_config('request.jwt.claim.sub',md5('delete-user-1')::uuid::text,true);
with deleted as (delete from public.verification_runs where id=md5('delete-run-5')::uuid returning id)
select is((select count(*) from deleted),0::bigint,'owner cannot delete Business B by changing UUID');
with deleted as (delete from public.verification_runs where id=md5('delete-run-2')::uuid and business_id=md5('delete-business-2')::uuid returning id)
select is((select count(*) from deleted),0::bigint,'mismatched expected workspace deletes nothing');
select is((select count(*) from public.verification_actions where verification_run_id=md5('delete-run-2')::uuid),1::bigint,'target has review audit before deletion');
with deleted as (delete from public.verification_runs where id=md5('delete-run-2')::uuid and business_id=md5('delete-business-1')::uuid returning id)
select is((select count(*) from deleted),1::bigint,'owner deletes selected run');
select throws_ok($$select public.get_verification_export(md5('delete-business-1')::uuid,md5('delete-run-2')::uuid)$$,'42501',null,'deleted run cannot export');
select throws_ok($$select public.list_payment_results(md5('delete-business-1')::uuid,md5('delete-run-2')::uuid)$$,'42501',null,'deleted run cannot expose results');
select set_config('request.jwt.claim.sub',md5('delete-user-2')::uuid::text,true);
with deleted as (delete from public.verification_runs where id=md5('delete-run-4')::uuid returning id)
select is((select count(*) from deleted),1::bigint,'admin deletes own workspace run');
reset role;
select is((select count(*) from public.verification_runs where id=md5('delete-run-2')::uuid),0::bigint,'run and import-session metadata removed');
select is((select count(*) from public.payments where verification_run_id=md5('delete-run-2')::uuid),0::bigint,'run-owned Payment cleanup');
select is((select count(*) from public.gcash_transactions where verification_run_id=md5('delete-run-2')::uuid),0::bigint,'run-owned GCash cleanup');
select is((select count(*) from public.payment_matches where verification_run_id=md5('delete-run-2')::uuid),0::bigint,'run-owned reconciliation cleanup');
select is((select count(*) from public.verification_actions where verification_run_id=md5('delete-run-2')::uuid),0::bigint,'run-owned review audit cleanup');
select is((select count(*) from public.verification_run_summaries where id=md5('delete-run-2')::uuid),0::bigint,'summary view cannot retain orphan run');
select is((select count(*) from public.verification_runs where id=md5('delete-run-1')::uuid),1::bigint,'Run 1 remains');
select is((select count(*) from public.verification_runs where id=md5('delete-run-3')::uuid),1::bigint,'Run 3 remains');
select is((select count(*) from public.verification_runs where id=md5('delete-run-5')::uuid),1::bigint,'foreign run remains');
select is((select count(*) from public.businesses where id in (md5('delete-business-1')::uuid,md5('delete-business-2')::uuid)),2::bigint,'workspaces remain');
select is((select count(*) from public.business_members where business_id in (md5('delete-business-1')::uuid,md5('delete-business-2')::uuid)),4::bigint,'memberships remain');
select is((select count(*) from auth.users where id in (select md5('delete-user-'||n)::uuid from generate_series(1,4) n)),4::bigint,'users remain');
select is((select count(*) from public.payments where verification_run_id in (select md5('delete-run-'||n)::uuid from unnest(array[1,3,5]) n)),6::bigint,'other runs Payment rows remain');
select is((select count(*) from public.gcash_transactions where verification_run_id in (select md5('delete-run-'||n)::uuid from unnest(array[1,3,5]) n)),3::bigint,'other runs GCash rows remain');
select is((select count(*) from public.payment_matches where verification_run_id in (select md5('delete-run-'||n)::uuid from unnest(array[1,3,5]) n)),6::bigint,'other runs matches remain');
select is((select count(*) from public.verification_actions where verification_run_id in (select md5('delete-run-'||n)::uuid from unnest(array[1,3,5]) n)),3::bigint,'unrelated audit remains');

-- Force an actual child-table failure, proving the parent and earlier cascades roll back.
create function pg_temp.reject_cleanup() returns trigger language plpgsql as $$begin raise exception 'simulated cleanup failure'; end;$$;
create trigger test_reject_cleanup before delete on public.gcash_transactions for each row
 when (old.verification_run_id=md5('delete-run-3')::uuid) execute function pg_temp.reject_cleanup();
set role authenticated;
select set_config('request.jwt.claim.sub',md5('delete-user-1')::uuid::text,true);
select throws_ok($$delete from public.verification_runs where id=md5('delete-run-3')::uuid$$,'P0001','simulated cleanup failure','failed cascade rolls back transaction');
reset role;
select is((select count(*) from public.verification_runs where id=md5('delete-run-3')::uuid),1::bigint,'failed deletion preserves run');
select is((select count(*) from public.payments where verification_run_id=md5('delete-run-3')::uuid),2::bigint,'failed deletion preserves Payment rows');
select is((select count(*) from public.gcash_transactions where verification_run_id=md5('delete-run-3')::uuid),1::bigint,'failed deletion preserves GCash rows');
select is((select count(*) from public.payment_matches where verification_run_id=md5('delete-run-3')::uuid),2::bigint,'failed deletion preserves matches');
select is((select count(*) from public.verification_actions where verification_run_id=md5('delete-run-3')::uuid),1::bigint,'failed deletion preserves audit');
select * from finish();
rollback;
