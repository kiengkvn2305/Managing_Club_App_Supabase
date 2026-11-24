-- Migration: 20261125000003_separate_attendance_and_role_permissions.sql
-- 1. Chuẩn hóa phân vùng quyền cho từng vai trò BCN:
--    - Thành viên thường: chỉ được xem CLB, Thành viên CLB, Đội bóng, và xem Điểm danh (không bấm điểm danh).
--    - Thủ quỹ: quyền thành viên + Sổ thu chi & Đóng quỹ (can_view_finance, can_manage_finance).
--    - Truyền thông / Đối ngoại: quyền thành viên + Hoạt động CLB (can_view_activities, can_manage_activities).
--    - Phó chủ nhiệm (co_owner / title 'Phó chủ nhiệm'): đầy đủ quyền như Chủ nhiệm (kể cả phân quyền cho thành viên, trừ xóa CLB/chuyển quyền sở hữu).
-- 2. Tách quyền Điểm danh riêng (can_manage_attendance) cho mục Điểm danh độc lập.

create or replace function public.is_club_co_owner(
  p_club_id bigint,
  p_user_id uuid default auth.uid()
) returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(
    select 1
    from public.club_members m
    join public.clubs c on c.id = m.club_id
    where m.club_id = p_club_id
      and m.user_id = coalesce(p_user_id, auth.uid())
      and m.status = 'active'
      and c.status = 'active'
      and c.deleted_at is null
      and (
        m.role = 'co_owner'
        or lower(coalesce(m.title, '')) ~* 'phó chủ nhiệm'
      )
  );
$$;

revoke all on function public.is_club_co_owner(bigint, uuid) from public, anon;
grant execute on function public.is_club_co_owner(bigint, uuid) to authenticated;

create or replace function public.has_club_permission(
  p_club_id bigint,
  p_permission text,
  p_user_id uuid default auth.uid()
) returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := coalesce(p_user_id, auth.uid());
  v_rec record;
begin
  if v_uid is null then
    return false;
  end if;

  if public.is_system_admin(v_uid) then
    return true;
  end if;

  if public.is_club_owner(p_club_id, v_uid) or public.is_club_co_owner(p_club_id, v_uid) then
    return true;
  end if;

  select role, title, permissions into v_rec
  from public.club_members
  where club_id = p_club_id
    and user_id = v_uid
    and status = 'active';

  if not found then
    return false;
  end if;

  if v_rec.permissions ? p_permission then
    return coalesce((v_rec.permissions->>p_permission)::boolean, false);
  end if;

  return null;
end;
$$;

revoke all on function public.has_club_permission(bigint, text, uuid) from public, anon;
grant execute on function public.has_club_permission(bigint, text, uuid) to authenticated;

create or replace function public.can_view_finance(
  p_club_id bigint,
  p_user_id uuid default auth.uid()
) returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := coalesce(p_user_id, auth.uid());
  v_perm boolean;
  v_rec record;
begin
  v_perm := public.has_club_permission(p_club_id, 'can_view_finance', v_uid);
  if v_perm is not null then return v_perm; end if;

  select role, title into v_rec
  from public.club_members
  where club_id = p_club_id and user_id = v_uid and status = 'active'
  limit 1;

  if not found then return false; end if;

  return v_rec.role in ('owner', 'co_owner', 'general_manager', 'treasurer')
    or lower(coalesce(v_rec.title, '')) ~* '(thủ quỹ|kế toán|chủ nhiệm)';
end;
$$;

revoke all on function public.can_view_finance(bigint, uuid) from public, anon;
grant execute on function public.can_view_finance(bigint, uuid) to authenticated;

create or replace function public.can_manage_finance(
  p_club_id bigint,
  p_user_id uuid default auth.uid()
) returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := coalesce(p_user_id, auth.uid());
  v_perm boolean;
  v_rec record;
begin
  if not exists(select 1 from public.clubs where id = p_club_id and status = 'active' and deleted_at is null) then
    return false;
  end if;

  v_perm := public.has_club_permission(p_club_id, 'can_manage_finance', v_uid);
  if v_perm is not null then return v_perm; end if;

  select role, title into v_rec
  from public.club_members
  where club_id = p_club_id and user_id = v_uid and status = 'active'
  limit 1;

  if not found then return false; end if;

  return v_rec.role in ('owner', 'co_owner', 'general_manager', 'treasurer')
    or lower(coalesce(v_rec.title, '')) ~* '(thủ quỹ|kế toán|chủ nhiệm)';
