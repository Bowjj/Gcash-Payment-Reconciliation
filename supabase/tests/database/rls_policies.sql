-- pgTAP policy tests for Sprint 1 schema
-- Run with: supabase test db
-- Requires pgTAP extension

begin;
select plan(12);

-- ============================================================
-- Setup: create test users and workspaces
-- ============================================================

-- Create two test users via auth.users inserts
insert into auth.users (id, email, encrypted_password, email_confirmed_at)
values
  ('a0000000-0000-0000-0000-000000000001', 'alice@test.com', crypt('password1', gen_salt('bf')), now()),
  ('b0000000-0000-0000-0000-000000000002', 'bob@test.com', crypt('password2', gen_salt('bf')), now());

-- Create workspaces via the RPC (tests the create_business function)
select public.create_business('Business A');
select public.create_business('Business B');

-- Add Bob as member of Business B (he is already owner of B from create_business,
-- so let's make Alice a member of Business B for cross-business testing)
insert into public.business_members (business_id, user_id, role)
select id, 'a0000000-0000-0000-0000-000000000001', 'member'
from public.businesses where name = 'Business B';

-- ============================================================
-- 1. Anonymous access denied
-- ============================================================

-- Reset role to anon
set role anon;

select throws_ok(
  $$select id from public.businesses limit 1$$,
  42501,
  'anonymous user denied select on businesses'
);

select throws_ok(
  $$select business_id from public.business_members limit 1$$,
  42501,
  'anonymous user denied select on business_members'
);

select throws_ok(
  $$select id from public.verification_runs limit 1$$,
  42501,
  'anonymous user denied select on verification_runs'
);

reset role;

-- ============================================================
-- 2. Authenticated non-member denied access to Business A
-- ============================================================

set role authenticated;
set request.jwt.claim.sub = 'b0000000-0000-0000-0000-000000000002';

-- Bob should NOT see Business A
select is(
  (select count(*) from public.businesses where name = 'Business A'),
  0::bigint,
  'non-member Bob cannot see Business A'
);

reset role;

-- ============================================================
-- 3. Member can read own business data
-- ============================================================

set role authenticated;
set request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000001';

-- Alice is owner of A and member of B
select is(
  (select count(*) from public.businesses where name in ('Business A', 'Business B')),
  2::bigint,
  'Alice can see both her owned and member businesses'
);

reset role;

-- ============================================================
-- 4. Owner can delete business
-- ============================================================

set role authenticated;
set request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000001';

-- Alice owns Business A, should be able to delete it
select lives_ok(
  $$delete from public.businesses where name = 'Business A'$$,
  'owner can delete own business'
);

reset role;

-- ============================================================
-- 5. create_business creates both business and owner membership atomically
-- ============================================================

set role authenticated;
set request.jwt.claim.sub = 'c0000000-0000-0000-0000-000000000003';

-- Insert a third user
insert into auth.users (id, email, encrypted_password, email_confirmed_at)
values ('c0000000-0000-0000-0000-000000000003', 'charlie@test.com', crypt('password3', gen_salt('bf')), now());

select lives_ok(
  $$select public.create_business('Business C')$$,
  'create_business succeeds for authenticated user'
);

-- Verify both business and membership were created
select is(
  (select count(*) from public.businesses where name = 'Business C'),
  1::bigint,
  'create_business created the business'
);

select is(
  (select count(*) from public.business_members
   where business_id = (select id from public.businesses where name = 'Business C')
     and user_id = 'c0000000-0000-0000-0000-000000000003'
     and role = 'owner'),
  1::bigint,
  'create_business created owner membership'
);

reset role;

-- ============================================================
-- 6. Verification run constraints
-- ============================================================

set role authenticated;
set request.jwt.claim.sub = 'c0000000-0000-0000-0000-000000000003';

-- Insert a queued run
insert into public.verification_runs (business_id, requested_by, status)
select id, 'c0000000-0000-0000-0000-000000000003', 'queued'
from public.businesses where name = 'Business C';

-- Try to insert a completed run without started_at — should fail
select throws_ok(
  $$insert into public.verification_runs (business_id, requested_by, status, completed_at)
    select id, 'c0000000-0000-0000-0000-000000000003', 'succeeded', now()
    from public.businesses where name = 'Business C'$$,
  23514,
  'cannot insert succeeded run without started_at'
);

reset role;

select * from finish();
rollback;
