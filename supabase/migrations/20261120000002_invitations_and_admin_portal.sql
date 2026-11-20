-- 20261120000002_invitations_and_admin_portal.sql
-- 1. Upgrade club_invitations: invite_code, title, permissions, status, flexible email (for test invite codes)
-- 2. Enhanced create_club_invitation, accept_club_invitation, list_club_invitations, revoke_club_invitation
-- 3. System Admin Portal RPCs: system stats, all clubs management, all users management

-- 1. Enhance public.club_invitations
alter table public.club_invitations
  add column if not exists invite_code varchar(32),
  add column if not exists title varchar(120) default 'Thành viên',
  add column if not exists permissions jsonb default '{}'::jsonb,
  add column if not exists status varchar(20) not null default 'pending',
  add column if not exists accepted_by uuid references public.profiles(id);

-- Make email nullable on club_invitations to support test/public invite codes
alter table public.club_invitations alter column email drop not null;

-- Drop previous unique constraint on (club_id, email) if exists so multiple test codes can exist
alter table public.club_invitations drop constraint if exists club_invitations_club_id_email_key;

-- Ensure invite_code index
create unique index if not exists club_invitations_invite_code_idx
  on public.club_invitations (invite_code) where invite_code is not null;

-- 2. RPC: create_club_invitation
drop function if exists public.create_club_invitation(bigint, text, public.club_role, text, jsonb) cascade;
drop function if exists public.create_club_invitation(bigint, text, public.club_role) cascade;
create or replace function public.create_club_invitation(
  p_club_id bigint,
  p_email text default null,
  p_role public.club_role default 'member',
  p_title text default 'Thành viên',
  p_permissions jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_token text := encode(extensions.gen_random_bytes(24), 'hex');
  v_raw_code text := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
  v_code text := 'INV-' || v_raw_code;
  v_inv public.club_invitations;
  v_actor_role public.club_role := public.club_role(p_club_id);
  v_norm_email text := nullif(lower(trim(coalesce(p_email, ''))), '');
  v_title text := coalesce(nullif(trim(p_title), ''), 'Thành viên');
  v_perms jsonb := coalesce(p_permissions, '{}'::jsonb);
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  -- Permission check: must be owner, system admin, or have can_manage_club / can_manage_roster
  if not (
    public.is_system_admin(auth.uid())
    or public.is_club_owner(p_club_id, auth.uid())
    or public.has_club_permission(p_club_id, 'can_manage_club', auth.uid())
    or public.has_club_permission(p_club_id, 'can_manage_roster', auth.uid())
    or v_actor_role in ('owner', 'co_owner', 'general_manager', 'hr_manager')
  ) then
    raise exception 'forbidden';
  end if;

  -- Check club active
  if not exists(select 1 from public.clubs where id = p_club_id and status = 'active') then
    raise exception 'inactive_club';
  end if;

  -- Check if specific email is already active member
  if v_norm_email is not null then
    if exists(
      select 1 from public.club_members m
      join public.profiles p on p.id = m.user_id
      where m.club_id = p_club_id and m.status = 'active' and lower(p.email) = v_norm_email
    ) then
      raise exception 'already_member';
    end if;
  end if;

  insert into public.club_invitations (
    club_id,
    invited_by,
    email,
    role,
    title,
    permissions,
    invite_code,
    token_hash,
    status,
    expires_at
  ) values (
    p_club_id,
    auth.uid(),
    v_norm_email,
    p_role,
    v_title,
    v_perms,
    v_code,
    encode(extensions.digest(v_token, 'sha256'), 'hex'),
    'pending',
    now() + interval '7 days'
  )
  returning * into v_inv;

  return jsonb_build_object(
    'id', v_inv.id,
    'club_id', v_inv.club_id,
    'email', v_inv.email,
    'role', v_inv.role,
    'title', v_inv.title,
    'permissions', v_inv.permissions,
    'invite_code', v_inv.invite_code,
    'token', v_token,
    'expires_at', v_inv.expires_at
  );
end $$;

revoke all on function public.create_club_invitation(bigint, text, public.club_role, text, jsonb) from public;
grant execute on function public.create_club_invitation(bigint, text, public.club_role, text, jsonb) to authenticated;

-- Overload for backwards compatibility
create or replace function public.create_club_invitation(
  p_club_id bigint,
  p_email text,
  p_role public.club_role
) returns jsonb language sql security definer set search_path = public as $$
  select public.create_club_invitation(p_club_id, p_email, p_role, 'Thành viên', '{}'::jsonb);
$$;

revoke all on function public.create_club_invitation(bigint, text, public.club_role) from public;
grant execute on function public.create_club_invitation(bigint, text, public.club_role) to authenticated;

-- 3. RPC: accept_club_invitation (accepts code, hex token, or plain token)
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
  v_player_id bigint;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  select * into v_user_profile from public.profiles where id = auth.uid();
  if v_user_profile.id is null then
    raise exception 'profile_not_found';
  end if;

  -- If user pasted a full URL or query parameter (e.g. #accept?token=INV-XXXXXX or token=INV-XXXXXX)
  if v_clean ~* 'token=' then
    v_clean := regexp_replace(v_clean, '^.*[?&#]token=([^&#]+).*$', '\1');
  end if;
  v_clean := trim(v_clean);
  v_hash := encode(extensions.digest(v_clean, 'sha256'), 'hex');

  -- Match either by invite_code, token_hash, or direct token
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

  -- Check if user is already the owner of this club
  if exists (
    select 1 from public.club_members
    where club_id = v_inv.club_id and user_id = auth.uid() and role = 'owner' and status = 'active'
  ) then
    raise exception 'already_owner_cannot_demote';
  end if;

  -- Check club status
  select * into v_club from public.clubs where id = v_inv.club_id for update;
  if v_club.id is null or v_club.status <> 'active' then
    raise exception 'inactive_club';
  end if;

  -- If specific email was specified and not matching
  if v_inv.email is not null and v_inv.email <> '' then
    if lower(v_inv.email) <> lower(v_user_profile.email) and not public.is_system_admin(auth.uid()) then
      raise exception 'email_mismatch';
    end if;
  end if;

  -- Add / update member with assigned role, title, and permissions
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

  -- Link or create player profile
  select id into v_player_id from public.player_profiles
  where club_id = v_inv.club_id
    and (user_id = auth.uid() or (user_id is null and lower(email) = lower(v_user_profile.email)))
  order by (user_id is not null) desc, id asc
  limit 1;

  if v_player_id is not null then
    update public.player_profiles
    set user_id = auth.uid(),
        full_name = coalesce(nullif(full_name, ''), v_user_profile.name, 'Thành viên'),
        status = 'active',
        updated_at = now()
    where id = v_player_id;
  else
    insert into public.player_profiles (
      club_id,
      user_id,
      full_name,
      email,
      status
    ) values (
      v_inv.club_id,
      auth.uid(),
      coalesce(nullif(v_user_profile.name, ''), 'Thành viên mới'),
      v_user_profile.email,
      'active'
    )
    on conflict do nothing;
  end if;

  -- Mark invitation accepted
  update public.club_invitations
  set status = 'accepted',
      accepted_at = now(),
      accepted_by = auth.uid(),
      updated_at = now()
  where id = v_inv.id;

  -- Audit log
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

-- 4. RPC: list_club_invitations
create or replace function public.list_club_invitations(p_club_id bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_rows jsonb;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  if not (
    public.is_system_admin(auth.uid())
    or public.is_club_owner(p_club_id, auth.uid())
    or public.has_club_permission(p_club_id, 'can_manage_club', auth.uid())
    or public.has_club_permission(p_club_id, 'can_manage_roster', auth.uid())
    or public.club_role(p_club_id) in ('owner', 'co_owner', 'general_manager', 'hr_manager')
  ) then
    raise exception 'forbidden';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', i.id,
        'club_id', i.club_id,
        'email', i.email,
        'role', i.role,
        'title', i.title,
        'permissions', i.permissions,
        'invite_code', i.invite_code,
        'status', case
          when i.status = 'pending' and i.expires_at < now() then 'expired'
          else i.status
        end,
        'expires_at', i.expires_at,
        'created_at', i.created_at,
        'accepted_at', i.accepted_at,
        'creator_name', creator.name,
        'accepted_by_name', accepter.name
      )
      order by i.created_at desc
    ),
    '[]'::jsonb
  ) into v_rows
  from public.club_invitations i
  left join public.profiles creator on creator.id = i.invited_by
  left join public.profiles accepter on accepter.id = i.accepted_by
  where i.club_id = p_club_id;

  return v_rows;
