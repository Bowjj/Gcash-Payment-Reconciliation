begin;
select plan(13);
insert into auth.users (id, email) values
  ('d0000000-0000-0000-0000-000000000001', 'dual-member@test.com'),
  ('d0000000-0000-0000-0000-000000000002', 'dual-owner@test.com');
insert into public.businesses (id, name, created_by) values
  ('d1000000-0000-0000-0000-000000000001', 'Dual A', 'd0000000-0000-0000-0000-000000000002'),
  ('d1000000-0000-0000-0000-000000000002', 'Dual B', 'd0000000-0000-0000-0000-000000000002');
insert into public.business_members (business_id, user_id, role) values
  ('d1000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 'member');
set local test.payments = '[{"customer":"Source","amount":"100.25","method":"GCASH","reference_number":"000123","row_index":2}]';
set local test.gcash = '[{"amount":"100.25","direction":"unknown","reference_number":"000123","reference_occurrence_count":1,"row_index":2}]';

set role anon;
select throws_ok($$select public.create_dual_file_import(
  'd1000000-0000-0000-0000-000000000001', 'd2000000-0000-0000-0000-000000000001',
  current_setting('test.payments')::jsonb, current_setting('test.gcash')::jsonb)$$,
  '42501', null, 'anonymous cannot import a pair');
reset role;
set role authenticated;
set request.jwt.claim.sub = 'd0000000-0000-0000-0000-000000000001';
select throws_ok($$select public.create_dual_file_import(
  'd1000000-0000-0000-0000-000000000002', 'd2000000-0000-0000-0000-000000000001',
  current_setting('test.payments')::jsonb, current_setting('test.gcash')::jsonb)$$,
  '42501', null, 'non-member cannot target another business');
select throws_ok($$select public.create_dual_file_import(
  'd1000000-0000-0000-0000-000000000001', 'd2000000-0000-0000-0000-000000000001',
  current_setting('test.payments')::jsonb, '[]'::jsonb)$$,
  '22023', null, 'both datasets are required');
select throws_ok($$select public.create_dual_file_import(
  'd1000000-0000-0000-0000-000000000001', 'd2000000-0000-0000-0000-000000000001',
  current_setting('test.payments')::jsonb, '[{"amount":"bad","direction":"unknown","row_index":2}]'::jsonb)$$,
  '22P02', null, 'GCash failure rolls back the entire pair');
select is((select count(*) from public.verification_runs), 0::bigint, 'no run left after failure');
select is((select count(*) from public.payments), 0::bigint, 'no payments left after failure');
select is((select count(*) from public.gcash_transactions), 0::bigint, 'no GCash left after failure');
select lives_ok($$select public.create_dual_file_import(
  'd1000000-0000-0000-0000-000000000001', 'd2000000-0000-0000-0000-000000000001',
  current_setting('test.payments')::jsonb, current_setting('test.gcash')::jsonb)$$,
  'ordinary member can atomically import both datasets');
select is((select count(*) from public.payments p join public.gcash_transactions g
  on p.verification_run_id = g.verification_run_id and p.business_id = g.business_id
  where p.reference_number = '000123' and g.reference_number = '000123'
    and p.amount = 100.25 and g.amount = 100.25), 1::bigint,
  'same run and business preserve exact money and identifiers');
select is(public.create_dual_file_import(
  'd1000000-0000-0000-0000-000000000001', 'd2000000-0000-0000-0000-000000000001',
  current_setting('test.payments')::jsonb, current_setting('test.gcash')::jsonb),
  (select id from public.verification_runs where import_session_id = 'd2000000-0000-0000-0000-000000000001'),
  'retry returns the same run');
select is((select count(*) from public.verification_runs), 1::bigint, 'retry creates no extra runs');
select is((select count(*) from public.payments), 1::bigint, 'retry creates no extra payments');
select is((select count(*) from public.gcash_transactions), 1::bigint, 'retry creates no extra GCash');
reset role;
select * from finish();
rollback;
