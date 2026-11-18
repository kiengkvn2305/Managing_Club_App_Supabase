-- Production follow-up: the finance read grants are explicit and read-only.
-- Financial writes remain RPC-only and RLS remains enabled.
grant select on public.finance_transactions, public.financial_periods, public.funds,
  public.transaction_approvals, public.payments, public.payment_allocations,
  public.planned_expenses, public.team_dues_entries, public.team_dues_adjustments,
  public.match_cost_splits, public.match_cost_receivables
  to authenticated;
