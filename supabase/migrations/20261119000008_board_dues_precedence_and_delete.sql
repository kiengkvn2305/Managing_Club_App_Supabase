-- 20261119000008_board_dues_precedence_and_delete.sql
-- Implements board member dues discount precedence and enables deletion of board dues rates.

-- 1. Helper function to determine the applicable dues rate for a player and team in a given month.
-- Precedence:
--   a) Personal board dues rate (board_dues_rates) if player is an active board member
--   b) Shared board dues rate (shared_board_dues_rates) if player is an active board member
--   c) Standard team dues rate (team_dues_rates)
create or replace function public.get_player_team_dues_rate(
  p_club_id bigint,
  p_team_id bigint,
  p_player_id bigint,
  p_month date
) returns numeric language plpgsql stable security definer set search_path = public as $$
declare
  cursor_month date := date_trunc('month', p_month)::date;
  rate_val numeric;
  is_board boolean;
begin
  select exists(
    select 1 from public.club_board_members
    where club_id = p_club_id
      and player_id = p_player_id
      and archived_at is null
  ) into is_board;

  if is_board then
    -- Check for personal board dues rate
    select amount into rate_val
    from public.board_dues_rates
    where club_id = p_club_id
      and team_id = p_team_id
      and player_id = p_player_id
      and effective_month <= cursor_month
      and (ends_before is null or ends_before > cursor_month)
    order by effective_month desc
    limit 1;

    if rate_val is not null then
      return rate_val;
    end if;

    -- Check for shared board dues rate
    select amount into rate_val
    from public.shared_board_dues_rates
    where club_id = p_club_id
      and team_id = p_team_id
      and effective_month <= cursor_month
    order by effective_month desc
    limit 1;

    if rate_val is not null then
      return rate_val;
    end if;
  end if;

  -- Default to standard team dues rate
  select amount into rate_val
  from public.team_dues_rates
  where club_id = p_club_id
    and team_id = p_team_id
    and effective_month <= cursor_month
  order by effective_month desc
  limit 1;

  return rate_val;
end $$;

revoke all on function public.get_player_team_dues_rate(bigint,bigint,bigint,date) from public, anon;
grant execute on function public.get_player_team_dues_rate(bigint,bigint,bigint,date) to authenticated;

