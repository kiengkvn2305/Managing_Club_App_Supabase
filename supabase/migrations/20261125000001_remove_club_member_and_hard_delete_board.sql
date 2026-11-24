-- Migration: 20261122000000_remove_club_member_and_hard_delete_board.sql
-- 1. RPC: remove_club_member (Xóa thành viên / BCN khỏi câu lạc bộ và thu hồi toàn bộ quyền hạn)
-- 2. RPC: remove_board_member (Xóa hoàn toàn thành viên BCN khỏi bảng club_board_members, không lưu rác)
-- 3. Cập nhật create_club: KHÔNG tự động chèn vào club_board_members (chỉ thêm khi người dùng bấm Thêm BCN)
-- 4. Dọn dẹp triệt để các mã mời đã hủy và các bản ghi BCN lưu trữ mềm/mồ côi khỏi database

-- 1. RPC: remove_club_member
create or replace function public.remove_club_member(p_club_id bigint, p_member_id bigint)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_member public.club_members;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  -- Kiểm tra quyền: Phải là Chủ nhiệm CLB hoặc Quản trị hệ thống
  if not (
    public.is_system_admin(auth.uid())
    or public.is_club_owner(p_club_id, auth.uid())
  ) then
    raise exception 'forbidden';
  end if;

  select * into v_member
  from public.club_members
  where club_id = p_club_id and id = p_member_id
  for update;

  if v_member.id is null then
    raise exception 'member_not_found';
  end if;

  if v_member.role = 'owner' then
    raise exception 'cannot_remove_owner';
  end if;

  -- 1. Xóa khỏi ban quản lý đội bóng nếu có
  delete from public.team_managers
  where club_id = p_club_id and membership_id = v_member.id;

  -- 2. Xóa khỏi ban chủ nhiệm (club_board_members) và kỳ hoạt động nếu có
  if v_member.user_id is not null then
    delete from public.board_tasks
    where club_id = p_club_id and board_member_id in (
      select bm.id from public.club_board_members bm
      join public.player_profiles pp on pp.id = bm.player_id and pp.club_id = p_club_id
      where pp.user_id = v_member.user_id
    );

    delete from public.board_membership_periods
    where club_id = p_club_id and player_id in (
      select id from public.player_profiles
      where club_id = p_club_id and user_id = v_member.user_id
    );

    delete from public.club_board_members
    where club_id = p_club_id and player_id in (
      select id from public.player_profiles
      where club_id = p_club_id and user_id = v_member.user_id
    );

    -- Hủy liên kết user_id ở hồ sơ cầu thủ (giữ lại hồ sơ cầu thủ, chỉ hủy liên kết tài khoản)
    update public.player_profiles
    set user_id = null
    where club_id = p_club_id and user_id = v_member.user_id;
  end if;

  -- 3. Xóa hoàn toàn bản ghi khỏi bảng club_members
  delete from public.club_members
  where club_id = p_club_id and id = v_member.id;

  -- 4. Ghi nhận audit log
  insert into public.audit_logs (club_id, actor_id, action, subject_type, subject_id)
  values (p_club_id, auth.uid(), 'member.removed', 'ClubMember', v_member.id);

  return true;
end $$;

revoke all on function public.remove_club_member(bigint, bigint) from public, anon;
grant execute on function public.remove_club_member(bigint, bigint) to authenticated;

