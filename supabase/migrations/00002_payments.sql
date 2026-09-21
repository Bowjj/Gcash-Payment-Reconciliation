-- Sprint 2: Payments table for imported payment records
-- Reference numbers are TEXT, never integer. Monetary amounts use NUMERIC, never float.
-- RLS is fail-closed: explicit allow per operation, deny by default.

-- ============================================================
-- 1. ENUMS
-- ============================================================

create type public.payment_method as enum ('GCASH', 'CASH', 'BANK');

-- ============================================================
-- 2. TABLES
-- ============================================================

create table public.payments (
  id                uuid primary key default gen_random_uuid(),
  verification_run_id uuid not null references public.verification_runs(id) on delete cascade,
  business_id       uuid not null references public.businesses(id) on delete cascade,
  imported_by       uuid not null references auth.users(id) on delete restrict,

  customer          text not null,
  account           text,
  billing_period    text,
  amount            numeric not null check (amount >= 0),
  method            public.payment_method not null,
  reference_number  text,
  payment_date      date,
  notes             text,
  paid_by           text,
  received_by       text,
  photo_url         text,
  created_at_source timestamptz,

  row_index         integer not null,
  raw_data          jsonb,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on table public.payments is 'Imported payment records belonging to a verification run.';

-- ============================================================
-- 3. INDEXES
-- ============================================================

-- Enable pg_trgm for customer search
create extension if not exists pg_trgm with schema public;

create index payments_verification_run_idx
  on public.payments (verification_run_id);

create index payments_business_idx
  on public.payments (business_id, created_at desc);

create index payments_method_idx
  on public.payments (method);

create index payments_customer_idx
  on public.payments using gin (customer gin_trgm_ops);

-- ============================================================
-- 4. UPDATED_AT TRIGGER
-- ============================================================

create trigger payments_set_updated_at
  before update on public.payments
  for each row execute function public.set_updated_at();

-- ============================================================
-- 5. ROW LEVEL SECURITY
-- ============================================================

alter table public.payments enable row level security;

revoke all on public.payments from anon, authenticated;

grant select, insert, update, delete
  on public.payments
  to authenticated;

-- ----- Payments -----

create policy payments_select_member
  on public.payments for select
  to authenticated
  using (
    private.member_role(business_id, (select auth.uid())) is not null
  );

create policy payments_insert_member
  on public.payments for insert
  to authenticated
  with check (
    private.member_role(business_id, (select auth.uid())) is not null
    and imported_by = (select auth.uid())
  );

create policy payments_update_admin
  on public.payments for update
  to authenticated
  using (
    private.member_role(business_id, (select auth.uid()))
      in ('owner', 'admin')
  )
  with check (
    verification_run_id = verification_run_id
    and business_id = business_id
  );

create policy payments_delete_admin
  on public.payments for delete
  to authenticated
  using (
    private.member_role(business_id, (select auth.uid()))
      in ('owner', 'admin')
  );
