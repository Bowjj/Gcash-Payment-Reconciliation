alter table public.verification_runs
  add constraint verification_runs_id_business_unique
  unique (id, business_id);

alter table public.payments
  drop constraint payments_verification_run_id_fkey,
  add constraint payments_verification_run_business_fkey
    foreign key (verification_run_id, business_id)
    references public.verification_runs (id, business_id)
    on delete cascade;

alter table public.gcash_transactions
  drop constraint gcash_transactions_verification_run_id_fkey,
  add column reference_occurrence_count integer not null default 1
    check (reference_occurrence_count >= 1),
  add constraint gcash_transactions_verification_run_business_fkey
    foreign key (verification_run_id, business_id)
    references public.verification_runs (id, business_id)
    on delete cascade;

create index gcash_transactions_duplicate_reference_idx
  on public.gcash_transactions (business_id, reference_number)
  where reference_occurrence_count > 1;