end $$;

revoke all on function public.list_club_invitations(bigint) from public;
grant execute on function public.list_club_invitations(bigint) to authenticated;

-- 5. RPC: revoke_club_invitation
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

  update public.club_invitations
  set status = 'revoked', updated_at = now()
  where id = v_inv.id and status = 'pending';

  return true;
end $$;

revoke all on function public.revoke_club_invitation(bigint) from public;
grant execute on function public.revoke_club_invitation(bigint) to authenticated;

-- ============================================================================
-- SYSTEM ADMIN PORTAL RPCS
-- ============================================================================

-- 6. RPC: admin_get_system_stats
create or replace function public.admin_get_system_stats()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_total_clubs bigint;
  v_active_clubs bigint;
  v_archived_clubs bigint;
  v_total_users bigint;
  v_active_users bigint;
  v_admin_users bigint;
  v_total_players bigint;
  v_total_transactions bigint;
  v_total_income numeric;
  v_total_expense numeric;
begin
  if not public.is_system_admin(auth.uid()) then
    raise exception 'forbidden_admin_only';
  end if;

  select count(*),
         count(*) filter (where status = 'active'),
         count(*) filter (where status = 'archived')
  into v_total_clubs, v_active_clubs, v_archived_clubs
  from public.clubs;

  select count(*),
         count(*) filter (where is_active = true),
         count(*) filter (where is_system_admin = true)
  into v_total_users, v_active_users, v_admin_users
  from public.profiles;

  select count(*) into v_total_players from public.player_profiles;

  select count(*),
         coalesce(sum(amount) filter (where type = 'income'), 0),
         coalesce(sum(amount) filter (where type = 'expense'), 0)
  into v_total_transactions, v_total_income, v_total_expense
  from public.finance_transactions;

  return jsonb_build_object(
    'total_clubs', v_total_clubs,
    'active_clubs', v_active_clubs,
    'archived_clubs', v_archived_clubs,
    'total_users', v_total_users,
    'active_users', v_active_users,
    'admin_users', v_admin_users,
    'total_players', v_total_players,
    'total_transactions', v_total_transactions,
    'total_income', v_total_income,
    'total_expense', v_total_expense
  );