end;
$$;

revoke all on function public.can_manage_finance(bigint, uuid) from public, anon;
grant execute on function public.can_manage_finance(bigint, uuid) to authenticated;

create or replace function public.can_manage_activities(
  p_club_id bigint,
  p_user_id uuid default auth.uid()
) returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := coalesce(p_user_id, auth.uid());
  v_perm boolean;
  v_rec record;
begin
  if not exists(select 1 from public.clubs where id = p_club_id and status = 'active' and deleted_at is null) then
    return false;
  end if;

  v_perm := public.has_club_permission(p_club_id, 'can_manage_activities', v_uid);
  if v_perm is not null then return v_perm; end if;

  select role, title into v_rec
  from public.club_members
  where club_id = p_club_id and user_id = v_uid and status = 'active'
  limit 1;

  if not found then return false; end if;

  return v_rec.role in ('owner', 'co_owner', 'general_manager')
    or lower(coalesce(v_rec.title, '')) ~* '(chủ nhiệm|truyền thông|đối ngoại|media)';
end;
$$;

revoke all on function public.can_manage_activities(bigint, uuid) from public, anon;
grant execute on function public.can_manage_activities(bigint, uuid) to authenticated;

create or replace function public.can_view_activities(
  p_club_id bigint,
  p_user_id uuid default auth.uid()
) returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.can_manage_activities(p_club_id, p_user_id);
$$;

revoke all on function public.can_view_activities(bigint, uuid) from public, anon;
grant execute on function public.can_view_activities(bigint, uuid) to authenticated;

create or replace function public.can_manage_attendance(
  p_club_id bigint,
  p_user_id uuid default auth.uid()
) returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := coalesce(p_user_id, auth.uid());
  v_perm boolean;
  v_rec record;
begin
  if not exists(select 1 from public.clubs where id = p_club_id and status = 'active' and deleted_at is null) then
    return false;
  end if;

  v_perm := public.has_club_permission(p_club_id, 'can_manage_attendance', v_uid);
  if v_perm is not null then return v_perm; end if;

  select role, title into v_rec
  from public.club_members
  where club_id = p_club_id and user_id = v_uid and status = 'active'
  limit 1;

  if not found then return false; end if;

  return v_rec.role in ('owner', 'co_owner')
    or lower(coalesce(v_rec.title, '')) ~* 'chủ nhiệm';
end;
$$;

revoke all on function public.can_manage_attendance(bigint, uuid) from public, anon;
grant execute on function public.can_manage_attendance(bigint, uuid) to authenticated;

create or replace function public.get_my_club_membership(p_club_id bigint)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_is_sysadmin boolean := false;
  v_member record;
  v_board_title text := null;
  v_role text := 'member';
  v_title text := '';
  v_perms jsonb := '{}'::jsonb;
  v_is_owner boolean := false;
  v_is_co_owner boolean := false;
  v_can_view_fin boolean := false;
  v_can_manage_fin boolean := false;
  v_can_manage_ros boolean := false;
  v_can_manage_clb boolean := false;
  v_can_view_inv boolean := false;
  v_can_manage_inv boolean := false;
  v_can_view_act boolean := false;
  v_can_manage_act boolean := false;
  v_can_manage_att boolean := false;
