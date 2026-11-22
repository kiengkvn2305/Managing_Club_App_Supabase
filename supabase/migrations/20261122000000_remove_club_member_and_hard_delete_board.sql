-- Migration: 20261122000000_remove_club_member_and_hard_delete_board.sql
-- 1. RPC: remove_club_member (Xóa thành viên / BCN khỏi câu lạc bộ và thu hồi toàn bộ quyền hạn)
-- 2. RPC: remove_board_member (Xóa hoàn toàn thành viên BCN khỏi bảng club_board_members, không lưu rác)
-- 3. Dọn dẹp các mã mời đã hủy trước đây khỏi database và cập nhật quyền DELETE

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

-- 3. Cấp quyền DELETE trên bảng club_board_members và board_membership_periods
grant delete on public.club_board_members, public.board_membership_periods to authenticated;
grant delete on public.club_members to authenticated;

-- 4. Dọn dẹp triệt để các mã mời đã bị hủy trước đây khỏi database
delete from public.club_invitations where status = 'revoked';
