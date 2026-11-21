-- A payment retry must use the same replay key; never silently create a second receipt.
create or replace function public.post_finance_payment(
  p_club_id bigint,
  p_player_id bigint,
  p_amount numeric,
  p_paid_on date,
  p_external_ref text,
  p_allocations jsonb default '[]'::jsonb,
  p_idempotency_key uuid default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  payment_row public.payments;
  tx_id bigint;
  item jsonb;
  dues_row public.team_dues_entries;
  allocation_amount numeric;
  allocated numeric := 0;
  next_paid numeric;
begin
  if not public.can_manage_finance(p_club_id)
     or p_amount is null or p_amount <= 0
     or p_amount::text in ('NaN', 'Infinity', '-Infinity')
     or p_amount <> round(p_amount, 2)
     or p_allocations is null or jsonb_typeof(p_allocations) <> 'array' then
    raise exception 'forbidden_or_invalid';
  end if;
  if p_idempotency_key is null then raise exception 'idempotency_key_required'; end if;
  perform 1 from public.clubs where id = p_club_id and status = 'active' for update;
  if not found then raise exception 'inactive_club'; end if;
  select * into payment_row from public.payments
  where club_id = p_club_id and idempotency_key = p_idempotency_key;
  if payment_row.id is not null then
    if payment_row.amount is distinct from p_amount
       or payment_row.player_id is distinct from p_player_id
       or payment_row.paid_on is distinct from p_paid_on then
      raise exception 'idempotency_conflict';
    end if;
    return jsonb_build_object('payment', to_jsonb(payment_row), 'replayed', true);
  end if;
  perform public.assert_financial_period_open(p_club_id, p_paid_on);
  if p_player_id is not null and not exists (
    select 1 from public.player_profiles where club_id = p_club_id and id = p_player_id
  ) then raise exception 'player_not_found'; end if;

  insert into public.finance_transactions(
    club_id, created_by, type, amount, occurred_on, description, paid_by, idempotency_key, status
  ) values (
    p_club_id, auth.uid(), 'income', p_amount, p_paid_on,
    'Thanh toán công nợ', p_external_ref, p_idempotency_key, 'posted'
  ) returning id into tx_id;
  insert into public.payments(
    club_id, player_id, amount, paid_on, status, external_ref, created_by, idempotency_key
  ) values (
    p_club_id, p_player_id, p_amount, p_paid_on, 'posted',
    nullif(trim(p_external_ref), ''), auth.uid(), p_idempotency_key
  ) returning * into payment_row;

  for item in select value from jsonb_array_elements(p_allocations) loop
    allocation_amount := (item->>'amount')::numeric;
    if allocation_amount is null or allocation_amount <= 0
       or allocation_amount::text in ('NaN', 'Infinity', '-Infinity')
       or allocation_amount <> round(allocation_amount, 2) then
      raise exception 'invalid_allocation';
    end if;
    select * into dues_row from public.team_dues_entries
    where club_id = p_club_id and id = (item->>'dues_entry_id')::bigint
    for update;
    if dues_row.id is null or dues_row.status in ('exempt', 'paid') then
      raise exception 'dues_entry_not_found';
    end if;
    if p_player_id is not null and dues_row.player_id <> p_player_id then
      raise exception 'allocation_player_mismatch';
    end if;
    if coalesce(dues_row.paid_amount, 0) + allocation_amount > dues_row.amount then
      raise exception 'allocation_exceeds_due';
    end if;
    allocated := allocated + allocation_amount;
    if allocated > p_amount then raise exception 'allocation_exceeds_payment'; end if;
    insert into public.payment_allocations(club_id, payment_id, dues_entry_id, amount)
    values (p_club_id, payment_row.id, dues_row.id, allocation_amount);
    next_paid := coalesce(dues_row.paid_amount, 0) + allocation_amount;
    update public.team_dues_entries
    set paid_amount = next_paid,
        status = case when next_paid >= amount then 'paid' else 'unpaid' end,
        finance_transaction_id = tx_id
    where id = dues_row.id;
  end loop;
  insert into public.audit_logs(club_id, actor_id, action, subject_type, subject_id)
  values (p_club_id, auth.uid(), 'finance.payment_posted', 'Payment', payment_row.id);
  return jsonb_build_object('payment', to_jsonb(payment_row), 'allocated', allocated, 'transaction_id', tx_id);
end $$;

revoke all on function public.post_finance_payment(bigint,bigint,numeric,date,text,jsonb,uuid) from public, anon;
grant execute on function public.post_finance_payment(bigint,bigint,numeric,date,text,jsonb,uuid) to authenticated;
