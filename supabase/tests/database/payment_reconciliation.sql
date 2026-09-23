begin;
select plan(34);
insert into auth.users (id, email) values
  ('e0000000-0000-0000-0000-000000000001', 'reconcile-a@test.com'),
  ('e0000000-0000-0000-0000-000000000002', 'reconcile-b@test.com');
insert into public.businesses (id, name, created_by) values
  ('e1000000-0000-0000-0000-000000000001', 'Reconcile A', 'e0000000-0000-0000-0000-000000000001'),
  ('e1000000-0000-0000-0000-000000000002', 'Reconcile B', 'e0000000-0000-0000-0000-000000000002');
insert into public.business_members (business_id, user_id, role) values
  ('e1000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001', 'member'),
  ('e1000000-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-000000000002', 'owner');
insert into public.verification_runs (id, business_id, requested_by) values
  ('e2000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001'),
  ('e2000000-0000-0000-0000-000000000002', 'e1000000-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-000000000002'),
  ('e2000000-0000-0000-0000-000000000003', 'e1000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001');

insert into public.payments (id, business_id, verification_run_id, imported_by, customer, amount, method, reference_number, row_index)
select ('e3000000-0000-0000-0000-' || lpad(n::text,12,'0'))::uuid,
  'e1000000-0000-0000-0000-000000000001', 'e2000000-0000-0000-0000-000000000001',
  'e0000000-0000-0000-0000-000000000001', customer, amount, method::public.payment_method, ref, n
from (values
  (1, 'Jake', 1000, 'GCASH', '0045276500984'),
  (2, 'Different Amount', 1300, 'GCASH', 'ABC123456'),
  (3, 'Missing', 1000, 'GCASH', null),
  (4, 'Not Found', 1000, 'GCASH', '999999999'),
  (5, 'Duplicate Statement', 1000, 'GCASH', 'DUP-G'),
  (6, 'Cash Customer', 1000, 'CASH', null),
  (7, 'Bank Customer', 1000, 'BANK', 'ABC123456'),
  (8, 'Duplicate Payment A', 1000, 'GCASH', 'DUP-P'),
  (9, 'Duplicate Payment B', 999, 'GCASH', 'DUP-P'),
  (10, 'Leading Zero', 1000, 'GCASH', '0000203966985')
) v(n, customer, amount, method, ref);
insert into public.gcash_transactions (id, business_id, verification_run_id, imported_by, amount, reference_number, row_index, raw_data)
select ('e4000000-0000-0000-0000-' || lpad(n::text,12,'0'))::uuid,
  'e1000000-0000-0000-0000-000000000001', 'e2000000-0000-0000-0000-000000000001',
  'e0000000-0000-0000-0000-000000000001', amount, ref, n, '{"source":{"original":"untouched"},"sheet_name":"GCash","source_order":0}'::jsonb
from (values (1,1000,'0045276500984'), (2,1299,'ABC123456'), (3,1000,'DUP-G'), (4,999,'DUP-G'),
  (5,1000,'DUP-P'), (6,1000,'0000203966985'), (7,1000,'UNMATCHED')) v(n,amount,ref);
insert into public.gcash_transactions (id, business_id, verification_run_id, imported_by, amount, reference_number, row_index) values
  ('e4000000-0000-0000-0000-000000000008', 'e1000000-0000-0000-0000-000000000002', 'e2000000-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-000000000002', 1000, '0045276500984', 1),
  ('e4000000-0000-0000-0000-000000000009', 'e1000000-0000-0000-0000-000000000001', 'e2000000-0000-0000-0000-000000000003', 'e0000000-0000-0000-0000-000000000001', 1000, '0045276500984', 1);