begin
  if v_user_id is null then
    raise exception 'Unauthorized: Chưa đăng nhập';
  end if;

  select coalesce(is_system_admin, false) into v_is_sysadmin
  from public.profiles
  where id = v_user_id;

  if v_is_sysadmin then
    return jsonb_build_object(
      'club_id', p_club_id,
      'user_id', v_user_id,
      'role', 'owner',
      'title', 'Hệ Thống Admin',
      'permissions', jsonb_build_object(
        'can_view_finance', true,
        'can_manage_finance', true,
        'can_manage_roster', true,
        'can_manage_club', true,
        'can_manage_inventory', true,
        'can_view_inventory', true,
        'can_manage_activities', true,
        'can_view_activities', true,
        'can_manage_attendance', true,
        'can_view_attendance', true
      ),
      'is_owner', true,
      'is_co_owner', true,
      'is_system_admin', true,
      'can_view_finance', true,
      'can_manage_finance', true,
      'can_manage_roster', true,
      'can_manage_club', true,
      'can_manage_inventory', true,
      'can_view_inventory', true,
      'can_manage_activities', true,
      'can_view_activities', true,
      'can_manage_attendance', true,
      'can_view_attendance', true
    );
  end if;

  select role, title, coalesce(permissions, '{}'::jsonb) as permissions
  into v_member
  from public.club_members
  where club_id = p_club_id and user_id = v_user_id and status = 'active'
  limit 1;

  if v_member is null then
    raise exception 'Forbidden: Không phải thành viên hoạt động của CLB';
  end if;

  v_role := v_member.role;
  v_title := coalesce(v_member.title, '');
  v_perms := v_member.permissions;
  v_is_owner := (v_role = 'owner');
  v_is_co_owner := (v_role = 'co_owner' or lower(v_title) ~* 'phó chủ nhiệm');

  -- Lấy chức danh hiển thị BCN (chỉ để tham khảo hiển thị, không tự cấp quyền)
  select bm.title into v_board_title
  from public.club_board_members bm
  join public.player_profiles p on p.id = bm.player_id
  where bm.club_id = p_club_id
    and bm.archived_at is null
    and (p.user_id = v_user_id or lower(p.email) = lower((select email from public.profiles where id = v_user_id)))
  limit 1;

  -- Chủ nhiệm và Phó chủ nhiệm có đầy đủ mọi quyền quản lý trong CLB
  if v_is_owner or v_is_co_owner then
    return jsonb_build_object(
      'club_id', p_club_id,
      'user_id', v_user_id,
      'role', v_role,
      'title', v_title,
      'board_title', v_board_title,
      'permissions', v_perms,
      'is_owner', v_is_owner,
      'is_co_owner', v_is_co_owner,
      'is_system_admin', false,
      'can_view_finance', true,
      'can_manage_finance', true,
      'can_manage_roster', true,
      'can_manage_club', true,
      'can_manage_inventory', true,
      'can_view_inventory', true,
      'can_manage_activities', true,
      'can_view_activities', true,
      'can_manage_attendance', true,
      'can_view_attendance', true
    );
  end if;

  -- Phân vùng chuẩn cho các chức vụ khác & quyền cấp thêm:
  -- 1. Tài chính (Thủ quỹ / Kế toán / hoặc được tick can_view_finance / can_manage_finance)
  v_can_manage_fin := coalesce((v_perms->>'can_manage_finance')::boolean, (
    v_role in ('general_manager', 'treasurer')
    or lower(v_title) ~* '(thủ quỹ|kế toán)'
  ));
  v_can_view_fin := v_can_manage_fin or coalesce((v_perms->>'can_view_finance')::boolean, (
    v_role in ('general_manager', 'treasurer')
    or lower(v_title) ~* '(thủ quỹ|kế toán)'
  ));

  -- 2. Nhân sự & Đội bóng
  v_can_manage_ros := coalesce((v_perms->>'can_manage_roster')::boolean, (
    v_role in ('general_manager', 'hr_manager', 'sporting_manager')
  ));

  -- 3. Quản trị CLB
  v_can_manage_clb := coalesce((v_perms->>'can_manage_club')::boolean, (
    v_role = 'general_manager'
  ));

  -- 4. Kho trang bị
  v_can_manage_inv := coalesce((v_perms->>'can_manage_inventory')::boolean, (
    v_role in ('general_manager', 'equipment_manager')
  ));
  v_can_view_inv := v_can_manage_inv or coalesce((v_perms->>'can_view_inventory')::boolean, (
    v_role in ('general_manager', 'equipment_manager', 'sporting_manager')
  ));

  -- 5. Hoạt động CLB (Truyền thông, Đối ngoại, hoặc được tick can_manage_activities)
  v_can_manage_act := coalesce((v_perms->>'can_manage_activities')::boolean, (
    v_role = 'general_manager'
    or lower(v_title) ~* '(truyền thông|đối ngoại|media)'
  ));
  v_can_view_act := v_can_manage_act;

  -- 6. Điểm danh (Tách riêng: thành viên mặc định chỉ xem, chỉ người được cấp quyền mới được bấm/quản lý)
  v_can_manage_att := coalesce((v_perms->>'can_manage_attendance')::boolean, false);

  return jsonb_build_object(
    'club_id', p_club_id,
    'user_id', v_user_id,
    'role', v_role,
    'title', v_title,
    'board_title', v_board_title,
    'permissions', v_perms,
    'is_owner', false,
    'is_co_owner', false,
    'is_system_admin', false,
    'can_view_finance', v_can_view_fin,
    'can_manage_finance', v_can_manage_fin,
    'can_manage_roster', v_can_manage_ros,
    'can_manage_club', v_can_manage_clb,
    'can_manage_inventory', v_can_manage_inv,
    'can_view_inventory', v_can_view_inv,
    'can_manage_activities', v_can_manage_act,
    'can_view_activities', v_can_view_act,
    'can_manage_attendance', v_can_manage_att,
    'can_view_attendance', true
  );
