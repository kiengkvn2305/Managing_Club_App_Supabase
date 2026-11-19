-- 20261119000012_custom_permissions_transfer_and_admin.sql
-- 1. Custom Granular Permissions for Club Members
-- 2. Full Power for Club Creator/Owner
-- 3. Ownership Transfer & Demotion
-- 4. Dedicated System Admin Account & Admin Permissions

-- 1. Add permissions column to public.club_members
alter table public.club_members
  add column if not exists permissions jsonb not null default '{}'::jsonb;

-- 2. Helper: Check if user is a system admin
create or replace function public.is_system_admin(p_user_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select exists(
    select 1 from public.profiles
    where id = coalesce(p_user_id, auth.uid())
      and is_system_admin = true
  );
$$;

revoke all on function public.is_system_admin(uuid) from public, anon;
grant execute on function public.is_system_admin(uuid) to authenticated;

-- 3. Helper: Check if user is the active club owner
create or replace function public.is_club_owner(p_club_id bigint, p_user_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select exists(
    select 1 from public.club_members m
    join public.clubs c on c.id = m.club_id
    where m.club_id = p_club_id
      and m.user_id = coalesce(p_user_id, auth.uid())
      and m.status = 'active'
      and m.role = 'owner'
      and c.status = 'active'
      and c.deleted_at is null
  );
$$;

revoke all on function public.is_club_owner(bigint, uuid) from public, anon;
grant execute on function public.is_club_owner(bigint, uuid) to authenticated;

-- 4. Helper: Check custom member permissions with hierarchy:
--    System Admin -> Club Owner -> Member Custom Overrides -> null (fallback to role)
create or replace function public.has_club_permission(
  p_club_id bigint,
  p_permission text,
  p_user_id uuid default auth.uid()
) returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  v_uid uuid := coalesce(p_user_id, auth.uid());
  v_rec record;
begin
  if v_uid is null then
    return false;
  end if;

  -- 1. System admin has all permissions across all clubs
  if public.is_system_admin(v_uid) then
    return true;
  end if;

  -- 2. Club owner has all permissions in their club
  if public.is_club_owner(p_club_id, v_uid) then
    return true;
  end if;

  -- 3. Check member custom permissions override
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

  return null; -- Fallback to standard role/title checks
end;
$$;

revoke all on function public.has_club_permission(bigint, text, uuid) from public, anon;
grant execute on function public.has_club_permission(bigint, text, uuid) to authenticated;

-- 5. Update can_manage_club
create or replace function public.can_manage_club(
  p_club_id bigint,
  p_user_id uuid default auth.uid()
) returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  v_uid uuid := coalesce(p_user_id, auth.uid());
  v_perm boolean;
begin
  v_perm := public.has_club_permission(p_club_id, 'can_manage_club', v_uid);
  if v_perm is not null then return v_perm; end if;

  return coalesce(public.club_role(p_club_id, v_uid) in ('owner', 'co_owner', 'general_manager'), false);
end;
$$;

revoke all on function public.can_manage_club(bigint, uuid) from public, anon;
grant execute on function public.can_manage_club(bigint, uuid) to authenticated;

-- 6. Update can_manage_roster
create or replace function public.can_manage_roster(
  p_club_id bigint,
  p_user_id uuid default auth.uid()
) returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  v_uid uuid := coalesce(p_user_id, auth.uid());
  v_perm boolean;
begin
  v_perm := public.has_club_permission(p_club_id, 'can_manage_roster', v_uid);
  if v_perm is not null then return v_perm; end if;

  return coalesce(
    public.club_role(p_club_id, v_uid) in ('owner', 'co_owner', 'general_manager', 'hr_manager', 'sporting_manager'),
    false
  );
end;
$$;

revoke all on function public.can_manage_roster(bigint, uuid) from public, anon;
grant execute on function public.can_manage_roster(bigint, uuid) to authenticated;

-- 7. Update can_view_finance
create or replace function public.can_view_finance(
  p_club_id bigint,
  p_user_id uuid default auth.uid()
) returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  v_uid uuid := coalesce(p_user_id, auth.uid());
  v_perm boolean;
begin
  v_perm := public.has_club_permission(p_club_id, 'can_view_finance', v_uid);
  if v_perm is not null then return v_perm; end if;

  return (
    public.is_active_member(p_club_id, v_uid) and (
      exists (
        select 1 from public.club_members m
        where m.club_id = p_club_id
          and m.user_id = v_uid
          and m.status = 'active'
          and (
            m.role in ('owner', 'co_owner', 'general_manager', 'treasurer', 'sporting_manager', 'equipment_manager', 'hr_manager')
            or public.is_finance_title(m.title)
          )
      )
      or exists (
        select 1 from public.club_board_members bm
        join public.player_profiles pp on pp.id = bm.player_id
        where bm.club_id = p_club_id
          and bm.archived_at is null
          and (
            pp.user_id = v_uid
            or (
              pp.email is not null
              and lower(pp.email) = lower((select email from public.profiles where id = v_uid))
            )
          )
      )
    )
  );
end;
$$;

revoke all on function public.can_view_finance(bigint, uuid) from public, anon;
grant execute on function public.can_view_finance(bigint, uuid) to authenticated;

-- 8. Update can_manage_finance
create or replace function public.can_manage_finance(
  p_club_id bigint,
  p_user_id uuid default auth.uid()
) returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  v_uid uuid := coalesce(p_user_id, auth.uid());
  v_perm boolean;
begin
  v_perm := public.has_club_permission(p_club_id, 'can_manage_finance', v_uid);
  if v_perm is not null then return v_perm; end if;

  return (
    public.is_active_member(p_club_id, v_uid) and (
      exists (
        select 1 from public.club_members m
        where m.club_id = p_club_id
          and m.user_id = v_uid
          and m.status = 'active'
          and (
            m.role in ('owner', 'co_owner', 'general_manager', 'treasurer')
            or public.is_finance_title(m.title)
          )
      )
      or exists (
        select 1 from public.club_board_members bm
        join public.player_profiles pp on pp.id = bm.player_id
        where bm.club_id = p_club_id
          and bm.archived_at is null
          and (
            pp.user_id = v_uid
            or (
              pp.email is not null
              and lower(pp.email) = lower((select email from public.profiles where id = v_uid))
            )
          )
          and (
            public.is_finance_title(bm.title)
            or exists (
              select 1 from public.club_members cm
              where cm.club_id = p_club_id
                and cm.user_id = v_uid
                and cm.role in ('owner', 'co_owner', 'general_manager', 'treasurer')
            )
          )
      )
    )
  );
end;
$$;

revoke all on function public.can_manage_finance(bigint, uuid) from public, anon;
grant execute on function public.can_manage_finance(bigint, uuid) to authenticated;

-- 9. Update can_view_inventory & can_manage_inventory
create or replace function public.can_view_inventory(
  p_club_id bigint,
  p_user_id uuid default auth.uid()
) returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  v_uid uuid := coalesce(p_user_id, auth.uid());
  v_perm boolean;
begin
  v_perm := public.has_club_permission(p_club_id, 'can_manage_inventory', v_uid);
  if v_perm is not null then return v_perm; end if;

  return coalesce(
    public.club_role(p_club_id, v_uid) in ('owner', 'co_owner', 'general_manager', 'equipment_manager', 'sporting_manager'),
    false
  );
end;
$$;

create or replace function public.can_manage_inventory(
  p_club_id bigint,
  p_user_id uuid default auth.uid()
) returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  v_uid uuid := coalesce(p_user_id, auth.uid());
  v_perm boolean;
begin
  v_perm := public.has_club_permission(p_club_id, 'can_manage_inventory', v_uid);
  if v_perm is not null then return v_perm; end if;

  return coalesce(
    public.club_role(p_club_id, v_uid) in ('owner', 'co_owner', 'general_manager', 'equipment_manager'),
    false
  ) and exists(select 1 from public.clubs where id = p_club_id and status = 'active');
end;
$$;

revoke all on function public.can_view_inventory(bigint, uuid) from public, anon;
grant execute on function public.can_view_inventory(bigint, uuid) to authenticated;

revoke all on function public.can_manage_inventory(bigint, uuid) from public, anon;
grant execute on function public.can_manage_inventory(bigint, uuid) to authenticated;

-- 10. Update can_manage_activities & can_view_activities
create or replace function public.can_manage_activities(
  p_club_id bigint,
  p_user_id uuid default auth.uid()
) returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  v_uid uuid := coalesce(p_user_id, auth.uid());
  v_perm boolean;
begin
  v_perm := public.has_club_permission(p_club_id, 'can_manage_activities', v_uid);
  if v_perm is not null then return v_perm; end if;

  return exists(select 1 from public.clubs where id = p_club_id and status = 'active') and (
    public.club_role(p_club_id, v_uid) in ('owner', 'co_owner', 'general_manager', 'hr_manager', 'sporting_manager')
    or exists(
      select 1 from public.club_members
      where club_id = p_club_id
        and user_id = v_uid
        and status = 'active'
        and (title in ('Phó chủ nhiệm CLB', 'Chủ nhiệm CLB') or public.is_finance_title(title))
    )
  );
end;
$$;

create or replace function public.can_view_activities(
  p_club_id bigint,
  p_user_id uuid default auth.uid()
) returns boolean language sql stable security definer set search_path = public as $$
  select public.can_manage_activities(p_club_id, p_user_id) or public.is_active_member(p_club_id, p_user_id);
$$;

revoke all on function public.can_manage_activities(bigint, uuid) from public, anon;
grant execute on function public.can_manage_activities(bigint, uuid) to authenticated;

revoke all on function public.can_view_activities(bigint, uuid) from public, anon;
grant execute on function public.can_view_activities(bigint, uuid) to authenticated;

-- 11. Update can_manage_people
create or replace function public.can_manage_people(
  p_club_id bigint,
  p_user_id uuid default auth.uid()
) returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  v_uid uuid := coalesce(p_user_id, auth.uid());
  v_perm boolean;
begin
  v_perm := public.has_club_permission(p_club_id, 'can_manage_roster', v_uid);
  if v_perm is not null then return v_perm; end if;

  return exists(select 1 from public.clubs where id = p_club_id and status = 'active')
    and public.club_role(p_club_id, v_uid) in ('owner', 'co_owner', 'general_manager', 'hr_manager');
end;
$$;

revoke all on function public.can_manage_people(bigint, uuid) from public, anon;
grant execute on function public.can_manage_people(bigint, uuid) to authenticated;

-- 12. RPC: update_member_custom_permissions
create or replace function public.update_member_custom_permissions(
  p_club_id bigint,
  p_member_id bigint,
  p_permissions jsonb
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_actor_id uuid := auth.uid();
  v_target public.club_members;
begin
  if not (public.is_club_owner(p_club_id, v_actor_id) or public.is_system_admin(v_actor_id)) then
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

-- 13. RPC: transfer_club_ownership
create or replace function public.transfer_club_ownership(
  p_club_id bigint,
  p_new_owner_user_id uuid,
  p_my_new_role public.club_role default 'member'
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_actor_id uuid := auth.uid();
  v_cur_owner public.club_members;
  v_new_owner public.club_members;
begin
  if not (public.is_club_owner(p_club_id, v_actor_id) or public.is_system_admin(v_actor_id)) then
    raise exception 'forbidden';
  end if;

  if p_new_owner_user_id = v_actor_id then
    raise exception 'already_owner';
  end if;

  -- Verify target member is active in club
  select * into v_new_owner from public.club_members
  where club_id = p_club_id and user_id = p_new_owner_user_id and status = 'active'
  for update;

  if not found then
    raise exception 'target_member_not_found_or_inactive';
  end if;

  -- Lock current owner membership
  select * into v_cur_owner from public.club_members
  where club_id = p_club_id and user_id = v_actor_id and role = 'owner' and status = 'active'
  for update;

  if not found and not public.is_system_admin(v_actor_id) then
    raise exception 'not_club_owner';
  end if;

  -- Promote new owner
  update public.club_members
  set role = 'owner', title = coalesce(title, 'Chủ nhiệm CLB'), permissions = '{}'::jsonb, updated_at = now()
  where club_id = p_club_id and id = v_new_owner.id;

  -- Demote previous owner
  if v_cur_owner.id is not null then
    update public.club_members
    set role = coalesce(p_my_new_role, 'member'), permissions = '{}'::jsonb, updated_at = now()
    where club_id = p_club_id and id = v_cur_owner.id;
  end if;

  insert into public.audit_logs(club_id, actor_id, action, subject_type, subject_id)
  values(p_club_id, v_actor_id, 'club.ownership_transferred', 'Club', p_club_id);

  return jsonb_build_object(
    'club_id', p_club_id,
    'new_owner_id', v_new_owner.id,
    'previous_owner_id', coalesce(v_cur_owner.id, 0)
  );
end;
$$;

revoke all on function public.transfer_club_ownership(bigint, uuid, public.club_role) from public, anon;
grant execute on function public.transfer_club_ownership(bigint, uuid, public.club_role) to authenticated;

-- 14. Dedicated System Admin Account
-- Creates or updates admin@fcms.pro with confirmed status and is_system_admin = true
create extension if not exists pgcrypto with schema extensions;

do $$
declare
  v_admin_id uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_encrypted_pw text;
begin
  -- Standard bcrypt hash for: Admin@FCMS2026!
  v_encrypted_pw := extensions.crypt('Admin@FCMS2026!', extensions.gen_salt('bf'));

  -- Upsert into auth.users
  if not exists (select 1 from auth.users where email = 'admin@fcms.pro') then
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, recovery_sent_at, last_sign_in_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, email_change, email_change_token_new, recovery_token
    ) values (
      '00000000-0000-0000-0000-000000000000',
      v_admin_id,
      'authenticated',
      'authenticated',
      'admin@fcms.pro',
      v_encrypted_pw,
      now(),
      now(),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"name":"Hệ Thống Admin"}'::jsonb,
      now(),
      now(),
      '', '', '', ''
    );
  else
    select id into v_admin_id from auth.users where email = 'admin@fcms.pro';
    update auth.users
    set encrypted_password = v_encrypted_pw,
        email_confirmed_at = coalesce(email_confirmed_at, now()),
        raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || '{"name":"Hệ Thống Admin"}'::jsonb,
        updated_at = now()
    where id = v_admin_id;
  end if;

  -- Upsert into public.profiles
  insert into public.profiles (id, name, email, is_system_admin, is_active, created_at, updated_at)
  values (v_admin_id, 'Hệ Thống Admin', 'admin@fcms.pro', true, true, now(), now())
  on conflict (id) do update
  set is_system_admin = true,
      is_active = true,
      name = 'Hệ Thống Admin',
      updated_at = now();
end $$;

-- 15. RLS policies for system admin on core tables
drop policy if exists "clubs_admin_all" on public.clubs;
create policy "clubs_admin_all" on public.clubs
  for all using (public.is_system_admin(auth.uid()));

drop policy if exists "club_members_admin_all" on public.club_members;
create policy "club_members_admin_all" on public.club_members
  for all using (public.is_system_admin(auth.uid()));