select set_config('test.results', (select jsonb_agg(jsonb_build_object(
  'payment_id', 'e3000000-0000-0000-0000-' || lpad(n::text,12,'0'),
  'gcash_transaction_id', case when g is not null then 'e4000000-0000-0000-0000-' || lpad(g::text,12,'0') else null end,
  'status', status, 'reason', reason))::text from (values
  (1,1,'VERIFIED','REFERENCE_MATCH'), (2,2,'VERIFIED','REFERENCE_MATCH'),
  (3,null,'NEEDS_REVIEW','MISSING_REFERENCE'), (4,null,'NEEDS_REVIEW','REFERENCE_NOT_FOUND'),
  (5,null,'NEEDS_REVIEW','DUPLICATE_REFERENCE'), (6,null,'CASH','CASH_PAYMENT'),
  (7,null,'BANK','BANK_MANUAL_VERIFICATION'), (8,null,'NEEDS_REVIEW','DUPLICATE_PAYMENT_REFERENCE'),
  (9,null,'NEEDS_REVIEW','DUPLICATE_PAYMENT_REFERENCE'), (10,6,'VERIFIED','REFERENCE_MATCH')
) v(n,g,status,reason)), true);

set role anon;
select throws_ok($$select * from public.payment_matches$$, '42501', null, 'anonymous cannot read reconciliation');
select throws_ok($$select public.commit_reconciliation('e1000000-0000-0000-0000-000000000001', 'e2000000-0000-0000-0000-000000000001', current_setting('test.results')::jsonb)$$, '42501', null, 'anonymous cannot reconcile');
reset role;
set role authenticated;
set request.jwt.claim.sub = 'e0000000-0000-0000-0000-000000000001';
select throws_ok($$select public.commit_reconciliation('e1000000-0000-0000-0000-000000000002', 'e2000000-0000-0000-0000-000000000002', current_setting('test.results')::jsonb)$$, '42501', null, 'cannot reconcile another business');
select throws_ok($$select public.get_reconciliation_inputs('e1000000-0000-0000-0000-000000000001', 'e2000000-0000-0000-0000-000000000002')$$, '42501', null, 'cannot read another business run through snapshot RPC');
select throws_ok($$select public.commit_reconciliation('e1000000-0000-0000-0000-000000000001', 'e2000000-0000-0000-0000-000000000001', '[]'::jsonb)$$, '22023', null, 'incomplete or fabricated decisions rejected');
select is((select count(*) from public.payment_matches), 0::bigint, 'failed finalization creates no partial matches');
select is((select status::text from public.verification_runs where id='e2000000-0000-0000-0000-000000000001'), 'queued', 'failed finalization leaves run queued for retry');
select lives_ok($$select public.commit_reconciliation('e1000000-0000-0000-0000-000000000001', 'e2000000-0000-0000-0000-000000000001', current_setting('test.results')::jsonb)$$, 'ordinary member commits valid same-run matches');
select is((select count(*) from public.payment_matches), 10::bigint, 'member reads all workspace results');
select is((select status::text from public.payment_matches where payment_id='e3000000-0000-0000-0000-000000000002'), 'VERIFIED', '1300 payment and 1299 GCash are VERIFIED');
select is((select reason::text from public.payment_matches where payment_id='e3000000-0000-0000-0000-000000000002'), 'REFERENCE_MATCH', 'different amount has reference match reason');
select is((select matched_customer from public.gcash_reconciliation where id='e4000000-0000-0000-0000-000000000002'), 'Different Amount', 'matched customer is a structured source relationship');
select is((select matched_customer from public.gcash_reconciliation where id='e4000000-0000-0000-0000-000000000007'), null::text, 'unmatched GCash has no customer');
select is((select count(*) from public.gcash_reconciliation where reference_number in ('DUP-G','DUP-P') and matched_customer is not null), 0::bigint, 'neither duplicate ambiguity attaches customers');
select is((select reason::text from public.payment_matches where payment_id='e3000000-0000-0000-0000-000000000003'), 'MISSING_REFERENCE', 'missing reference is review');
select is((select reason::text from public.payment_matches where payment_id='e3000000-0000-0000-0000-000000000004'), 'REFERENCE_NOT_FOUND', 'unfound reference is review');
select is((select reason::text from public.payment_matches where payment_id='e3000000-0000-0000-0000-000000000005'), 'DUPLICATE_REFERENCE', 'duplicate statement is review');
select is((select reason::text from public.payment_matches where payment_id='e3000000-0000-0000-0000-000000000008'), 'DUPLICATE_PAYMENT_REFERENCE', 'duplicate payment is review');
select is((select status::text from public.payment_matches where payment_id='e3000000-0000-0000-0000-000000000006'), 'CASH', 'cash skips search');
select is((select status::text from public.payment_matches where payment_id='e3000000-0000-0000-0000-000000000007'), 'BANK', 'bank skips search despite matching GCash reference');
select is(public.commit_reconciliation('e1000000-0000-0000-0000-000000000001', 'e2000000-0000-0000-0000-000000000001', current_setting('test.results')::jsonb),
  '{"total":10,"verified":3,"needsReview":5,"cash":1,"bank":1}'::jsonb, 'rerun returns explicit status summary');
