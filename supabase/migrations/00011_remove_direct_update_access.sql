-- Sprint 7A: direct table updates are unsupported. Mutations requiring updates
-- are performed by scoped RPCs with their own authorization and validation.

drop policy businesses_update_owner on public.businesses;
drop policy business_members_update_admin on public.business_members;
drop policy verification_runs_update_admin on public.verification_runs;
drop policy payments_update_admin on public.payments;
drop policy gcash_transactions_update_admin on public.gcash_transactions;

revoke update on public.businesses,
  public.business_members,
  public.verification_runs,
  public.payments,
  public.gcash_transactions
  from authenticated;
