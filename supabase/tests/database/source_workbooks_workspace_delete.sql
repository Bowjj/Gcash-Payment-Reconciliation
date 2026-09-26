begin;
select no_plan();
insert into auth.users (id,email) select md5('ws-del-user-'||n)::uuid,'ws-del-'||n||'@test.com' from generate_series(1,4) n;
insert into public.businesses (id,name,created_by) select md5('ws-del-business-'||n)::uuid,'Workspace '||n,md5('ws-del-user-'||case when n=3 then 4 else 1 end)::uuid from generate_series(1,3) n;
insert into public.business_members (business_id,user_id,role) values
 (md5('ws-del-business-1')::uuid,md5('ws-del-user-1')::uuid,'owner'),
 (md5('ws-del-business-1')::uuid,md5('ws-del-user-2')::uuid,'admin'),
 (md5('ws-del-business-1')::uuid,md5('ws-del-user-3')::uuid,'member'),
 (md5('ws-del-business-2')::uuid,md5('ws-del-user-1')::uuid,'owner'),
 (md5('ws-del-business-3')::uuid,md5('ws-del-user-4')::uuid,'owner');

set role authenticated;
select set_config('request.jwt.claim.sub',md5('ws-del-user-1')::uuid::text,true);
select set_config('test.source','{"version":1,"base64":"UEs=","sheets":[{"name":"Sheet1","rowOffset":0,"headerRow":1,"lastColumn":4}]}',true);
select set_config('test.payments','[{"customer":"Test","amount":"1300","method":"GCASH","reference_number":"MISSING","row_index":2}]',true);
select set_config('test.gcash','[{"amount":"1299","reference_number":"0045276500984","direction":"incoming","reference_occurrence_count":1,"row_index":2}]',true);
select set_config('test.run1',public.create_dual_file_import(md5('ws-del-business-1')::uuid,md5('ws-del-session-1')::uuid,current_setting('test.payments')::jsonb,current_setting('test.gcash')::jsonb,current_setting('test.source')::jsonb,current_setting('test.source')::jsonb)::text,true);
select is((select count(*) from public.verification_source_workbooks where verification_run_id=current_setting('test.run1')::uuid),2::bigint,'both originals saved atomically');
select is(public.create_dual_file_import(md5('ws-del-business-1')::uuid,md5('ws-del-session-1')::uuid,current_setting('test.payments')::jsonb,current_setting('test.gcash')::jsonb,current_setting('test.source')::jsonb,current_setting('test.source')::jsonb),current_setting('test.run1')::uuid,'same source retry idempotent');
select throws_ok($$select public.create_dual_file_import(md5('ws-del-business-1')::uuid,md5('ws-del-session-1')::uuid,current_setting('test.payments')::jsonb,current_setting('test.gcash')::jsonb,jsonb_set(current_setting('test.source')::jsonb,'{base64}','"changed"'),current_setting('test.source')::jsonb)$$,'22023',null,'retry cannot replace original workbook');
select throws_ok($$select public.create_dual_file_import(md5('ws-del-business-1')::uuid,md5('ws-del-session-failure')::uuid,current_setting('test.payments')::jsonb,current_setting('test.gcash')::jsonb,current_setting('test.source')::jsonb,null)$$,'23502',null,'invalid second source rolls back entire import');
select is((select count(*) from public.verification_runs where import_session_id=md5('ws-del-session-failure')::uuid),0::bigint,'failed source retention leaves no partial run');
select throws_ok($$update public.verification_source_workbooks set source='{}'$$,'42501',null,'original workbooks immutable through direct API');
select set_config('test.run2',public.create_dual_file_import(md5('ws-del-business-1')::uuid,md5('ws-del-session-2')::uuid,current_setting('test.payments')::jsonb,current_setting('test.gcash')::jsonb,current_setting('test.source')::jsonb,current_setting('test.source')::jsonb)::text,true);
select set_config('test.other',public.create_dual_file_import(md5('ws-del-business-2')::uuid,md5('ws-del-session-3')::uuid,current_setting('test.payments')::jsonb,current_setting('test.gcash')::jsonb,current_setting('test.source')::jsonb,current_setting('test.source')::jsonb)::text,true);
reset role;
insert into public.payment_matches(payment_id,verification_run_id,business_id,status,reason)
select id,verification_run_id,business_id,'NEEDS_REVIEW','REFERENCE_NOT_FOUND' from public.payments where verification_run_id in (current_setting('test.run1')::uuid,current_setting('test.run2')::uuid,current_setting('test.other')::uuid);
insert into public.verification_actions(business_id,verification_run_id,payment_id,actor_id,revision,previous_status,new_status)
select business_id,verification_run_id,id,imported_by,1,'NEEDS_REVIEW','VERIFIED' from public.payments where verification_run_id in (current_setting('test.run1')::uuid,current_setting('test.run2')::uuid,current_setting('test.other')::uuid);
update public.verification_runs set status='succeeded',started_at=now(),completed_at=now() where id in (current_setting('test.run1')::uuid,current_setting('test.run2')::uuid,current_setting('test.other')::uuid);
set role authenticated;
select is((public.get_verification_export(md5('ws-del-business-1')::uuid,current_setting('test.run1')::uuid)->'sources'->'payments'->>'base64'),'UEs=','export snapshot includes retained original');
select set_config('request.jwt.claim.sub',md5('ws-del-user-3')::uuid::text,true);
with deleted as (delete from public.businesses where id=md5('ws-del-business-1')::uuid returning id) select is((select count(*) from deleted),0::bigint,'ordinary/read-only member cannot delete workspace');
select is((select count(*) from public.verification_source_workbooks),4::bigint,'member may read own source workbooks only');
select set_config('request.jwt.claim.sub',md5('ws-del-user-2')::uuid::text,true);
with deleted as (delete from public.businesses where id=md5('ws-del-business-1')::uuid returning id) select is((select count(*) from deleted),0::bigint,'admin cannot delete entire workspace');
select set_config('request.jwt.claim.sub',md5('ws-del-user-4')::uuid::text,true);
with deleted as (delete from public.businesses where id=md5('ws-del-business-1')::uuid returning id) select is((select count(*) from deleted),0::bigint,'foreign owner cannot forge workspace UUID');
select is((select count(*) from public.verification_source_workbooks),0::bigint,'foreign owner cannot read originals');
select set_config('request.jwt.claim.sub',md5('ws-del-user-1')::uuid::text,true);
with deleted as (delete from public.businesses where id=md5('ws-del-business-1')::uuid and name='workspace 1' returning id) select is((select count(*) from deleted),0::bigint,'name comparison is exact and case-sensitive');
with deleted as (delete from public.businesses where id=md5('ws-del-business-1')::uuid and name='Workspace 1' returning id) select is((select count(*) from deleted),1::bigint,'owner can delete nonempty workspace transactionally');
reset role;
select is((select count(*) from public.verification_runs where business_id=md5('ws-del-business-1')::uuid),0::bigint,'workspace run cleanup');
select is((select count(*) from public.payments where business_id=md5('ws-del-business-1')::uuid),0::bigint,'workspace Payment cleanup');
select is((select count(*) from public.gcash_transactions where business_id=md5('ws-del-business-1')::uuid),0::bigint,'workspace GCash cleanup');
select is((select count(*) from public.payment_matches where business_id=md5('ws-del-business-1')::uuid),0::bigint,'workspace match cleanup');
select is((select count(*) from public.verification_actions where business_id=md5('ws-del-business-1')::uuid),0::bigint,'workspace audit cleanup');
select is((select count(*) from public.verification_source_workbooks where business_id=md5('ws-del-business-1')::uuid),0::bigint,'workspace original-file cleanup');
select is((select count(*) from public.business_members where business_id=md5('ws-del-business-1')::uuid),0::bigint,'workspace memberships removed');
select is((select count(*) from auth.users where id in (select md5('ws-del-user-'||n)::uuid from generate_series(1,4) n)),4::bigint,'all user accounts preserved');
select is((select count(*) from public.verification_runs where id=current_setting('test.other')::uuid),1::bigint,'other workspace run preserved');
select is((select count(*) from public.payments where verification_run_id=current_setting('test.other')::uuid),1::bigint,'other workspace Payment preserved');
select is((select count(*) from public.gcash_transactions where verification_run_id=current_setting('test.other')::uuid),1::bigint,'other workspace GCash preserved');
select is((select count(*) from public.payment_matches where verification_run_id=current_setting('test.other')::uuid),1::bigint,'other workspace match preserved');
select is((select count(*) from public.verification_actions where verification_run_id=current_setting('test.other')::uuid),1::bigint,'other workspace audit preserved');
select is((select count(*) from public.verification_source_workbooks where verification_run_id=current_setting('test.other')::uuid),2::bigint,'other workspace originals preserved');
set role authenticated;
select set_config('request.jwt.claim.sub',md5('ws-del-user-1')::uuid::text,true);
delete from public.verification_runs where id=current_setting('test.other')::uuid;
select is((select count(*) from public.verification_source_workbooks where verification_run_id=current_setting('test.other')::uuid),0::bigint,'History run deletion also cascades original files');
select set_config('request.jwt.claim.sub',md5('ws-del-user-4')::uuid::text,true);
with deleted as (delete from public.businesses where id=md5('ws-del-business-3')::uuid returning id) select is((select count(*) from deleted),1::bigint,'owner can delete empty workspace');
reset role;
select is((select count(*) from public.verification_source_workbooks s left join public.verification_runs r on r.id=s.verification_run_id where r.id is null),0::bigint,'no orphan source files');
select is((select count(*) from public.businesses where id=md5('ws-del-business-2')::uuid),1::bigint,'remaining workspace preserved');
select * from finish();
rollback;