end;
$$;

revoke all on function public.get_my_club_membership(bigint) from public, anon;
grant execute on function public.get_my_club_membership(bigint) to authenticated;

-- Cho phép Chủ nhiệm và Phó chủ nhiệm cập nhật phân quyền cho thành viên (trừ tài khoản Chủ nhiệm)
create or replace function public.update_member_custom_permissions(
  p_club_id bigint,
  p_member_id bigint,
  p_permissions jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_target public.club_members;
begin
  if not (
    public.is_club_owner(p_club_id, v_actor_id)
    or public.is_club_co_owner(p_club_id, v_actor_id)
    or public.is_system_admin(v_actor_id)
  ) then
    raise exception 'forbidden';
  end if;

  select * into v_target from public.club_members
  where club_id = p_club_id and id = p_member_id for update;

  if not found then
    raise exception 'member_not_found';
  end if;

  if v_target.role = 'owner' then
    raise exception 'cannot_restrict_owner';
  end if;

  update public.club_members
  set permissions = coalesce(p_permissions, '{}'::jsonb), updated_at = now()
  where club_id = p_club_id and id = p_member_id
  returning * into v_target;

  insert into public.audit_logs(club_id, actor_id, action, subject_type, subject_id)
  values(p_club_id, v_actor_id, 'member.permissions_updated', 'ClubMember', v_target.id);

  return jsonb_build_object('id', v_target.id, 'permissions', v_target.permissions);
end;
$$;

revoke all on function public.update_member_custom_permissions(bigint, bigint, jsonb) from public, anon;
grant execute on function public.update_member_custom_permissions(bigint, bigint, jsonb) to authenticated;

-- Cập nhật RPC save_training_attendance sử dụng quyền can_manage_attendance
create or replace function public.save_training_attendance(
  p_club_id bigint,
  p_training_id bigint,
  p_attendance jsonb,
  p_expected_updated_at timestamptz default null
) returns public.team_trainings
language plpgsql
security definer
set search_path = public
as $$
declare
  row_value public.team_trainings;
  v_entry jsonb;
  v_player_id bigint;
begin
  if not public.can_manage_attendance(p_club_id)
     or jsonb_typeof(p_attendance) <> 'array' then
    raise exception 'forbidden_or_invalid';
  end if;

  select * into row_value from public.team_trainings
  where club_id = p_club_id and id = p_training_id for update;

  if row_value.id is null or row_value.training_status <> 'scheduled' then
    raise exception 'training_not_available';
  end if;

  if p_expected_updated_at is not null and row_value.updated_at <> p_expected_updated_at then
    raise exception 'attendance_stale_reload';
  end if;

  for v_entry in select value from jsonb_array_elements(p_attendance) loop
    v_player_id := nullif(v_entry->>'player_id', '')::bigint;
    if v_player_id is null
       or coalesce(v_entry->>'status', '') not in ('present', 'absent', 'excused')
       or not exists (select 1 from public.player_profiles p where p.club_id = p_club_id and p.id = v_player_id) then
      raise exception 'invalid_attendance_entry';
    end if;
  end loop;

  perform set_config('app.fcms_training_attendance_write', 'on', true);
  update public.team_trainings set attendance = p_attendance
  where id = row_value.id returning * into row_value;

  insert into public.audit_logs(club_id, actor_id, action, subject_type, subject_id)
  values (p_club_id, auth.uid(), 'training.attendance_saved', 'TeamTraining', p_training_id);

  return row_value;
end;
$$;

revoke all on function public.save_training_attendance(bigint, bigint, jsonb, timestamptz) from public, anon;
grant execute on function public.save_training_attendance(bigint, bigint, jsonb, timestamptz) to authenticated;

-- RLS cho team_trainings: mọi thành viên CLB được xem, chỉ người có quyền can_manage_attendance mới được ghi/sửa/xóa
drop policy if exists trainings_read on public.team_trainings;
create policy trainings_read on public.team_trainings
  for select to authenticated
  using (public.is_active_member(club_id));

drop policy if exists trainings_write on public.team_trainings;
create policy trainings_write on public.team_trainings
  for all to authenticated
  using (public.can_manage_attendance(club_id))
  with check (public.can_manage_attendance(club_id));
