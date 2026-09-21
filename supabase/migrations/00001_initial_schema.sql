-- Sprint 1: Initial schema for businesses, business_members, verification_runs
-- Reference numbers are TEXT, never integer. Monetary amounts use NUMERIC, never float.
-- RLS is fail-closed: explicit allow per operation, deny by default.

-- ============================================================
-- 1. ENUMS
-- ============================================================

create type public.business_member_role as enum ('owner', 'admin', 'member');

create type public.verification_run_status as enum (
  'queued',
  'running',
  'succeeded',
  'failed'
);

-- ============================================================
-- 2. TABLES
-- ============================================================

create table public.businesses (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (length(btrim(name)) between 1 and 200),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.businesses is 'Tenant workspace. Multi-tenant isolation enforced via RLS.';

create table public.business_members (
  business_id uuid not null references public.businesses(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        public.business_member_role not null default 'member',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  primary key (business_id, user_id)
);

comment on table public.business_members is 'Membership junction. Owner role changes belong in dedicated RPCs only.';

create table public.verification_runs (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references public.businesses(id) on delete cascade,
  requested_by uuid not null references auth.users(id) on delete restrict,
  status       public.verification_run_status not null default 'queued',
  started_at   timestamptz,
  completed_at timestamptz,
  error_message text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  check (
    (status = 'queued' and started_at is null and completed_at is null)
    or status in ('running', 'succeeded', 'failed')
  ),
  check (completed_at is null or started_at is not null),
  check (status not in ('succeeded', 'failed') or completed_at is not null)
);

comment on table public.verification_runs is 'Placeholder for future payment reconciliation runs.';

-- ============================================================
-- 3. INDEXES
-- ============================================================

create index business_members_user_business_idx
  on public.business_members (user_id, business_id);

create index verification_runs_business_created_idx
  on public.verification_runs (business_id, created_at desc);

create index verification_runs_requested_by_idx
  on public.verification_runs (requested_by);

-- ============================================================
-- 4. UPDATED_AT TRIGGER
-- ============================================================

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger businesses_set_updated_at
  before update on public.businesses
  for each row execute function public.set_updated_at();

create trigger business_members_set_updated_at
  before update on public.business_members
  for each row execute function public.set_updated_at();

create trigger verification_runs_set_updated_at
  before update on public.verification_runs
  for each row execute function public.set_updated_at();

-- ============================================================
-- 5. PRIVATE SCHEMA — Recursion-safe membership lookup
-- ============================================================

create schema if not exists private;

create or replace function private.member_role(
  p_business_id uuid,
  p_user_id uuid
)
returns public.business_member_role
language sql
stable
security definer
set search_path = ''
as $$
  select bm.role
  from public.business_members bm
  where bm.business_id = p_business_id
    and bm.user_id = p_user_id
$$;

revoke all on function private.member_role(uuid, uuid) from public;
grant usage on schema private to authenticated;
grant execute on function private.member_role(uuid, uuid) to authenticated;

-- ============================================================
-- 6. PUBLIC RPC — Atomic workspace creation
-- ============================================================

create or replace function public.create_business(p_name text)
returns public.businesses
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_business public.businesses;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  insert into public.businesses (name, created_by)
  values (btrim(p_name), auth.uid())
  returning * into v_business;

  insert into public.business_members (business_id, user_id, role)
  values (v_business.id, auth.uid(), 'owner');

  return v_business;
end;
$$;

revoke all on function public.create_business(text) from public, anon;
grant execute on function public.create_business(text) to authenticated;

-- ============================================================
-- 7. ROW LEVEL SECURITY
-- ============================================================

alter table public.businesses enable row level security;
alter table public.business_members enable row level security;
alter table public.verification_runs enable row level security;

-- Revoke broad defaults, then grant scoped access
revoke all on public.businesses from anon, authenticated;
revoke all on public.business_members from anon, authenticated;
revoke all on public.verification_runs from anon, authenticated;

grant select, insert, update, delete
  on public.businesses, public.business_members, public.verification_runs
  to authenticated;

-- ----- Businesses -----

create policy businesses_select_member
  on public.businesses for select
  to authenticated
  using (
    private.member_role(id, (select auth.uid())) is not null
  );

create policy businesses_update_owner
  on public.businesses for update
  to authenticated
  using (
    private.member_role(id, (select auth.uid())) = 'owner'
  )
  with check (
    id = id
    and created_by = created_by
  );

create policy businesses_delete_owner
  on public.businesses for delete
  to authenticated
  using (
    private.member_role(id, (select auth.uid())) = 'owner'
  );

-- ----- Business Members -----

create policy business_members_select_member
  on public.business_members for select
  to authenticated
  using (
    private.member_role(business_id, (select auth.uid())) is not null
  );

create policy business_members_insert_admin
  on public.business_members for insert
  to authenticated
  with check (
    private.member_role(business_id, (select auth.uid()))
      in ('owner', 'admin')
    and role <> 'owner'
  );

create policy business_members_update_admin
  on public.business_members for update
  to authenticated
  using (
    private.member_role(business_id, (select auth.uid()))
      in ('owner', 'admin')
  )
  with check (
    business_id = business_id
    and user_id = user_id
    and role <> 'owner'
  );

create policy business_members_delete_admin
  on public.business_members for delete
  to authenticated
  using (
    private.member_role(business_id, (select auth.uid()))
      in ('owner', 'admin')
    and role <> 'owner'
  );

-- ----- Verification Runs -----

create policy verification_runs_select_member
  on public.verification_runs for select
  to authenticated
  using (
    private.member_role(business_id, (select auth.uid())) is not null
  );

create policy verification_runs_insert_member
  on public.verification_runs for insert
  to authenticated
  with check (
    private.member_role(business_id, (select auth.uid())) is not null
    and requested_by = (select auth.uid())
    and status = 'queued'
    and started_at is null
    and completed_at is null
  );

create policy verification_runs_update_admin
  on public.verification_runs for update
  to authenticated
  using (
    private.member_role(business_id, (select auth.uid()))
      in ('owner', 'admin')
  )
  with check (
    business_id = business_id
    and requested_by = requested_by
  );

create policy verification_runs_delete_admin
  on public.verification_runs for delete
  to authenticated
  using (
    private.member_role(business_id, (select auth.uid()))
      in ('owner', 'admin')
  );