end $$;

revoke all on function public.admin_get_system_stats() from public;
grant execute on function public.admin_get_system_stats() to authenticated;

-- 7. RPC: admin_list_all_clubs
create or replace function public.admin_list_all_clubs()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_clubs jsonb;
begin
  if not public.is_system_admin(auth.uid()) then
    raise exception 'forbidden_admin_only';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', c.id,
        'name', c.name,
        'description', c.description,
        'city', c.city,
        'home_ground', c.home_ground,
        'format', c.format,
        'formats', c.formats,
        'status', c.status,
        'activity_start_date', c.activity_start_date,
        'created_at', c.created_at,
        'owner_name', owner_p.name,
        'owner_email', owner_p.email,
        'member_count', (
          select count(*) from public.club_members m
          where m.club_id = c.id and m.status = 'active'
        ),
        'player_count', (
          select count(*) from public.player_profiles p
          where p.club_id = c.id
        )
      )
      order by c.created_at desc
    ),
    '[]'::jsonb
  ) into v_clubs
  from public.clubs c
  left join public.club_members owner_m on owner_m.club_id = c.id and owner_m.role = 'owner' and owner_m.status = 'active'
  left join public.profiles owner_p on owner_p.id = owner_m.user_id;

  return v_clubs;
end $$;

revoke all on function public.admin_list_all_clubs() from public;
grant execute on function public.admin_list_all_clubs() to authenticated;

-- 8. RPC: admin_toggle_club_status
create or replace function public.admin_toggle_club_status(
  p_club_id bigint,
  p_status text
) returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not public.is_system_admin(auth.uid()) then
    raise exception 'forbidden_admin_only';
  end if;

  if p_status not in ('active', 'archived') then
    raise exception 'invalid_status';
  end if;

  update public.clubs
  set status = p_status, updated_at = now()
  where id = p_club_id;

  return jsonb_build_object('id', p_club_id, 'status', p_status);
end $$;

revoke all on function public.admin_toggle_club_status(bigint, text) from public;
grant execute on function public.admin_toggle_club_status(bigint, text) to authenticated;

-- 9. RPC: admin_list_all_users
create or replace function public.admin_list_all_users()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_users jsonb;
begin
  if not public.is_system_admin(auth.uid()) then
    raise exception 'forbidden_admin_only';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', p.id,
        'name', p.name,
        'email', p.email,
        'is_system_admin', p.is_system_admin,
        'is_active', coalesce(p.is_active, true),
        'avatar_path', p.avatar_path,
        'created_at', p.created_at,
        'club_count', (
          select count(*) from public.club_members m
          where m.user_id = p.id and m.status = 'active'
        )
      )
      order by p.created_at desc
    ),
    '[]'::jsonb
  ) into v_users
  from public.profiles p;

  return v_users;
end $$;

revoke all on function public.admin_list_all_users() from public;
grant execute on function public.admin_list_all_users() to authenticated;

-- 10. RPC: admin_set_user_admin
create or replace function public.admin_set_user_admin(
  p_user_id uuid,
  p_is_admin boolean
) returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not public.is_system_admin(auth.uid()) then
    raise exception 'forbidden_admin_only';
  end if;

  -- Prevent self demotion to avoid locking out the last admin
  if p_user_id = auth.uid() and not p_is_admin then
    raise exception 'cannot_demote_self';
  end if;

  update public.profiles
  set is_system_admin = p_is_admin, updated_at = now()
  where id = p_user_id;

  return jsonb_build_object('id', p_user_id, 'is_system_admin', p_is_admin);
end $$;

revoke all on function public.admin_set_user_admin(uuid, boolean) from public;
grant execute on function public.admin_set_user_admin(uuid, boolean) to authenticated;

-- 11. RPC: admin_toggle_user_active
create or replace function public.admin_toggle_user_active(
  p_user_id uuid,
  p_is_active boolean
) returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not public.is_system_admin(auth.uid()) then
    raise exception 'forbidden_admin_only';
  end if;

  if p_user_id = auth.uid() and not p_is_active then
    raise exception 'cannot_deactivate_self';
  end if;

  update public.profiles
  set is_active = p_is_active, updated_at = now()
  where id = p_user_id;

  return jsonb_build_object('id', p_user_id, 'is_active', p_is_active);
end $$;

revoke all on function public.admin_toggle_user_active(uuid, boolean) from public;
grant execute on function public.admin_toggle_user_active(uuid, boolean) to authenticated;
