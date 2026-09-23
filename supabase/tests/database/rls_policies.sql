begin;
select plan(26);

insert into auth.users (id, email, encrypted_password, email_confirmed_at)
values
  ('a0000000-0000-0000-0000-000000000001', 'alice@test.com', crypt('password1', gen_salt('bf')), now()),
  ('b0000000-0000-0000-0000-000000000002', 'bob@test.com', crypt('password2', gen_salt('bf')), now()),
  ('c0000000-0000-0000-0000-000000000003', 'charlie@test.com', crypt('password3', gen_salt('bf')), now());

insert into public.businesses (id, name, created_by)
values
  ('a1000000-0000-0000-0000-000000000001', 'Business A', 'a0000000-0000-0000-0000-000000000001'),
  ('b1000000-0000-0000-0000-000000000002', 'Business B', 'b0000000-0000-0000-0000-000000000002');

insert into public.business_members (business_id, user_id, role)
values
  ('a1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'owner'),
  ('b1000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000002', 'owner');

insert into public.verification_runs (id, business_id, requested_by, status)
values
  ('a2000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'queued'),
  ('b2000000-0000-0000-0000-000000000002', 'b1000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000002', 'queued');

set role anon;
select throws_ok(
  $$select id from public.businesses limit 1$$,
  42501,
  null,
  'anonymous user denied businesses'
);
select throws_ok(
  $$select id from public.payments limit 1$$,
  42501,
  null,
  'anonymous user denied payments'
);
select throws_ok(
  $$select id from public.gcash_transactions limit 1$$,
  42501,
  null,
  'anonymous user denied GCash transactions'
);
reset role;

set role authenticated;
set request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000001';
select is(
  (select count(*) from public.businesses where name = 'Business A'),
  1::bigint,
  'Alice reads Business A'
);
select lives_ok(
  $$insert into public.payments (
      id, verification_run_id, business_id, imported_by, customer, amount, method, row_index
    ) values (
      'a3000000-0000-0000-0000-000000000001',
      'a2000000-0000-0000-0000-000000000001',
      'a1000000-0000-0000-0000-000000000001',
      'a0000000-0000-0000-0000-000000000001',
      'Alice Customer', 1000.00, 'GCASH', 2
    )$$,
  'same-business payment association succeeds'
);
select lives_ok(
  $$insert into public.gcash_transactions (
      id, verification_run_id, business_id, imported_by, reference_number,
      amount, direction, row_index, reference_occurrence_count
    ) values (
      'a4000000-0000-0000-0000-000000000001',
      'a2000000-0000-0000-0000-000000000001',
      'a1000000-0000-0000-0000-000000000001',
      'a0000000-0000-0000-0000-000000000001',
      '0000203966985', 1000.00, 'incoming', 2, 1
    )$$,
  'same-business GCash association succeeds'
);
select throws_ok(
  $$insert into public.payments (
      verification_run_id, business_id, imported_by, customer, amount, method, row_index
    ) values (
      'b2000000-0000-0000-0000-000000000002',
      'a1000000-0000-0000-0000-000000000001',
      'a0000000-0000-0000-0000-000000000001',
      'Cross Tenant', 10.00, 'GCASH', 3
    )$$,
  23503,
  null,
  'cross-business payment/run association denied'
);
select throws_ok(
  $$insert into public.gcash_transactions (
      verification_run_id, business_id, imported_by, reference_number,
      amount, direction, row_index
    ) values (
      'b2000000-0000-0000-0000-000000000002',
      'a1000000-0000-0000-0000-000000000001',
      'a0000000-0000-0000-0000-000000000001',
      'CROSS', 10.00, 'unknown', 3
    )$$,
  23503,
  null,
  'cross-business GCash/run association denied'
);
select throws_ok(
  $$update public.payments
    set verification_run_id = 'b2000000-0000-0000-0000-000000000002'
    where id = 'a3000000-0000-0000-0000-000000000001'$$,
  23503,
  null,
  'payment cannot be moved to another business run'
);
select throws_ok(
  $$update public.gcash_transactions
    set verification_run_id = 'b2000000-0000-0000-0000-000000000002'
    where id = 'a4000000-0000-0000-0000-000000000001'$$,
  23503,
  null,
  'GCash transaction cannot be moved to another business run'
);
select throws_ok(
  $$select public.create_payment_import(
      'a1000000-0000-0000-0000-000000000001',
      '[{"customer":"Rollback Test","amount":"10.00","method":"INVALID","row_index":4,"raw_data":{}}]'::jsonb
    )$$,
  '22P02',
  null,
  'invalid atomic payment import fails'
);
select is(
  (select count(*) from public.verification_runs where business_id = 'a1000000-0000-0000-0000-000000000001'),
  1::bigint,
  'failed payment import rolls back its verification run'
);
select is(
  (select count(*) from public.payments where business_id = 'a1000000-0000-0000-0000-000000000001'),
  1::bigint,
  'failed payment import leaves no partial payments'
);
reset role;

set role authenticated;
set request.jwt.claim.sub = 'b0000000-0000-0000-0000-000000000002';
select is(
  (select count(*) from public.verification_runs where business_id = 'a1000000-0000-0000-0000-000000000001'),
  0::bigint,
  'Bob cannot read Business A verification runs'
);
select is(
  (select count(*) from public.payments where business_id = 'a1000000-0000-0000-0000-000000000001'),
  0::bigint,
  'Bob cannot read Business A payments'
);
select is(
  (select count(*) from public.gcash_transactions where business_id = 'a1000000-0000-0000-0000-000000000001'),
  0::bigint,
  'Bob cannot read Business A GCash transactions'
);
select is_empty(
  $$update public.payments set notes = 'unauthorized'
    where id = 'a3000000-0000-0000-0000-000000000001' returning id$$,
  'Bob cannot modify Business A payments'
);
select is_empty(
  $$delete from public.gcash_transactions
    where id = 'a4000000-0000-0000-0000-000000000001' returning id$$,
  'Bob cannot delete Business A GCash transactions'
);
reset role;

set role authenticated;
set request.jwt.claim.sub = 'c0000000-0000-0000-0000-000000000003';
select lives_ok(
  $$select public.create_business('Business C')$$,
  'authenticated user can create a business'
);
select is(
  (select count(*) from public.business_members
   where user_id = 'c0000000-0000-0000-0000-000000000003'
     and role = 'owner'),
  1::bigint,
  'create_business creates owner membership'
);
reset role;

-- ----- Sprint 1 remediation: multi-workspace isolation -----

set role authenticated;
set request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000001';
select throws_ok(
  $$insert into public.verification_runs (business_id, requested_by, status)
    values ('b1000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'queued')$$,
  42501,
  null,
  'Alice cannot create a verification run in Bob business'
);
select throws_ok(
  $$insert into public.payments (
      verification_run_id, business_id, imported_by, customer, amount, method, row_index
    ) values (
      'b2000000-0000-0000-0000-000000000002',
      'b1000000-0000-0000-0000-000000000002',
      'a0000000-0000-0000-0000-000000000001',
      'Cross Tenant', 10.00, 'GCASH', 4
    )$$,
  42501,
  null,
  'Alice cannot import payments into Bob business'
);
select throws_ok(
  $$insert into public.gcash_transactions (
      verification_run_id, business_id, imported_by, reference_number,
      amount, direction, row_index
    ) values (
      'b2000000-0000-0000-0000-000000000002',
      'b1000000-0000-0000-0000-000000000002',
      'a0000000-0000-0000-0000-000000000001',
      'SNEAKY', 10.00, 'unknown', 4
    )$$,
  42501,
  null,
  'Alice cannot import GCash into Bob business'
);
select throws_ok(
  $$select public.create_payment_import(
      'b1000000-0000-0000-0000-000000000002',
      '[{"customer":"Sneaky","amount":"10.00","method":"GCASH","row_index":5,"raw_data":{}}]'::jsonb
    )$$,
  42501,
  null,
  'Alice cannot import payments into Bob business via RPC'
);
reset role;
select is(
  (select count(*) from public.verification_runs where business_id = 'b1000000-0000-0000-0000-000000000002'),
  1::bigint,
  'Alice import attempt added no verification run to Bob business'
);
select is(
  (select count(*) from public.payments where business_id = 'b1000000-0000-0000-0000-000000000002'),
  0::bigint,
  'Alice import attempt added no payments to Bob business'
);

select * from finish();
rollback;
