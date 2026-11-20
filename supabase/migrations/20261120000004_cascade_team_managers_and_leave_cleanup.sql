-- Migration: 20261120000004_cascade_team_managers_and_leave_cleanup.sql
-- 1. Cập nhật foreign key team_managers_club_id_membership_id_fkey sang ON DELETE CASCADE
-- 2. Cập nhật RPC leave_club: Xóa bản ghi team_managers trước khi xóa club_members

-- 1. Cập nhật foreign key team_managers sang ON DELETE CASCADE
alter table public.team_managers
  drop constraint if exists team_managers_club_id_membership_id_fkey,
  add constraint team_managers_club_id_membership_id_fkey
    foreign key (club_id, membership_id)
    references public.club_members(club_id, id)
    on delete cascade;

-- 2. Cập nhật RPC: leave_club
drop function if exists public.leave_club(bigint) cascade;
create or replace function public.leave_club(p_club_id bigint)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_role public.club_role;
  v_member_id bigint;
  v_other_member_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  select id, role into v_member_id, v_role from public.club_members
  where club_id = p_club_id and user_id = auth.uid() and status = 'active';

  if v_role is null then
    raise exception 'not_a_member';
  end if;

  -- Nếu Chủ nhiệm rời CLB:
  if v_role = 'owner' then
    -- Tìm thành viên hoạt động khác để tự động kế thừa chức danh Chủ nhiệm
    select user_id into v_other_member_id
    from public.club_members
    where club_id = p_club_id and user_id <> auth.uid() and status = 'active'
    order by (role in ('co_owner', 'general_manager', 'treasurer')) desc, created_at asc
    limit 1;

    if v_other_member_id is not null then
      update public.club_members
      set role = 'owner', updated_at = now()
      where club_id = p_club_id and user_id = v_other_member_id;
    else
      -- Nếu không còn ai khác trong CLB, lưu trữ CLB
      update public.clubs
      set deleted_at = now(), status = 'archived', updated_at = now()
      where id = p_club_id;
    end if;
  end if;

  -- Xóa người dùng khỏi danh sách ban quản lý đội bóng nếu có
  delete from public.team_managers
  where club_id = p_club_id and (membership_id = v_member_id or membership_id in (
    select id from public.club_members where club_id = p_club_id and user_id = auth.uid()
  ));

  -- Xóa người dùng khỏi danh sách thành viên quyền hạn của CLB
  delete from public.club_members
  where club_id = p_club_id and user_id = auth.uid();

  -- Hủy liên kết user_id ở hồ sơ cầu thủ nếu có (không xóa thông tin hồ sơ thi đấu)
  update public.player_profiles
  set user_id = null
  where club_id = p_club_id and user_id = auth.uid();

  -- Ghi nhận audit log
  insert into public.audit_logs (club_id, actor_id, action, subject_type, subject_id)
  values (p_club_id, auth.uid(), 'member.left', 'ClubMember', coalesce(v_member_id, p_club_id));

  return true;
end $$;

revoke all on function public.leave_club(bigint) from public;
grant execute on function public.leave_club(bigint) to authenticated;