-- 2. RPC: remove_board_member (Xóa hoàn toàn bản ghi BCN, không giữ archived_at)
create or replace function public.remove_board_member(p_club_id bigint, p_board_member_id bigint)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_bm public.club_board_members;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  if not (
    public.is_system_admin(auth.uid())
    or public.is_club_owner(p_club_id, auth.uid())
    or public.has_club_permission(p_club_id, 'can_manage_club', auth.uid())
    or public.has_club_permission(p_club_id, 'can_manage_roster', auth.uid())
  ) then
    raise exception 'forbidden';
  end if;

  select * into v_bm
  from public.club_board_members
  where club_id = p_club_id and id = p_board_member_id
  for update;

  if v_bm.id is null then
    raise exception 'not_found';
  end if;

  -- Xóa công việc BCN
  delete from public.board_tasks
  where club_id = p_club_id and board_member_id = v_bm.id;

  -- Xóa kỳ thành viên BCN
  delete from public.board_membership_periods
  where club_id = p_club_id and player_id = v_bm.player_id;

  -- Xóa hoàn toàn khỏi club_board_members
  delete from public.club_board_members
  where club_id = p_club_id and id = v_bm.id;

  -- Ghi nhận audit log
  insert into public.audit_logs (club_id, actor_id, action, subject_type, subject_id)
  values (p_club_id, auth.uid(), 'board_member.removed', 'ClubBoardMember', v_bm.id);

  return true;
end $$;

revoke all on function public.remove_board_member(bigint, bigint) from public, anon;
grant execute on function public.remove_board_member(bigint, bigint) to authenticated;

-- 3. Cập nhật create_club: KHÔNG tự động chèn vào club_board_members
create or replace function public.create_club(
  p_name text,
  p_description text default null,
  p_city text default null,
  p_home_ground text default null,
  p_formats jsonb default '["7"]'::jsonb
) returns public.clubs language plpgsql security definer set search_path = public as $$
declare
  c public.clubs;
  slug_base text;
  v_user_profile public.profiles;
  v_player_id bigint;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  if jsonb_typeof(p_formats) <> 'array' or jsonb_array_length(p_formats) = 0 then
    raise exception 'invalid_formats';
  end if;

  slug_base := regexp_replace(lower(coalesce(nullif(trim(p_name), ''), 'club')), '[^a-z0-9]+', '-', 'g');

  insert into public.clubs(name, description, city, home_ground, format, formats, slug, activity_start_date)
  values(
    trim(p_name),
    p_description,
    p_city,
    p_home_ground,
    p_formats->>0,
    p_formats,
    slug_base || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12),
    now()::date
  )
  returning * into c;

  -- Gán người tạo làm owner trong club_members với toàn quyền
  insert into public.club_members(club_id, user_id, role, status, title, permissions)
  values(c.id, auth.uid(), 'owner', 'active', 'Chủ nhiệm CLB', '{}'::jsonb);

  -- Tự động tạo hồ sơ cầu thủ cho người tạo CLB nếu có thông tin profile
  select * into v_user_profile from public.profiles where id = auth.uid();
  insert into public.player_profiles(club_id, user_id, full_name, email, status)
  values(
    c.id,
    auth.uid(),
    coalesce(nullif(v_user_profile.name, ''), 'Chủ nhiệm CLB'),
    v_user_profile.email,
    'active'
  )
  on conflict do nothing;

  -- KHÔNG tự động chèn vào club_board_members (BCN chỉ được thêm khi người dùng chủ động chỉ định)

  insert into public.audit_logs(club_id, actor_id, action, subject_type, subject_id)
  values(c.id, auth.uid(), 'club.created', 'Club', c.id);

  return c;
end $$;

revoke all on function public.create_club(text, text, text, text, jsonb) from public;
grant execute on function public.create_club(text, text, text, text, jsonb) to authenticated;

-- 4. Cấp quyền DELETE trên bảng club_board_members và board_membership_periods
grant delete on public.club_board_members, public.board_membership_periods to authenticated;
grant delete on public.club_members to authenticated;

-- 5. Dọn dẹp triệt để các mã mời đã bị hủy trước đây khỏi database
delete from public.club_invitations where status = 'revoked';

-- 6. Dọn dẹp triệt để các bản ghi BCN bị lưu trữ mềm (archived_at is not null) hoặc mồ côi
delete from public.board_tasks
where board_member_id in (select id from public.club_board_members where archived_at is not null);

delete from public.club_board_members
where archived_at is not null;

delete from public.club_board_members
where player_id not in (select id from public.player_profiles);

delete from public.board_membership_periods
where ends_before is not null
   or player_id not in (select player_id from public.club_board_members);