select is((select count(*) from public.payment_matches), 10::bigint, 'rerun has no duplicate logical results');
select is((select status::text from public.verification_runs where id='e2000000-0000-0000-0000-000000000001'), 'succeeded', 'completion persisted with results');
select is((select amount from public.gcash_transactions where id='e4000000-0000-0000-0000-000000000002'), 1299::numeric, 'original amount unchanged');
select is((select raw_data from public.gcash_transactions where id='e4000000-0000-0000-0000-000000000002'), '{"source":{"original":"untouched"},"sheet_name":"GCash","source_order":0}'::jsonb, 'original source and ordering unchanged');
set request.jwt.claim.sub = 'e0000000-0000-0000-0000-000000000002';
select is((select count(*) from public.payment_matches), 0::bigint, 'Business B cannot read Business A matches');
select is((select count(*) from public.gcash_reconciliation where business_id='e1000000-0000-0000-0000-000000000001'), 0::bigint, 'customer view preserves RLS');
select throws_ok($$update public.payment_matches set reason='REFERENCE_NOT_FOUND' where business_id='e1000000-0000-0000-0000-000000000001'$$, '42501', null, 'Business B cannot modify Business A matches');
reset role;
select throws_ok($$update public.payment_matches set gcash_transaction_id='e4000000-0000-0000-0000-000000000008' where payment_id='e3000000-0000-0000-0000-000000000001'$$, '23503', null, 'database rejects cross-business match');
select throws_ok($$update public.payment_matches set gcash_transaction_id='e4000000-0000-0000-0000-000000000009' where payment_id='e3000000-0000-0000-0000-000000000001'$$, '23503', null, 'database rejects cross-run match in same business');
select throws_ok($$update public.payment_matches set verification_run_id='e2000000-0000-0000-0000-000000000003' where payment_id='e3000000-0000-0000-0000-000000000001'$$, '23503', null, 'result cannot claim wrong payment run');
select throws_ok($$update public.payment_matches set business_id='e1000000-0000-0000-0000-000000000002' where payment_id='e3000000-0000-0000-0000-000000000001'$$, '23503', null, 'result cannot claim wrong payment business');
select throws_ok($$update public.payment_matches set status='VERIFIED', reason='REFERENCE_MATCH', gcash_transaction_id='e4000000-0000-0000-0000-000000000001' where payment_id='e3000000-0000-0000-0000-000000000003'$$, '23505', null, 'one GCash row cannot receive two customers');
insert into public.payments (business_id, verification_run_id, imported_by, customer, amount, method, row_index)
  select 'e1000000-0000-0000-0000-000000000001', 'e2000000-0000-0000-0000-000000000003',
    'e0000000-0000-0000-0000-000000000001', 'Bulk '||n, 1, 'CASH', n from generate_series(1,1001) n;
set role authenticated;
set request.jwt.claim.sub = 'e0000000-0000-0000-0000-000000000001';
select is(jsonb_array_length(public.get_reconciliation_inputs('e1000000-0000-0000-0000-000000000001', 'e2000000-0000-0000-0000-000000000003')->'payments'), 1001, 'snapshot is not truncated by REST row limits');
reset role;
select * from finish();
rollback;
