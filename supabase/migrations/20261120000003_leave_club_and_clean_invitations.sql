-- Migration: 20261120000003_leave_club_and_clean_invitations.sql
-- 1. RPC: leave_club (Cho phép thành viên tự rời câu lạc bộ, trừ Owner)
-- 2. Enhanced revoke_club_invitation: Hủy là xóa vĩnh viễn trong DB
-- 3. Enhanced accept_club_invitation: Khi tham gia qua mã mời, KHÔNG tự động thêm vào danh sách cầu thủ (player_profiles)

-- 1. RPC: leave_club
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

-- 2. RPC: revoke_club_invitation (Hủy mã mời -> Xóa luôn trong DB)
drop function if exists public.revoke_club_invitation(bigint) cascade;
create or replace function public.revoke_club_invitation(p_invitation_id bigint)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_inv public.club_invitations;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  select * into v_inv from public.club_invitations where id = p_invitation_id for update;
  if v_inv.id is null then
    raise exception 'not_found';
  end if;

  if not (
    public.is_system_admin(auth.uid())
    or public.is_club_owner(v_inv.club_id, auth.uid())
    or public.has_club_permission(v_inv.club_id, 'can_manage_club', auth.uid())
  ) then
    raise exception 'forbidden';
  end if;

  -- Xóa hoàn toàn khỏi database
  delete from public.club_invitations where id = v_inv.id;

  return true;
end $$;

revoke all on function public.revoke_club_invitation(bigint) from public;
grant execute on function public.revoke_club_invitation(bigint) to authenticated;

-- 3. RPC: accept_club_invitation (Chỉ cấp quyền tài khoản, KHÔNG tự thêm vào player_profiles)
drop function if exists public.accept_club_invitation(text) cascade;
drop function if exists public.accept_club_invitation(uuid) cascade;
create or replace function public.accept_club_invitation(p_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_clean text := trim(coalesce(p_token, ''));
  v_hash text;
  v_inv public.club_invitations;
  v_club public.clubs;
  v_user_profile public.profiles;
  v_member public.club_members;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  select * into v_user_profile from public.profiles where id = auth.uid();
  if v_user_profile.id is null then
    raise exception 'profile_not_found';
  end if;

  -- Trích xuất mã nếu dán nguyên URL hoặc query param (?token=... / #accept?token=...)
  if v_clean ~* 'token=' then
    v_clean := regexp_replace(v_clean, '^.*[?&#]token=([^&#]+).*$', '\1');
  end if;
  v_clean := trim(v_clean);
  v_hash := encode(extensions.digest(v_clean, 'sha256'), 'hex');

  -- Tìm kiếm mã lời mời hợp lệ
  select * into v_inv from public.club_invitations
  where (
    invite_code = upper(v_clean)
    or token_hash = v_hash
    or invite_code = v_clean
    or token_hash = encode(extensions.digest(upper(v_clean), 'sha256'), 'hex')
  )
  and status = 'pending'
  and expires_at > now()
  order by id desc
  limit 1
  for update;

  if v_inv.id is null then
    raise exception 'invalid_or_expired_invitation';
  end if;

  -- Bảo vệ Chủ nhiệm: Nếu đang là Chủ nhiệm thì không chấp nhận để tránh hạ quyền
  if exists (
    select 1 from public.club_members
    where club_id = v_inv.club_id and user_id = auth.uid() and role = 'owner' and status = 'active'
  ) then
    raise exception 'already_owner_cannot_demote';
  end if;

  -- Kiểm tra câu lạc bộ có đang hoạt động
  select * into v_club from public.clubs where id = v_inv.club_id for update;
  if v_club.id is null or v_club.status <> 'active' then
    raise exception 'inactive_club';
  end if;

  -- Kiểm tra email chỉ định (nếu có)
  if v_inv.email is not null and v_inv.email <> '' then
    if lower(v_inv.email) <> lower(v_user_profile.email) and not public.is_system_admin(auth.uid()) then
      raise exception 'email_mismatch';
    end if;
  end if;

  -- Thêm / Cập nhật thành viên vào bảng quyền hạn club_members
  insert into public.club_members (
    club_id,
    user_id,
    role,
    status,
    title,
    permissions
  ) values (
    v_inv.club_id,
    auth.uid(),
    v_inv.role,
    'active',
    coalesce(v_inv.title, 'Thành viên'),
    coalesce(v_inv.permissions, '{}'::jsonb)
  )
  on conflict (club_id, user_id) do update set
    role = excluded.role,
    status = 'active',
    title = excluded.title,
    permissions = excluded.permissions,
    updated_at = now()
  returning * into v_member;

  -- Đánh dấu mã mời đã được chấp nhận
  update public.club_invitations
  set status = 'accepted',
      accepted_at = now(),
      accepted_by = auth.uid(),
      updated_at = now()
  where id = v_inv.id;

  -- Ghi nhận audit log
  insert into public.audit_logs (club_id, actor_id, action, subject_type, subject_id)
  values (v_inv.club_id, auth.uid(), 'invitation.accepted', 'ClubInvitation', v_inv.id);

  return jsonb_build_object(
    'id', v_inv.club_id,
    'club_name', v_club.name,
    'role', v_member.role,
    'title', v_member.title,
    'permissions', v_member.permissions
  );
end $$;

revoke all on function public.accept_club_invitation(text) from public;
grant execute on function public.accept_club_invitation(text) to authenticated;
