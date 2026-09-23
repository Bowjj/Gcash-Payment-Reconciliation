-- Sprint 3: GCash transactions table for imported GCash statements
-- Reference numbers are TEXT, never integer. Monetary amounts use NUMERIC, never float.
-- RLS is fail-closed: explicit allow per operation, deny by default.

-- ============================================================
-- 1. ENUMS
-- ============================================================

create type public.gcash_transaction_direction as enum (
  'incoming',
  'outgoing',
  'unknown'
);

-- ============================================================
-- 2. TABLES
-- ============================================================

create table public.gcash_transactions (
  id                  uuid primary key default gen_random_uuid(),
  verification_run_id uuid not null references public.verification_runs(id) on delete cascade,
  business_id         uuid not null references public.businesses(id) on delete cascade,
  imported_by         uuid not null references auth.users(id) on delete restrict,

  transaction_date    date,
  description         text,
  reference_number    text,
  amount              numeric not null,
  direction           public.gcash_transaction_direction not null default 'unknown',

  -- Additional source fields preserved from the workbook
  raw_data            jsonb,

  row_index           integer not null,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

comment on table public.gcash_transactions is 'Imported GCash transaction records belonging to a verification run.';

-- ============================================================
-- 3. INDEXES
-- ============================================================

create index gcash_transactions_verification_run_idx
  on public.gcash_transactions (verification_run_id);

create index gcash_transactions_business_idx
  on public.gcash_transactions (business_id, created_at desc);

create index gcash_transactions_reference_idx
  on public.gcash_transactions using gin (reference_number gin_trgm_ops);

create index gcash_transactions_date_idx
  on public.gcash_transactions (transaction_date);

create index gcash_transactions_direction_idx
  on public.gcash_transactions (direction);

-- ============================================================
-- 4. UPDATED_AT TRIGGER
-- ============================================================

create trigger gcash_transactions_set_updated_at
  before update on public.gcash_transactions
  for each row execute function public.set_updated_at();

-- ============================================================
-- 5. ROW LEVEL SECURITY
-- ============================================================

alter table public.gcash_transactions enable row level security;

revoke all on public.gcash_transactions from anon, authenticated;

grant select, insert, update, delete
  on public.gcash_transactions
  to authenticated;

-- ----- GCash Transactions -----

create policy gcash_transactions_select_member
  on public.gcash_transactions for select
  to authenticated
  using (
    private.member_role(business_id, (select auth.uid())) is not null
  );

create policy gcash_transactions_insert_member
  on public.gcash_transactions for insert
  to authenticated
  with check (
    private.member_role(business_id, (select auth.uid())) is not null
    and imported_by = (select auth.uid())
  );

create policy gcash_transactions_update_admin
  on public.gcash_transactions for update
  to authenticated
  using (
    private.member_role(business_id, (select auth.uid()))
      in ('owner', 'admin')
  )
  with check (
    verification_run_id = verification_run_id
    and business_id = business_id
  );

create policy gcash_transactions_delete_admin
  on public.gcash_transactions for delete
  to authenticated
  using (
    private.member_role(business_id, (select auth.uid()))
      in ('owner', 'admin')
  );
