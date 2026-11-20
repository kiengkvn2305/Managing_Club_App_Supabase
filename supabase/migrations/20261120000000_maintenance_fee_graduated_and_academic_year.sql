-- 20261120000000_maintenance_fee_graduated_and_academic_year.sql
-- 1. Thêm phí duy trì cho CLB (mặc định 50.000 đ)
alter table public.clubs add column if not exists maintenance_fee numeric(20,2) not null default 50000;

-- 2. Thêm niên khóa / năm học cho hồ sơ thành viên (ví dụ: '2025-2026')
alter table public.player_profiles add column if not exists academic_year varchar(20);

-- 3. Thêm trạng thái 'graduated' (Đã ra trường) vào enum player_status
alter type public.player_status add value if not exists 'graduated';

-- 4. Cập nhật hàm tính mức đóng quỹ get_player_team_dues_rate:
--    - Nếu là 'graduated' (Đã ra trường): trả về null (không phát sinh phí đóng quỹ hàng tháng)
--    - Nếu là 'inactive' (Tạm ngưng): áp dụng phí duy trì của CLB (mặc định 50.000 đ)
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
  player_stat public.player_status;
  maint_fee numeric;
begin
  select status into player_stat from public.player_profiles where club_id = p_club_id and id = p_player_id;
  if player_stat = 'graduated' then
    return null;
  end if;

  if player_stat = 'inactive' then
    select coalesce(maintenance_fee, 50000) into maint_fee from public.clubs where id = p_club_id;
    return coalesce(maint_fee, 50000);
  end if;

  select exists(
    select 1 from public.club_board_members
    where club_id = p_club_id
      and player_id = p_player_id
      and archived_at is null
  ) into is_board;

  if is_board then
    -- Ưu tiên 1: Mức quỹ BCN cá nhân
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

    -- Ưu tiên 2: Mức quỹ BCN chung của đội
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

  -- Ưu tiên 3: Mức quỹ tiêu chuẩn của đội
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

-- 5. Cập nhật commit_member_import để hỗ trợ cột academic_year
create or replace function public.commit_member_import(
  p_club_id bigint,
  p_rows jsonb,
  p_decisions jsonb
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  row_value jsonb;
  decision jsonb;
  action text;
  target_id bigint;
  created_count integer := 0;
  overwritten_count integer := 0;
  skipped_count integer := 0;
begin
  if not public.can_manage_roster(p_club_id)
     or jsonb_array_length(p_rows) <> jsonb_array_length(p_decisions)
     or jsonb_array_length(p_rows) > 500 then
    raise exception 'forbidden_or_invalid';
  end if;

  for row_index in 0..jsonb_array_length(p_rows) - 1 loop
    row_value := p_rows->row_index;
    decision := p_decisions->row_index;
    action := decision->>'action';
    target_id := nullif(decision->>'target_id', '')::bigint;

    if action = 'skip' then
      skipped_count := skipped_count + 1;
    elsif action = 'overwrite' then
      if target_id is null or not exists(select 1 from public.player_profiles where club_id = p_club_id and id = target_id) then
        raise exception 'invalid_import_target';
      end if;

      update public.player_profiles
      set
        full_name = coalesce(row_value->>'full_name', full_name),
        email = nullif(lower(row_value->>'email'), ''),
        phone = nullif(row_value->>'phone', ''),
        date_of_birth = nullif(row_value->>'date_of_birth', '')::date,
        position = nullif(row_value->>'position', ''),
        preferred_foot = nullif(row_value->>'preferred_foot', ''),
        status = coalesce(nullif(row_value->>'status', ''), status::text)::public.player_status,
        academic_year = coalesce(nullif(row_value->>'academic_year', ''), academic_year),
        notes = nullif(row_value->>'notes', '')
      where club_id = p_club_id and id = target_id;

      overwritten_count := overwritten_count + 1;
    elsif action = 'create' then
      insert into public.player_profiles(
        club_id, full_name, email, phone, date_of_birth, position, preferred_foot, status, academic_year, notes
      ) values (
        p_club_id,
        row_value->>'full_name',
        nullif(lower(row_value->>'email'), ''),
        nullif(row_value->>'phone', ''),
        nullif(row_value->>'date_of_birth', '')::date,
        nullif(row_value->>'position', ''),
        nullif(row_value->>'preferred_foot', ''),
        coalesce(nullif(row_value->>'status', ''), 'active')::public.player_status,
        nullif(row_value->>'academic_year', ''),
        nullif(row_value->>'notes', '')
      );
      created_count := created_count + 1;
    else
      raise exception 'invalid_import_decision';
    end if;
  end loop;

  return jsonb_build_object(
    'created', created_count,
    'overwritten', overwritten_count,
    'skipped', skipped_count
  );
end $$;

revoke all on function public.commit_member_import(bigint,jsonb,jsonb) from public, anon;
grant execute on function public.commit_member_import(bigint,jsonb,jsonb) to authenticated;
