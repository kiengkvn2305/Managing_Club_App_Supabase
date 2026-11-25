-- Migration: 20261125000005_record_dues_per_team.sql
-- Tách nghiệp vụ ghi đóng / miễn quỹ riêng theo từng đội (p_team_id):
-- Khi chọn đóng quỹ cho 1 đội cụ thể thì chỉ ghi nhận cho đúng đội đó,
-- không tự động tính đóng cho các đội khác của cùng thành viên.

alter table public.dues_collection_requests
  add column if not exists team_id bigint;

drop function if exists public.record_player_dues(bigint, bigint, date, integer, text, uuid);

create or replace function public.record_player_dues(
  p_club_id bigint,
  p_player_id bigint,
  p_month date,
  p_months integer,
  p_status text,
  p_idempotency_key uuid,
  p_team_id bigint default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_existing public.dues_collection_requests;
  v_cursor_month date := date_trunc('month', p_month)::date;
  v_n integer := 0;
  v_total_amount numeric := 0;
  v_tx_id bigint;
  v_team_row record;
  v_rate_value numeric;
  v_recorded_count integer := 0;
  v_player_name text;
  v_team_name text;
  v_desc text;
  v_result jsonb;
begin
  if p_idempotency_key is null then
    raise exception 'idempotency_key_required';
  end if;

  if not public.can_manage_finance(p_club_id)
     or p_months < 1 or p_months > 24
     or p_status not in ('paid', 'exempt') then
    raise exception 'forbidden_or_invalid';
  end if;

  perform 1 from public.clubs where id = p_club_id and status = 'active' for update;
  if not found then
    raise exception 'inactive_club';
  end if;

  select * into v_existing
  from public.dues_collection_requests
  where club_id = p_club_id and idempotency_key = p_idempotency_key;

  if v_existing.club_id is not null then
    if v_existing.player_id <> p_player_id
       or v_existing.team_id is distinct from p_team_id
       or v_existing.month <> date_trunc('month', p_month)::date
       or v_existing.months <> p_months
       or v_existing.settlement_status <> p_status then
      raise exception 'idempotency_conflict';
    end if;
    return v_existing.result;
  end if;

  select full_name into v_player_name
  from public.player_profiles
  where club_id = p_club_id and id = p_player_id;

  if p_team_id is not null then
    select name into v_team_name
    from public.teams
    where club_id = p_club_id and id = p_team_id;
    if v_team_name is null then
      raise exception 'team_not_found';
    end if;
  end if;

  -- Phase 1: Tính tổng số tiền cần ghi (chỉ cho p_team_id nếu có chỉ định)
  while v_n < p_months loop
    for v_team_row in
      select distinct t_id as team_id from (
        select tp.team_id as t_id
        from public.team_players tp
        where tp.club_id = p_club_id and tp.player_id = p_player_id
        union
        select p.team_id as t_id
        from public.player_profiles p
        where p.club_id = p_club_id and p.id = p_player_id and p.team_id is not null
      ) s
      where p_team_id is null or s.t_id = p_team_id
    loop
      v_rate_value := public.get_player_team_dues_rate(p_club_id, v_team_row.team_id, p_player_id, v_cursor_month);
      if v_rate_value is not null and not exists (
        select 1
        from public.team_dues_entries
        where club_id = p_club_id
          and team_id = v_team_row.team_id
          and player_id = p_player_id
          and month = v_cursor_month
          and status in ('paid', 'exempt')
      ) then
        if v_rate_value > 0 and p_status = 'paid' then
          v_total_amount := v_total_amount + v_rate_value;
        end if;
        v_recorded_count := v_recorded_count + 1;
      end if;
    end loop;
    v_cursor_month := (v_cursor_month + interval '1 month')::date;
    v_n := v_n + 1;
  end loop;

  if v_recorded_count = 0 then
    raise exception 'no_dues_to_record';
  end if;

  -- Tạo giao dịch thu quỹ vào sổ thu chi nếu là đóng quỹ có số tiền > 0
  if p_status = 'paid' and v_total_amount > 0 then
    perform public.assert_financial_period_open(p_club_id, (now() at time zone 'Asia/Ho_Chi_Minh')::date);
    v_desc := 'Thu quỹ ' || coalesce(v_player_name, 'thành viên #' || p_player_id)
      || case when v_team_name is not null then ' · ' || v_team_name else '' end
      || ' từ ' || to_char(p_month, 'MM/YYYY')
      || ' (' || p_months || ' tháng)';

    insert into public.finance_transactions(
      club_id, created_by, type, amount, occurred_on, description, status
    )
    values (
      p_club_id,
      auth.uid(),
      'income',
      v_total_amount,
      (now() at time zone 'Asia/Ho_Chi_Minh')::date,
      v_desc,
      'posted'
    )
    returning id into v_tx_id;
  end if;

  -- Phase 2: Ghi nhận team_dues_entries chỉ cho đội đã chọn
  v_cursor_month := date_trunc('month', p_month)::date;
  v_n := 0;
  while v_n < p_months loop
    for v_team_row in
      select distinct t_id as team_id from (
        select tp.team_id as t_id
        from public.team_players tp
        where tp.club_id = p_club_id and tp.player_id = p_player_id
        union
        select p.team_id as t_id
        from public.player_profiles p
        where p.club_id = p_club_id and p.id = p_player_id and p.team_id is not null
      ) s
      where p_team_id is null or s.t_id = p_team_id
    loop
      v_rate_value := public.get_player_team_dues_rate(p_club_id, v_team_row.team_id, p_player_id, v_cursor_month);
      if v_rate_value is not null and not exists (
        select 1
        from public.team_dues_entries
        where club_id = p_club_id
          and team_id = v_team_row.team_id
          and player_id = p_player_id
          and month = v_cursor_month
          and status in ('paid', 'exempt')
      ) then
        insert into public.team_dues_entries(
          club_id, team_id, player_id, month, status, amount, finance_transaction_id, created_by
        )
        values (
          p_club_id, v_team_row.team_id, p_player_id, v_cursor_month, p_status, v_rate_value, v_tx_id, auth.uid()
        )
        on conflict (team_id, player_id, month) do update
        set status = excluded.status,
            amount = excluded.amount,
            finance_transaction_id = excluded.finance_transaction_id,
            updated_at = now();
      end if;
    end loop;
    v_cursor_month := (v_cursor_month + interval '1 month')::date;
    v_n := v_n + 1;
  end loop;

  v_result := jsonb_build_object(
    'player_id', p_player_id,
    'team_id', p_team_id,
    'months', p_months,
    'status', p_status,
    'amount', v_total_amount,
    'transaction_id', v_tx_id
  );

  insert into public.dues_collection_requests(
    club_id, idempotency_key, player_id, team_id, month, months, settlement_status, result
  ) values (
    p_club_id, p_idempotency_key, p_player_id, p_team_id, date_trunc('month', p_month)::date,
    p_months, p_status, v_result
  );

  return v_result;
end $$;

revoke all on function public.record_player_dues(bigint, bigint, date, integer, text, uuid, bigint) from public, anon;
grant execute on function public.record_player_dues(bigint, bigint, date, integer, text, uuid, bigint) to authenticated;
