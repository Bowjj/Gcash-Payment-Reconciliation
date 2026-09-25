begin;
select plan(14);
insert into auth.users (id,email) values
 ('a6000000-0000-4000-8000-000000000001','export-owner@test.com'),
 ('a6000000-0000-4000-8000-000000000002','export-member@test.com'),
 ('a6000000-0000-4000-8000-000000000003','export-other@test.com');
insert into public.businesses (id,name,created_by) values
 ('a6100000-0000-4000-8000-000000000001','Export A','a6000000-0000-4000-8000-000000000001'),
 ('a6100000-0000-4000-8000-000000000002','Export B','a6000000-0000-4000-8000-000000000003');
insert into public.business_members (business_id,user_id,role) values
 ('a6100000-0000-4000-8000-000000000001','a6000000-0000-4000-8000-000000000001','owner'),
 ('a6100000-0000-4000-8000-000000000001','a6000000-0000-4000-8000-000000000002','member'),
 ('a6100000-0000-4000-8000-000000000002','a6000000-0000-4000-8000-000000000003','owner');
insert into public.verification_runs (id,business_id,requested_by,status,started_at,completed_at) values
 ('a6200000-0000-4000-8000-000000000001','a6100000-0000-4000-8000-000000000001','a6000000-0000-4000-8000-000000000001','succeeded',now(),now()),
 ('a6200000-0000-4000-8000-000000000002','a6100000-0000-4000-8000-000000000002','a6000000-0000-4000-8000-000000000003','succeeded',now(),now()),
 ('a6200000-0000-4000-8000-000000000003','a6100000-0000-4000-8000-000000000001','a6000000-0000-4000-8000-000000000001','succeeded',now(),now());
insert into public.payments (id,business_id,verification_run_id,imported_by,customer,amount,method,reference_number,row_index) values
 ('a6300000-0000-4000-8000-000000000001','a6100000-0000-4000-8000-000000000001','a6200000-0000-4000-8000-000000000001','a6000000-0000-4000-8000-000000000001','Jake Tirana',1300,'GCASH','0045276500984',2),
 ('a6300000-0000-4000-8000-000000000002','a6100000-0000-4000-8000-000000000001','a6200000-0000-4000-8000-000000000001','a6000000-0000-4000-8000-000000000001','Manual Only',1000,'GCASH','MANUAL',3),
 ('a6300000-0000-4000-8000-000000000003','a6100000-0000-4000-8000-000000000002','a6200000-0000-4000-8000-000000000002','a6000000-0000-4000-8000-000000000003','Foreign Business',1300,'GCASH','0045276500984',2),
 ('a6300000-0000-4000-8000-000000000004','a6100000-0000-4000-8000-000000000001','a6200000-0000-4000-8000-000000000003','a6000000-0000-4000-8000-000000000001','Different Run',1300,'GCASH','0045276500984',2);
insert into public.gcash_transactions (id,business_id,verification_run_id,imported_by,amount,reference_number,row_index) values
 ('a6400000-0000-4000-8000-000000000001','a6100000-0000-4000-8000-000000000001','a6200000-0000-4000-8000-000000000001','a6000000-0000-4000-8000-000000000001',1299,'0045276500984',2),
 ('a6400000-0000-4000-8000-000000000002','a6100000-0000-4000-8000-000000000002','a6200000-0000-4000-8000-000000000002','a6000000-0000-4000-8000-000000000003',1299,'0045276500984',2),
 ('a6400000-0000-4000-8000-000000000003','a6100000-0000-4000-8000-000000000001','a6200000-0000-4000-8000-000000000003','a6000000-0000-4000-8000-000000000001',1299,'0045276500984',2);
insert into public.payment_matches (payment_id,business_id,verification_run_id,status,reason,gcash_transaction_id)
 select p.id,p.business_id,p.verification_run_id,'VERIFIED','REFERENCE_MATCH',g.id
 from public.payments p join public.gcash_transactions g on g.business_id=p.business_id and g.verification_run_id=p.verification_run_id
 where p.id in ('a6300000-0000-4000-8000-000000000001','a6300000-0000-4000-8000-000000000003','a6300000-0000-4000-8000-000000000004');
