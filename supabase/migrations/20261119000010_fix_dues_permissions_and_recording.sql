-- 20261119000010_fix_dues_permissions_and_recording.sql
-- Fixes finance management permissions and resolves dues recording blocking issues.

-- 1. Broaden finance access to all legitimate management roles and titles
create or replace function public.can_view_finance(
  p_club_id bigint,
  p_user_id uuid default auth.uid()
) returns boolean language sql stable security definer set search_path = public as $$
  select public.is_active_member(p_club_id, p_user_id) and exists (
    select 1 from public.club_members m
    where m.club_id = p_club_id
      and m.user_id = p_user_id
      and (
        m.role in ('owner', 'co_owner', 'general_manager', 'treasurer')
        or m.title in ('Chủ nhiệm CLB', 'Phó chủ nhiệm CLB', 'Thủ quỹ', 'HLV', 'Quản lý tài chính')
      )
  );
$$;

create or replace function public.can_manage_finance(
  p_club_id bigint,
  p_user_id uuid default auth.uid()
) returns boolean language sql stable security definer set search_path = public as $$
  select public.is_active_member(p_club_id, p_user_id) and exists (
    select 1 from public.club_members m
    where m.club_id = p_club_id
      and m.user_id = p_user_id
      and (
        m.role in ('owner', 'co_owner', 'general_manager', 'treasurer')
        or m.title in ('Chủ nhiệm CLB', 'Phó chủ nhiệm CLB', 'Thủ quỹ', 'Quản lý tài chính')
      )
  );
$$;

revoke all on function public.can_view_finance(bigint,uuid) from public, anon;
grant execute on function public.can_view_finance(bigint,uuid) to authenticated;

revoke all on function public.can_manage_finance(bigint,uuid) from public, anon;
grant execute on function public.can_manage_finance(bigint,uuid) to authenticated;

-- 2. Fix record_player_dues to allow settling unpaid dues entries and properly locate team memberships
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
  if not public.can_manage_finance(p_club_id) or p_months < 1 or p_months > 24 or p_status not in ('paid', 'exempt') then
    raise exception 'forbidden_or_invalid';
  end if;
  perform 1 from public.clubs where id = p_club_id and status = 'active' for update;

  -- Phase 1: calculate total amount to be recorded/collected
  while n < p_months loop
    for team_row in
      select distinct t_id as team_id from (
        select tp.team_id as t_id from public.team_players tp where tp.club_id = p_club_id and tp.player_id = p_player_id
        union
        select p.team_id as t_id from public.player_profiles p where p.club_id = p_club_id and p.id = p_player_id and p.team_id is not null
      ) s
    loop
      rate_value := public.get_player_team_dues_rate(p_club_id, team_row.team_id, p_player_id, cursor_month);
      -- An entry is eligible if it does not already exist as settled ('paid' or 'exempt')
      if rate_value is not null and not exists (
        select 1 from public.team_dues_entries
        where team_id = team_row.team_id and player_id = p_player_id and month = cursor_month and status in ('paid', 'exempt')
      ) then
        if rate_value > 0 and p_status = 'paid' then
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

  -- Create finance transaction if collecting paid dues
  if p_status = 'paid' and total_amount > 0 then
    insert into public.finance_transactions(club_id, created_by, type, amount, occurred_on, description)
    select p_club_id, auth.uid(), 'income', total_amount, current_date,
      'Thu quỹ thành viên ' || p_player_id || ' từ ' || to_char(p_month, 'YYYY-MM') || ' (' || p_months || ' tháng)'
    returning id into tx_id;
  end if;

  -- Phase 2: upsert the team dues entries
  cursor_month := date_trunc('month', p_month)::date;
  n := 0;
  while n < p_months loop
    for team_row in
      select distinct t_id as team_id from (
        select tp.team_id as t_id from public.team_players tp where tp.club_id = p_club_id and tp.player_id = p_player_id
        union
        select p.team_id as t_id from public.player_profiles p where p.club_id = p_club_id and p.id = p_player_id and p.team_id is not null
      ) s
    loop
      rate_value := public.get_player_team_dues_rate(p_club_id, team_row.team_id, p_player_id, cursor_month);
      if rate_value is not null and not exists (
        select 1 from public.team_dues_entries
        where team_id = team_row.team_id and player_id = p_player_id and month = cursor_month and status in ('paid', 'exempt')
      ) then
        insert into public.team_dues_entries(club_id, team_id, player_id, month, status, amount, finance_transaction_id, created_by)
        values(p_club_id, team_row.team_id, p_player_id, cursor_month, p_status, rate_value, tx_id, auth.uid())
        on conflict (team_id, player_id, month) do update
        set status = excluded.status,
            amount = excluded.amount,
            finance_transaction_id = excluded.finance_transaction_id,
            updated_at = now();
      end if;
    end loop;
    cursor_month := (cursor_month + interval '1 month')::date;
    n := n + 1;
  end loop;

  return jsonb_build_object('player_id', p_player_id, 'months', p_months, 'status', p_status, 'amount', total_amount, 'transaction_id', tx_id);
end $$;

-- 3. Restore execute grant on record_team_dues for authenticated users
grant execute on function public.record_team_dues(bigint,bigint,bigint,date,integer,text) to authenticated;
