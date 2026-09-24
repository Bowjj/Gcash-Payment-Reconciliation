begin;
select plan(43);
insert into auth.users (id,email) values
 ('f0000000-0000-0000-0000-000000000001','review-owner@test.com'),
 ('f0000000-0000-0000-0000-000000000002','review-member@test.com'),
 ('f0000000-0000-0000-0000-000000000003','review-other@test.com'),
 ('f0000000-0000-0000-0000-000000000004','review-admin@test.com');
insert into public.businesses (id,name,created_by) values
 ('f1000000-0000-0000-0000-000000000001','Review A','f0000000-0000-0000-0000-000000000001'),
 ('f1000000-0000-0000-0000-000000000002','Review B','f0000000-0000-0000-0000-000000000003');
insert into public.business_members (business_id,user_id,role) values
 ('f1000000-0000-0000-0000-000000000001','f0000000-0000-0000-0000-000000000001','owner'),
 ('f1000000-0000-0000-0000-000000000001','f0000000-0000-0000-0000-000000000002','member'),
 ('f1000000-0000-0000-0000-000000000001','f0000000-0000-0000-0000-000000000004','admin'),
 ('f1000000-0000-0000-0000-000000000002','f0000000-0000-0000-0000-000000000003','owner');
insert into public.verification_runs (id,business_id,requested_by,status,started_at,completed_at) values
 ('f2000000-0000-0000-0000-000000000001','f1000000-0000-0000-0000-000000000001','f0000000-0000-0000-0000-000000000001','succeeded',now(),now()),
 ('f2000000-0000-0000-0000-000000000002','f1000000-0000-0000-0000-000000000002','f0000000-0000-0000-0000-000000000003','succeeded',now(),now()),
 ('f2000000-0000-0000-0000-000000000003','f1000000-0000-0000-0000-000000000001','f0000000-0000-0000-0000-000000000001','succeeded',now(),now());
