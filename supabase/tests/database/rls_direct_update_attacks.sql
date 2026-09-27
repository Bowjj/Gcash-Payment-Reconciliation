begin;
select plan(19);

insert into auth.users (id, email, encrypted_password, email_confirmed_at)
values
  ('71000000-0000-0000-0000-000000000001', 'rls-owner@test.com', crypt('password1', gen_salt('bf')), now()),
  ('72000000-0000-0000-0000-000000000002', 'rls-member@test.com', crypt('password2', gen_salt('bf')), now());

insert into public.businesses (id, name, created_by)
values
  ('71100000-0000-0000-0000-000000000001', 'RLS Workspace A', '71000000-0000-0000-0000-000000000001'),
  ('71200000-0000-0000-0000-000000000002', 'RLS Workspace B', '71000000-0000-0000-0000-000000000001');

insert into public.business_members (business_id, user_id, role)
values
  ('71100000-0000-0000-0000-000000000001', '71000000-0000-0000-0000-000000000001', 'owner'),
  ('71200000-0000-0000-0000-000000000002', '71000000-0000-0000-0000-000000000001', 'owner'),
  ('71100000-0000-0000-0000-000000000001', '72000000-0000-0000-0000-000000000002', 'member');

insert into public.verification_runs (id, business_id, requested_by, status)
values
  ('71300000-0000-0000-0000-000000000001', '71100000-0000-0000-0000-000000000001', '71000000-0000-0000-0000-000000000001', 'queued'),
  ('71400000-0000-0000-0000-000000000002', '71200000-0000-0000-0000-000000000002', '71000000-0000-0000-0000-000000000001', 'queued');

insert into public.payments (id, verification_run_id, business_id, imported_by, customer, amount, method, row_index)
values ('71500000-0000-0000-0000-000000000001', '71300000-0000-0000-0000-000000000001', '71100000-0000-0000-0000-000000000001', '71000000-0000-0000-0000-000000000001', 'RLS Customer', 1.00, 'GCASH', 1);

insert into public.gcash_transactions (id, verification_run_id, business_id, imported_by, reference_number, amount, row_index)
values ('71600000-0000-0000-0000-000000000001', '71300000-0000-0000-0000-000000000001', '71100000-0000-0000-0000-000000000001', '71000000-0000-0000-0000-000000000001', 'RLS-REFERENCE', 1.00, 1);

set role authenticated;
set request.jwt.claim.sub = '71000000-0000-0000-0000-000000000001';

select is((select count(*) from public.businesses), 2::bigint, 'owner retains workspace reads');
select is((select count(*) from public.business_members), 3::bigint, 'owner retains membership reads');
select is((select count(*) from public.verification_runs), 2::bigint, 'owner retains run reads');
select is((select count(*) from public.payments), 1::bigint, 'owner retains payment reads');
select is((select count(*) from public.gcash_transactions), 1::bigint, 'owner retains GCash reads');

select throws_ok($$update public.businesses set created_by = '72000000-0000-0000-0000-000000000002' where id = '71100000-0000-0000-0000-000000000001'$$, '42501', null, 'same-workspace business tampering is denied');
select throws_ok($$update public.business_members set business_id = '71200000-0000-0000-0000-000000000002' where business_id = '71100000-0000-0000-0000-000000000001' and user_id = '72000000-0000-0000-0000-000000000002'$$, '42501', null, 'membership reassignment across workspaces is denied');
select throws_ok($$update public.business_members set role = 'admin' where business_id = '71100000-0000-0000-0000-000000000001' and user_id = '72000000-0000-0000-0000-000000000002'$$, '42501', null, 'same-workspace membership tampering is denied');
select throws_ok($$update public.verification_runs set business_id = '71200000-0000-0000-0000-000000000002' where id = '71300000-0000-0000-0000-000000000001'$$, '42501', null, 'run reassignment across workspaces is denied');
select throws_ok($$update public.verification_runs set status = 'running', started_at = now() where id = '71300000-0000-0000-0000-000000000001'$$, '42501', null, 'same-workspace run tampering is denied');
select throws_ok($$update public.payments set business_id = '71200000-0000-0000-0000-000000000002', verification_run_id = '71400000-0000-0000-0000-000000000002' where id = '71500000-0000-0000-0000-000000000001'$$, '42501', null, 'paired payment business and run reassignment is denied');
select throws_ok($$update public.payments set notes = 'tampered' where id = '71500000-0000-0000-0000-000000000001'$$, '42501', null, 'same-workspace payment tampering is denied');
select throws_ok($$update public.gcash_transactions set business_id = '71200000-0000-0000-0000-000000000002', verification_run_id = '71400000-0000-0000-0000-000000000002' where id = '71600000-0000-0000-0000-000000000001'$$, '42501', null, 'paired GCash business and run reassignment is denied');
select throws_ok($$update public.gcash_transactions set description = 'tampered' where id = '71600000-0000-0000-0000-000000000001'$$, '42501', null, 'same-workspace GCash tampering is denied');

select lives_ok($$delete from public.gcash_transactions where id = '71600000-0000-0000-0000-000000000001'$$, 'owner retains GCash deletion');
select lives_ok($$delete from public.payments where id = '71500000-0000-0000-0000-000000000001'$$, 'owner retains payment deletion');
select lives_ok($$delete from public.business_members where business_id = '71100000-0000-0000-0000-000000000001' and user_id = '72000000-0000-0000-0000-000000000002'$$, 'owner retains membership deletion');
select lives_ok($$delete from public.verification_runs where id = '71400000-0000-0000-0000-000000000002'$$, 'owner retains run deletion');
select lives_ok($$delete from public.businesses where id = '71200000-0000-0000-0000-000000000002'$$, 'owner retains workspace deletion');

reset role;
select * from finish();
rollback;