insert into public.payment_matches (payment_id,business_id,verification_run_id,status,reason) values
 ('a6300000-0000-4000-8000-000000000002','a6100000-0000-4000-8000-000000000001','a6200000-0000-4000-8000-000000000001','NEEDS_REVIEW','REFERENCE_NOT_FOUND');

set role anon;
select throws_ok($$select public.get_verification_export('a6100000-0000-4000-8000-000000000001','a6200000-0000-4000-8000-000000000001')$$,'42501',null,'anonymous export denied');
reset role;
set role authenticated;
set request.jwt.claim.sub='a6000000-0000-4000-8000-000000000001';
select public.review_payment('a6100000-0000-4000-8000-000000000001','a6200000-0000-4000-8000-000000000001','a6300000-0000-4000-8000-000000000002','VERIFIED','Confirmed manually',0);
set request.jwt.claim.sub='a6000000-0000-4000-8000-000000000002';
select lives_ok($$select public.get_verification_export('a6100000-0000-4000-8000-000000000001','a6200000-0000-4000-8000-000000000001')$$,'read-only member may export permitted run');
select set_config('test.export',public.get_verification_export('a6100000-0000-4000-8000-000000000001','a6200000-0000-4000-8000-000000000001')::text,true);
select is(jsonb_array_length(current_setting('test.export')::jsonb->'payments'),2,'export contains only selected run payments');
select is(jsonb_array_length(current_setting('test.export')::jsonb->'gcash'),1,'export contains only selected run GCash');
select is(current_setting('test.export')::jsonb#>>'{payments,0,reference_number}','0045276500984','leading zeros survive snapshot');
select is(current_setting('test.export')::jsonb#>>'{gcash,0,matched_customer}','Jake Tirana','persisted 1300/1299 relationship is exported');
select is(current_setting('test.export')::jsonb#>>'{payments,1,automated_status}','NEEDS_REVIEW','manual-only automated decision retained');
select is(current_setting('test.export')::jsonb#>>'{payments,1,effective_status}','VERIFIED','latest manual decision exported');
select is(current_setting('test.export')::jsonb#>>'{payments,1,gcash_transaction_id}',null::text,'manual-only decision creates no GCash link');
select is((current_setting('test.export')::jsonb#>>'{run,verified}')::integer,2,'summary uses effective status from same snapshot');
select throws_ok($$select public.get_verification_export('a6100000-0000-4000-8000-000000000002','a6200000-0000-4000-8000-000000000002')$$,'42501',null,'foreign business export denied');
select throws_ok($$select public.get_verification_export('a6100000-0000-4000-8000-000000000001','a6200000-0000-4000-8000-000000000002')$$,'42501',null,'run UUID manipulation denied');
reset role;
insert into public.payments (business_id,verification_run_id,imported_by,customer,amount,method,row_index)
 select 'a6100000-0000-4000-8000-000000000001','a6200000-0000-4000-8000-000000000001','a6000000-0000-4000-8000-000000000001','Bulk '||n,1,'CASH',n+10 from generate_series(1,1001) n;
insert into public.payment_matches (payment_id,business_id,verification_run_id,status,reason)
 select id,business_id,verification_run_id,'CASH','CASH_PAYMENT' from public.payments
 where business_id='a6100000-0000-4000-8000-000000000001' and verification_run_id='a6200000-0000-4000-8000-000000000001' and method='CASH';
set role authenticated;
set request.jwt.claim.sub='a6000000-0000-4000-8000-000000000002';
select is(jsonb_array_length(public.get_verification_export('a6100000-0000-4000-8000-000000000001','a6200000-0000-4000-8000-000000000001')->'payments'),1003,'export snapshot exceeds API row limits without truncation');
reset role;
insert into public.payments (business_id,verification_run_id,imported_by,customer,amount,method,row_index)
 values ('a6100000-0000-4000-8000-000000000001','a6200000-0000-4000-8000-000000000001','a6000000-0000-4000-8000-000000000001','Unreconciled',1,'CASH',9999);
set role authenticated;
set request.jwt.claim.sub='a6000000-0000-4000-8000-000000000002';
select throws_ok($$select public.get_verification_export('a6100000-0000-4000-8000-000000000001','a6200000-0000-4000-8000-000000000001')$$,'22023',null,'incomplete persisted results cannot produce a partial export');
reset role;
select * from finish();
rollback;