-- 2. Update record_player_dues to use board dues precedence
create or replace function public.record_player_dues(
  p_club_id bigint,
  p_player_id bigint,
  p_month date,
  p_months integer,
  p_status text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  cursor_month date := date_trunc('month', p_month)::date;
  n integer := 0;
  total_amount numeric := 0;
  tx_id bigint;
  team_row record;
  rate_value numeric;
  recorded_count integer := 0;
begin
  if not public.can_manage_finance(p_club_id) or p_months < 1 or p_months > 24 or p_status not in ('paid','exempt') then
    raise exception 'forbidden_or_invalid';
  end if;
  perform 1 from public.clubs where id=p_club_id and status='active' for update;

  while n < p_months loop
    for team_row in select distinct tp.team_id from public.team_players tp where tp.club_id=p_club_id and tp.player_id=p_player_id loop
      rate_value := public.get_player_team_dues_rate(p_club_id, team_row.team_id, p_player_id, cursor_month);
      if rate_value is not null and not exists(select 1 from public.team_dues_entries where team_id=team_row.team_id and player_id=p_player_id and month=cursor_month) then
        if rate_value > 0 then
          total_amount := total_amount + rate_value;
        end if;
        recorded_count := recorded_count + 1;
      end if;
    end loop;
    cursor_month := (cursor_month + interval '1 month')::date;
    n := n + 1;
  end loop;

  if recorded_count = 0 then
    raise exception 'no_dues_to_record';
  end if;

  if p_status = 'paid' and total_amount > 0 then
    insert into public.finance_transactions(club_id,created_by,type,amount,occurred_on,description)
    select p_club_id,auth.uid(),'income',total_amount,current_date,'Thu quỹ thành viên '||p_player_id||' từ '||to_char(p_month,'YYYY-MM')||' ('||p_months||' tháng)'
    returning id into tx_id;
  end if;

  cursor_month := date_trunc('month', p_month)::date;
  n := 0;
  while n < p_months loop
    for team_row in select distinct tp.team_id from public.team_players tp where tp.club_id=p_club_id and tp.player_id=p_player_id loop
      rate_value := public.get_player_team_dues_rate(p_club_id, team_row.team_id, p_player_id, cursor_month);
      if rate_value is not null and not exists(select 1 from public.team_dues_entries where team_id=team_row.team_id and player_id=p_player_id and month=cursor_month) then
        insert into public.team_dues_entries(club_id,team_id,player_id,month,status,amount,finance_transaction_id,created_by)
        values(p_club_id,team_row.team_id,p_player_id,cursor_month,p_status,rate_value,tx_id,auth.uid());
      end if;
    end loop;
    cursor_month := (cursor_month + interval '1 month')::date;
    n := n + 1;
  end loop;

  return jsonb_build_object('player_id',p_player_id,'months',p_months,'status',p_status,'amount',total_amount,'transaction_id',tx_id);
end $$;

-- 3. Update record_team_dues to use board dues precedence
create or replace function public.record_team_dues(
  p_club_id bigint,
  p_team_id bigint,
  p_player_id bigint,
  p_month date,
  p_months integer,
  p_status text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  cursor_month date:=date_trunc('month',p_month)::date;
  n integer:=0;
  amount_value numeric(20,2);
begin
  if not public.can_manage_finance(p_club_id) or p_months < 1 or p_months > 24 or p_status not in ('paid','exempt','unpaid') then
    raise exception 'forbidden_or_invalid';
  end if;
  perform 1 from public.teams where club_id=p_club_id and id=p_team_id for update;

  while n < p_months loop
    amount_value := public.get_player_team_dues_rate(p_club_id, p_team_id, p_player_id, cursor_month);
    if amount_value is not null then
      insert into public.team_dues_entries(club_id,team_id,player_id,month,status,amount,created_by)
      values(p_club_id,p_team_id,p_player_id,cursor_month,p_status,amount_value,auth.uid())
      on conflict(team_id,player_id,month) do update set status=excluded.status, amount=excluded.amount, updated_at=now();
    end if;
    cursor_month := (cursor_month + interval '1 month')::date;
    n:=n+1;
  end loop;

  return jsonb_build_object('player_id',p_player_id,'team_id',p_team_id,'months',p_months,'status',p_status);
end $$;

-- 4. Update correct_team_dues to fallback to get_player_team_dues_rate
create or replace function public.correct_team_dues(
  p_club_id bigint,
  p_team_id bigint,
  p_player_id bigint,
  p_month date,
  p_expected_status text,
  p_status text,
  p_reason text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  entry public.team_dues_entries;
  old_status text;
  amount_value numeric;
  old_tx bigint;
  new_tx bigint;
begin
  if not public.can_manage_finance(p_club_id) or p_expected_status not in ('unpaid','paid','exempt') or p_status not in ('unpaid','paid','exempt') or p_expected_status=p_status then
    raise exception 'invalid_correction';
  end if;
  perform 1 from public.clubs where id=p_club_id and status='active' for update;
  select * into entry from public.team_dues_entries where club_id=p_club_id and team_id=p_team_id and player_id=p_player_id and month=date_trunc('month',p_month)::date for update;
  old_status := coalesce(entry.status,'unpaid');
  if old_status <> p_expected_status then
    raise exception 'stale_dues_status';
  end if;

  amount_value := coalesce(entry.amount, public.get_player_team_dues_rate(p_club_id, p_team_id, p_player_id, p_month));
  if amount_value is null then
    raise exception 'no_dues_amount';
  end if;

  old_tx := entry.finance_transaction_id;
  if old_status='paid' and old_tx is not null and amount_value > 0 then
    update public.finance_transactions set amount=amount-amount_value where club_id=p_club_id and id=old_tx and type='income' and amount>=amount_value;
    if not found then raise exception 'missing_source_transaction'; end if;
  end if;

  if p_status='paid' and amount_value > 0 then
    insert into public.finance_transactions(club_id,created_by,type,amount,occurred_on,description) values(p_club_id,auth.uid(),'income',amount_value,current_date,'Điều chỉnh thu quỹ '||p_player_id) returning id into new_tx;
  end if;

  delete from public.team_dues_entries where id=entry.id;
  if p_status <> 'unpaid' then
    insert into public.team_dues_entries(club_id,team_id,player_id,month,status,amount,finance_transaction_id,created_by) values(p_club_id,p_team_id,p_player_id,date_trunc('month',p_month)::date,p_status,amount_value,new_tx,auth.uid());
  end if;

  insert into public.team_dues_adjustments(club_id,team_id,player_id,month,old_status,new_status,amount,old_transaction_id,new_transaction_id,reason,created_by) values(p_club_id,p_team_id,p_player_id,date_trunc('month',p_month)::date,old_status,p_status,amount_value,old_tx,new_tx,trim(p_reason),auth.uid());
  return jsonb_build_object('old_status',old_status,'new_status',p_status,'amount',amount_value);
end $$;

-- 5. Grant DELETE on shared_board_dues_rates and board_dues_rates to authenticated
grant delete on public.shared_board_dues_rates, public.board_dues_rates to authenticated;

-- Ensure explicit RLS DELETE policies exist for managers/owners
drop policy if exists shared_board_dues_rates_delete on public.shared_board_dues_rates;
create policy shared_board_dues_rates_delete on public.shared_board_dues_rates
  for delete to authenticated
  using (public.can_manage_roster(club_id));

drop policy if exists board_dues_rates_delete on public.board_dues_rates;
create policy board_dues_rates_delete on public.board_dues_rates
  for delete to authenticated
  using (public.can_manage_roster(club_id));
