-- 20261120000001_club_activity_start_and_hardened_permissions.sql

-- 1. Bổ sung cột ngày bắt đầu hoạt động CLB (activity_start_date) vào bảng public.clubs
alter table public.clubs
  add column if not exists activity_start_date date default now()::date;

-- Đảm bảo maintenance_fee và activity_start_date có đầy đủ quyền cho authenticated
grant select, insert, update, delete on public.clubs to authenticated;
grant select, insert, update, delete on public.player_profiles to authenticated;
grant delete on public.teams to authenticated;
grant delete on public.board_tasks to authenticated;

-- Đảm bảo authenticated có toàn quyền SELECT trên profiles và sequence
grant select on public.profiles to authenticated;
grant select (id,name,email,is_system_admin,is_active,avatar_path,created_at,updated_at) on table public.profiles to authenticated;

-- Đảm bảo mọi tài khoản auth.users đều có hồ sơ trong public.profiles
insert into public.profiles (id, name, email, is_active)
select u.id, coalesce(u.raw_user_meta_data->>'name', ''), lower(u.email), true
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null
on conflict (id) do nothing;

-- Tự động xác minh email cho toàn bộ tài khoản để không bị chặn đăng nhập
update auth.users
set email_confirmed_at = coalesce(email_confirmed_at, now())
where email_confirmed_at is null;

-- Tự động xác minh email cho mọi người dùng đăng ký mới
create or replace function public.auto_confirm_new_user()
returns trigger language plpgsql security definer set search_path = auth, public as $$
begin
  if new.email_confirmed_at is null then
    new.email_confirmed_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_auto_confirm on auth.users;
create trigger on_auth_user_auto_confirm
  before insert on auth.users
  for each row execute function public.auto_confirm_new_user();

-- 2. Cập nhật commit_member_import loại bỏ academic_year, không ghi nhận ngày bắt đầu hoạt động CLB khi import
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
        notes = nullif(row_value->>'notes', '')
      where club_id = p_club_id and id = target_id;

      overwritten_count := overwritten_count + 1;
    elsif action = 'create' then
      insert into public.player_profiles(
        club_id, full_name, email, phone, date_of_birth, position, preferred_foot, status, notes
      ) values (
        p_club_id,
        row_value->>'full_name',
        nullif(lower(row_value->>'email'), ''),
        nullif(row_value->>'phone', ''),
        nullif(row_value->>'date_of_birth', '')::date,
        nullif(row_value->>'position', ''),
        nullif(row_value->>'preferred_foot', ''),
        coalesce(nullif(row_value->>'status', ''), 'active')::public.player_status,
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

-- 3. Cập nhật create_club:
--    - Tự động tạo hồ sơ player_profiles cho người tạo CLB
--    - Tự động bổ nhiệm Chủ nhiệm CLB vào club_board_members
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

  -- Tự động tạo hồ sơ cầu thủ cho người tạo CLB
  select * into v_user_profile from public.profiles where id = auth.uid();
  insert into public.player_profiles(club_id, user_id, full_name, email, status)
  values(
    c.id,
    auth.uid(),
    coalesce(nullif(v_user_profile.name, ''), 'Chủ nhiệm CLB'),
    v_user_profile.email,
    'active'
  )
  on conflict do nothing
  returning id into v_player_id;

  if v_player_id is null then
    select id into v_player_id from public.player_profiles
    where club_id = c.id and user_id = auth.uid();
  end if;

  -- Bổ nhiệm vào Ban Chủ Nhiệm với chức danh Chủ nhiệm CLB
  if v_player_id is not null then
    insert into public.club_board_members(club_id, player_id, title)
    values(c.id, v_player_id, 'Chủ nhiệm CLB')
    on conflict do nothing;
  end if;

  insert into public.audit_logs(club_id, actor_id, action, subject_type, subject_id)
  values(c.id, auth.uid(), 'club.created', 'Club', c.id);

  return c;
end $$;

revoke all on function public.create_club(text, text, text, text, jsonb) from public;
grant execute on function public.create_club(text, text, text, text, jsonb) to authenticated;

-- 4. Cập nhật accept_club_invitation:
--    - Tự động liên kết hồ sơ cầu thủ có cùng email nếu chưa link user_id
--    - Nếu chưa có hồ sơ cầu thủ thì tự động tạo mới
create or replace function public.accept_club_invitation(p_token uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  inv public.club_invitations;
  m public.club_members;
  v_user_profile public.profiles;
  v_player_id bigint;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  select * into inv from public.club_invitations
  where token = p_token and status = 'pending' and expires_at > now()
  for update;

  if not found then
    raise exception 'invalid_or_expired_token';
  end if;

  select * into v_user_profile from public.profiles where id = auth.uid();

  if lower(inv.email) <> lower(v_user_profile.email) and not public.is_system_admin(auth.uid()) then
    raise exception 'email_mismatch';
  end if;

  -- Thêm hoặc cập nhật vai trò trong club_members
  insert into public.club_members(club_id, user_id, role, status, title, permissions)
  values(inv.club_id, auth.uid(), inv.role, 'active', 'Thành viên', '{}'::jsonb)
  on conflict (club_id, user_id) do update
  set role = excluded.role, status = 'active', updated_at = now()
  returning * into m;

  -- Tự động liên kết player_profiles theo email
  select id into v_player_id from public.player_profiles
  where club_id = inv.club_id and lower(email) = lower(inv.email)
  order by id limit 1;

  if v_player_id is not null then
    update public.player_profiles
    set user_id = auth.uid()
    where id = v_player_id and user_id is null;
  else
    insert into public.player_profiles(club_id, user_id, full_name, email, status)
    values(
      inv.club_id,
      auth.uid(),
      coalesce(nullif(v_user_profile.name, ''), 'Thành viên mới'),
      v_user_profile.email,
      'active'
    )
    on conflict do nothing;
  end if;

  update public.club_invitations
  set status = 'accepted', accepted_by = auth.uid(), updated_at = now()
  where id = inv.id;

  insert into public.audit_logs(club_id, actor_id, action, subject_type, subject_id)
  values(inv.club_id, auth.uid(), 'invitation.accepted', 'ClubInvitation', inv.id);

  return jsonb_build_object('id', inv.club_id, 'membership_id', m.id);
end $$;

revoke all on function public.accept_club_invitation(uuid) from public;
grant execute on function public.accept_club_invitation(uuid) to authenticated;

-- 5. Cho phép system admin xem tất cả profiles
create or replace function public.can_view_profile(p_target_id uuid, p_viewer_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select p_viewer_id is not null and (
    p_viewer_id = p_target_id
    or public.is_system_admin(p_viewer_id)
    or exists (
      select 1 from public.club_members m1
      join public.club_members m2 on m2.club_id = m1.club_id
      where m1.user_id = p_viewer_id
        and m2.user_id = p_target_id
        and m1.status = 'active'
        and m2.status = 'active'
    )
  );
$$;

revoke all on function public.can_view_profile(uuid, uuid) from public, anon;
grant execute on function public.can_view_profile(uuid, uuid) to authenticated;
