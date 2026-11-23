-- 20261122000007_fix_admin_portal_clubs_and_stats.sql
-- Fix và tối ưu hóa các hàm RPC Quản trị viên hệ thống (System Admin):
-- 1. admin_list_all_clubs: hiển thị đầy đủ mọi CLB trong hệ thống bất kể có owner hay không,
--    kèm số lượng thành viên, cầu thủ, ngày bắt đầu hoạt động, không bị lỗi khi bảng thiếu dữ liệu.
-- 2. admin_get_system_stats: tổng hợp thống kê toàn hệ thống chuẩn xác.
-- 3. admin_list_all_users: danh sách toàn bộ người dùng và số CLB tham gia.

-- 1. RPC: admin_list_all_clubs
create or replace function public.admin_list_all_clubs()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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
        'description', coalesce(c.description, ''),
        'city', coalesce(c.city, ''),
        'home_ground', coalesce(c.home_ground, ''),
        'format', c.format,
        'formats', coalesce(c.formats, jsonb_build_array(c.format)),
        'status', c.status,
        'activity_start_date', coalesce(c.activity_start_date, c.created_at::date),
        'created_at', c.created_at,
        'avatar_version', c.avatar_path,
        'background_version', c.background_path,
        'owner_name', coalesce(owner_p.name, 'Chưa có'),
        'owner_email', coalesce(owner_p.email, '—'),
        'member_count', (
          select count(*)
          from public.club_members m
          where m.club_id = c.id and m.status = 'active'
        ),
        'player_count', (
          select count(*)
          from public.player_profiles p
          where p.club_id = c.id
        )
      )
      order by c.created_at desc
    ),
    '[]'::jsonb
  ) into v_clubs
  from public.clubs c
  left join lateral (
    select cm.user_id
    from public.club_members cm
    where cm.club_id = c.id and cm.role = 'owner' and cm.status = 'active'
    order by cm.id asc
    limit 1
  ) owner_m on true
  left join public.profiles owner_p on owner_p.id = owner_m.user_id
  where c.deleted_at is null;

  return v_clubs;
end;
$$;

revoke all on function public.admin_list_all_clubs() from public;
grant execute on function public.admin_list_all_clubs() to authenticated;

-- 2. RPC: admin_get_system_stats
create or replace function public.admin_get_system_stats()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total_clubs bigint := 0;
  v_active_clubs bigint := 0;
  v_archived_clubs bigint := 0;
  v_total_users bigint := 0;
  v_active_users bigint := 0;
  v_admin_users bigint := 0;
  v_total_players bigint := 0;
  v_total_transactions bigint := 0;
  v_total_income numeric := 0;
  v_total_expense numeric := 0;
begin
  if not public.is_system_admin(auth.uid()) then
    raise exception 'forbidden_admin_only';
  end if;

  select count(*),
         count(*) filter (where status = 'active'),
         count(*) filter (where status <> 'active')
  into v_total_clubs, v_active_clubs, v_archived_clubs
  from public.clubs
  where deleted_at is null;

  select count(*),
         count(*) filter (where is_active is not false),
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
end;
$$;

revoke all on function public.admin_get_system_stats() from public;
grant execute on function public.admin_get_system_stats() to authenticated;

-- 3. RPC: admin_list_all_users
create or replace function public.admin_list_all_users()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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
        'name', coalesce(p.name, 'Người dùng'),
        'email', p.email,
        'avatar_path', p.avatar_path,
        'is_system_admin', coalesce(p.is_system_admin, false),
        'is_active', coalesce(p.is_active, true),
        'created_at', p.created_at,
        'updated_at', p.updated_at,
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
end;
$$;

revoke all on function public.admin_list_all_users() from public;
grant execute on function public.admin_list_all_users() to authenticated;