insert into public.payments (id,business_id,verification_run_id,imported_by,customer,amount,method,reference_number,row_index,raw_data)
select ('f3000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,
 'f1000000-0000-0000-0000-000000000001','f2000000-0000-0000-0000-000000000001','f0000000-0000-0000-0000-000000000001',
 customer,amount,method::public.payment_method,ref,n,'{"filename":"payments.xlsx"}'::jsonb
from (values (1,'Shara Villariasa',1000,'GCASH','0000203966985'),(2,'Jake Verified',1300,'GCASH','ABC123'),
 (3,'Cash Customer',1000,'CASH',null),(4,'Bank Customer',1000,'BANK',null)) v(n,customer,amount,method,ref);
insert into public.payments (id,business_id,verification_run_id,imported_by,customer,amount,method,row_index) values
 ('f3000000-0000-0000-0000-000000000005','f1000000-0000-0000-0000-000000000002','f2000000-0000-0000-0000-000000000002','f0000000-0000-0000-0000-000000000003','Other Business',1,'GCASH',1),
 ('f3000000-0000-0000-0000-000000000006','f1000000-0000-0000-0000-000000000001','f2000000-0000-0000-0000-000000000003','f0000000-0000-0000-0000-000000000001','Other Run',1,'GCASH',1);
insert into public.gcash_transactions (id,business_id,verification_run_id,imported_by,reference_number,amount,row_index,raw_data) values
 ('f4000000-0000-0000-0000-000000000001','f1000000-0000-0000-0000-000000000001','f2000000-0000-0000-0000-000000000001','f0000000-0000-0000-0000-000000000001','ABC123',1299,2,'{"filename":"gcash.xlsx","source_order":0}');
insert into public.payment_matches (payment_id,business_id,verification_run_id,status,reason,gcash_transaction_id)
select p.id,p.business_id,p.verification_run_id,
 case p.id when 'f3000000-0000-0000-0000-000000000002' then 'VERIFIED'::public.reconciliation_status
 when 'f3000000-0000-0000-0000-000000000003' then 'CASH'::public.reconciliation_status
 when 'f3000000-0000-0000-0000-000000000004' then 'BANK'::public.reconciliation_status else 'NEEDS_REVIEW'::public.reconciliation_status end,
 case p.id when 'f3000000-0000-0000-0000-000000000001' then 'REFERENCE_NOT_FOUND'::public.reconciliation_reason
 when 'f3000000-0000-0000-0000-000000000002' then 'REFERENCE_MATCH'::public.reconciliation_reason
 when 'f3000000-0000-0000-0000-000000000003' then 'CASH_PAYMENT'::public.reconciliation_reason
 when 'f3000000-0000-0000-0000-000000000004' then 'BANK_MANUAL_VERIFICATION'::public.reconciliation_reason else 'MISSING_REFERENCE'::public.reconciliation_reason end,
 case when p.id='f3000000-0000-0000-0000-000000000002' then 'f4000000-0000-0000-0000-000000000001'::uuid else null end
from public.payments p where p.business_id in ('f1000000-0000-0000-0000-000000000001','f1000000-0000-0000-0000-000000000002');
select set_config('test.auto_results',(select jsonb_agg(to_jsonb(e))::text from private.expected_payment_matches('f1000000-0000-0000-0000-000000000001','f2000000-0000-0000-0000-000000000001') e),true);

set role authenticated;
set request.jwt.claim.sub='f0000000-0000-0000-0000-000000000002';
select is((select count(*) from public.payment_results),5::bigint,'member reads permitted results only');
select is((select count(*) from public.payment_results where business_id='f1000000-0000-0000-0000-000000000002'),0::bigint,'other workspace results hidden by RLS');
select throws_ok($$select public.review_payment('f1000000-0000-0000-0000-000000000001','f2000000-0000-0000-0000-000000000001','f3000000-0000-0000-0000-000000000001','VERIFIED','',0)$$,'42501',null,'member cannot manually review');
select throws_ok($$select public.list_payment_results('f1000000-0000-0000-0000-000000000002','f2000000-0000-0000-0000-000000000002')$$,'42501',null,'guessed foreign run UUID denied');
set request.jwt.claim.sub='f0000000-0000-0000-0000-000000000001';
select throws_ok($$select public.review_payment('f1000000-0000-0000-0000-000000000002','f2000000-0000-0000-0000-000000000002','f3000000-0000-0000-0000-000000000005','VERIFIED','',0)$$,'42501',null,'owner cannot review another workspace');
select throws_ok($$select public.review_payment('f1000000-0000-0000-0000-000000000001','f2000000-0000-0000-0000-000000000001','f3000000-0000-0000-0000-000000000006','VERIFIED','',0)$$,'42501',null,'wrong run payment rejected');
select throws_ok($$select public.review_payment('f1000000-0000-0000-0000-000000000001','f2000000-0000-0000-0000-000000000001','f3000000-0000-0000-0000-000000000003','VERIFIED','',0)$$,'22023',null,'CASH cannot be overridden');
select throws_ok($$select public.review_payment('f1000000-0000-0000-0000-000000000001','f2000000-0000-0000-0000-000000000001','f3000000-0000-0000-0000-000000000004','VERIFIED','',0)$$,'22023',null,'BANK cannot be overridden');
select throws_ok($$select public.review_payment('f1000000-0000-0000-0000-000000000001','f2000000-0000-0000-0000-000000000001','f3000000-0000-0000-0000-000000000001','VERIFIED',repeat('x',1001),0)$$,'22023',null,'oversized note rejected server-side');
select lives_ok($$select public.review_payment('f1000000-0000-0000-0000-000000000001','f2000000-0000-0000-0000-000000000001','f3000000-0000-0000-0000-000000000001','VERIFIED','Confirmed manually with admin',0)$$,'authorized manual action succeeds');
select is((select actor_id from public.verification_actions limit 1),'f0000000-0000-0000-0000-000000000001'::uuid,'actor comes from authenticated identity');
select is((select actor_email from public.verification_actions limit 1),'review-owner@test.com','actor email is server-resolved');
select ok((select created_at is not null from public.verification_actions limit 1),'audit timestamp recorded');
select is((select previous_status::text from public.verification_actions limit 1),'NEEDS_REVIEW','previous effective status recorded');
select is((select note from public.verification_actions limit 1),'Confirmed manually with admin','note persisted');
select is((select effective_status::text from public.payment_results where id='f3000000-0000-0000-0000-000000000001'),'VERIFIED','manual decision affects final status');
select is((select automated_status::text from public.payment_results where id='f3000000-0000-0000-0000-000000000001'),'NEEDS_REVIEW','automated status unchanged');
select is((select automated_reason::text from public.payment_results where id='f3000000-0000-0000-0000-000000000001'),'REFERENCE_NOT_FOUND','automated reason unchanged');
select is((select verified from public.verification_run_summaries where id='f2000000-0000-0000-0000-000000000001'),2::bigint,'effective verified summary increases');
select is((select needs_review from public.verification_run_summaries where id='f2000000-0000-0000-0000-000000000001'),0::bigint,'effective review summary decreases');
select throws_ok($$select public.review_payment('f1000000-0000-0000-0000-000000000001','f2000000-0000-0000-0000-000000000001','f3000000-0000-0000-0000-000000000001','NEEDS_REVIEW','stale',0)$$,'PT409',null,'stale revision cannot overwrite a newer decision');
select is((select count(*) from public.verification_actions),1::bigint,'conflict adds no audit entry');
select lives_ok($$select public.review_payment('f1000000-0000-0000-0000-000000000001','f2000000-0000-0000-0000-000000000001','f3000000-0000-0000-0000-000000000001','NEEDS_REVIEW','',1)$$,'blank note and return to review accepted');
select is((select count(*) from public.verification_actions),2::bigint,'both audit actions retained');
select is((select effective_status::text from public.payment_results where id='f3000000-0000-0000-0000-000000000001'),'NEEDS_REVIEW','latest valid decision determines effective status');
select is((select previous_status::text from public.verification_actions where revision=2),'VERIFIED','second audit records previous manual effective status');
select lives_ok($$select public.commit_reconciliation('f1000000-0000-0000-0000-000000000001','f2000000-0000-0000-0000-000000000001',current_setting('test.auto_results')::jsonb)$$,'Sprint 4 rerun remains idempotent after manual review');
select is((select count(*) from public.verification_actions),2::bigint,'rerun preserves audit history');
select throws_ok($$delete from public.verification_actions$$,'42501',null,'audit cannot be deleted by application users');
select throws_ok($$update public.verification_actions set note='tampered'$$,'42501',null,'audit cannot be edited by application users');
select throws_ok($$insert into public.verification_actions (business_id,verification_run_id,payment_id,actor_id,revision,previous_status,new_status) values ('f1000000-0000-0000-0000-000000000001','f2000000-0000-0000-0000-000000000001','f3000000-0000-0000-0000-000000000001','f0000000-0000-0000-0000-000000000003',3,'NEEDS_REVIEW','VERIFIED')$$,'42501',null,'direct fabricated audit insertion denied');
select is((public.list_payment_results('f1000000-0000-0000-0000-000000000001','f2000000-0000-0000-0000-000000000001','NEEDS_REVIEW','Shara')->>'total')::integer,1,'search customer with status filter');
select is((public.list_payment_results('f1000000-0000-0000-0000-000000000001','f2000000-0000-0000-0000-000000000001','ALL','0000203966985')->>'total')::integer,1,'search leading-zero reference');
select is((public.list_payment_results('f1000000-0000-0000-0000-000000000001','f2000000-0000-0000-0000-000000000001','VERIFIED','Shara')->>'total')::integer,0,'search and filter intersect');
select is((public.list_payment_results('f1000000-0000-0000-0000-000000000001','f2000000-0000-0000-0000-000000000001','ALL','%')->>'total')::integer,0,'search wildcards are literal');
select is((select effective_status::text from public.payment_results where id='f3000000-0000-0000-0000-000000000002'),'VERIFIED','1300 payment against 1299 GCash stays verified');
set request.jwt.claim.sub='f0000000-0000-0000-0000-000000000003';
select is((select count(*) from public.verification_actions),0::bigint,'foreign audit trail remains hidden');
select is((select count(*) from public.verification_run_summaries where business_id='f1000000-0000-0000-0000-000000000001'),0::bigint,'foreign history remains hidden');
reset role;
select throws_ok($$insert into public.verification_actions (business_id,verification_run_id,payment_id,actor_id,revision,previous_status,new_status) values ('f1000000-0000-0000-0000-000000000002','f2000000-0000-0000-0000-000000000002','f3000000-0000-0000-0000-000000000001','f0000000-0000-0000-0000-000000000001',99,'NEEDS_REVIEW','VERIFIED')$$,'23503',null,'database rejects cross-business audit association');
select throws_ok($$insert into public.verification_actions (business_id,verification_run_id,payment_id,actor_id,revision,previous_status,new_status) values ('f1000000-0000-0000-0000-000000000001','f2000000-0000-0000-0000-000000000003','f3000000-0000-0000-0000-000000000001','f0000000-0000-0000-0000-000000000001',99,'NEEDS_REVIEW','VERIFIED')$$,'23503',null,'database rejects cross-run audit association');
select throws_ok($$update public.payment_matches set status='CASH',reason='CASH_PAYMENT' where payment_id='f3000000-0000-0000-0000-000000000001'$$,'22023',null,'reviewed automated result is protected');
set role authenticated;
set request.jwt.claim.sub='f0000000-0000-0000-0000-000000000004';
select lives_ok($$select public.review_payment('f1000000-0000-0000-0000-000000000001','f2000000-0000-0000-0000-000000000001','f3000000-0000-0000-0000-000000000001','NEEDS_REVIEW','Admin reaffirmed',2)$$,'admin can reaffirm a review decision');
select is((select actor_id from public.verification_actions where revision=3),'f0000000-0000-0000-0000-000000000004'::uuid,'admin actor recorded correctly');
reset role;
select * from finish();
rollback;
