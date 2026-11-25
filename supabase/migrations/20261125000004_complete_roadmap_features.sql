-- Migration: 20261125000004_complete_roadmap_features.sql
-- 1. Dọn cảnh báo lint ở public.create_club (bỏ biến thừa v_player_id)
-- 2. Kho trang bị: Báo cáo & xử lý hỏng/mất thiết bị (tại kho và khi cấp phát thành viên)
-- 3. Trang công khai CLB nâng cao & nộp hồ sơ ứng tuyển mở (an toàn qua RPC cho anon/authenticated)
-- 4. Kết nạp ứng viên trúng tuyển vào danh sách cầu thủ CLB
-- 5. Hệ thống thông báo tự động thông minh theo vai trò và trạng thái đã đọc

-- ============================================================================
-- 1. Sửa create_club loại bỏ biến không dùng v_player_id
-- ============================================================================
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
    (now() at time zone 'Asia/Ho_Chi_Minh')::date
  )
  returning * into c;

  insert into public.club_members(club_id, user_id, role, status, title, permissions)
  values(c.id, auth.uid(), 'owner', 'active', 'Chủ nhiệm CLB', '{}'::jsonb);

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

  insert into public.audit_logs(club_id, actor_id, action, subject_type, subject_id)
  values(c.id, auth.uid(), 'club.created', 'Club', c.id);

  return c;
end $$;

revoke all on function public.create_club(text, text, text, text, jsonb) from public;
grant execute on function public.create_club(text, text, text, text, jsonb) to authenticated;

-- ============================================================================
-- 2. Kho trang bị: Báo cáo & xử lý hỏng / mất thiết bị
-- ============================================================================
create or replace function public.record_inventory_movement(
  p_club_id bigint,
  p_item_id bigint,
  p_type text,
  p_change integer,
  p_reason text
) returns public.inventory_movements language plpgsql security definer set search_path = public as $$
declare
  item public.inventory_items;
  m public.inventory_movements;
  new_balance integer;
begin
  if not public.can_manage_inventory(p_club_id) then
    raise exception 'forbidden';
  end if;

  if p_type not in ('in', 'out', 'adjust', 'damaged', 'lost') or coalesce(trim(p_reason), '') = '' then
    raise exception 'forbidden_or_invalid';
  end if;

  if p_type in ('damaged', 'lost') and p_change >= 0 then
    raise exception 'invalid_incident_quantity';
  end if;

  select * into item
  from public.inventory_items
  where club_id = p_club_id and id = p_item_id
  for update;

  if item.id is null or item.archived then
    raise exception 'invalid_inventory_item';
  end if;

  new_balance := item.quantity + p_change;
  if new_balance < 0 then
    raise exception 'insufficient_inventory';
  end if;

  update public.inventory_items
  set quantity = new_balance
  where club_id = p_club_id and id = p_item_id;

  insert into public.inventory_movements(club_id, inventory_item_id, actor_id, type, change, balance_after, reason)
  values(p_club_id, p_item_id, auth.uid(), p_type, p_change, new_balance, trim(p_reason))
  returning * into m;

  if p_type in ('damaged', 'lost') then
    insert into public.audit_logs(club_id, actor_id, action, subject_type, subject_id)
    values(p_club_id, auth.uid(), 'inventory.' || p_type, 'InventoryItem', p_item_id);
  end if;

  return m;
end $$;

revoke all on function public.record_inventory_movement(bigint, bigint, text, integer, text) from public, anon;
grant execute on function public.record_inventory_movement(bigint, bigint, text, integer, text) to authenticated;

create or replace function public.report_inventory_assignment_incident(
  p_club_id bigint,
  p_item_id bigint,
  p_assignment_id bigint,
  p_incident_type text,
  p_quantity integer,
  p_reason text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_item public.inventory_items;
  v_loan public.inventory_assignments;
  v_next_remaining integer;
  v_label text;
  v_movement_id bigint;
begin
  if not public.can_manage_inventory(p_club_id) then
    raise exception 'forbidden';
  end if;

  if p_incident_type not in ('damaged', 'lost') or coalesce(p_quantity, 0) < 1 or coalesce(trim(p_reason), '') = '' then
    raise exception 'forbidden_or_invalid';
  end if;

  select * into v_item
  from public.inventory_items
  where club_id = p_club_id and id = p_item_id and archived = false
  for update;

  select * into v_loan
  from public.inventory_assignments
  where club_id = p_club_id and inventory_item_id = p_item_id and id = p_assignment_id
  for update;

  if v_item.id is null or v_loan.id is null or v_loan.remaining < p_quantity then
    raise exception 'invalid_incident_report';
  end if;

  v_next_remaining := v_loan.remaining - p_quantity;
  update public.inventory_assignments
  set remaining = v_next_remaining,
      updated_at = now()
  where id = v_loan.id;

  v_label := case
    when p_incident_type = 'damaged' then 'Báo hỏng khi mượn'
    else 'Báo mất khi mượn'
  end;

  insert into public.inventory_movements(
    club_id,
    inventory_item_id,
    inventory_assignment_id,
    actor_id,
    type,
    change,
    balance_after,
    reason
  )
  values(
    p_club_id,
    p_item_id,
    p_assignment_id,
    auth.uid(),
    p_incident_type,
    0,
    v_item.quantity,
    '[' || v_label || ' · ' || v_loan.player_name || ' · SL: ' || p_quantity || '] ' || trim(p_reason)
  )
  returning id into v_movement_id;

  insert into public.audit_logs(club_id, actor_id, action, subject_type, subject_id)
  values(p_club_id, auth.uid(), 'inventory.assignment_' || p_incident_type, 'InventoryAssignment', p_assignment_id);

  return jsonb_build_object(
    'assignment_id', p_assignment_id,
    'remaining', v_next_remaining,
    'quantity', v_item.quantity,
    'movement_id', v_movement_id
  );
end $$;

revoke all on function public.report_inventory_assignment_incident(bigint, bigint, bigint, text, integer, text) from public, anon;
grant execute on function public.report_inventory_assignment_incident(bigint, bigint, bigint, text, integer, text) to authenticated;

create or replace function public.get_inventory_incidents_report(p_club_id bigint)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_rows jsonb;
  v_damaged_count integer;
  v_lost_count integer;
begin
  if not public.can_view_inventory(p_club_id) then
    raise exception 'forbidden';
  end if;

  select
    count(*) filter (where m.type = 'damaged'),
    count(*) filter (where m.type = 'lost')
  into v_damaged_count, v_lost_count
  from public.inventory_movements m
  where m.club_id = p_club_id
    and m.type in ('damaged', 'lost');

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', m.id,
        'inventory_item_id', m.inventory_item_id,
        'item_name', i.name,
        'unit', i.unit,
        'type', m.type,
        'change', m.change,
        'balance_after', m.balance_after,
        'reason', m.reason,
        'player_name', a.player_name,
        'created_at', m.created_at
      )
      order by m.id desc
    ),
    '[]'::jsonb
  )
  into v_rows
  from (
    select *
    from public.inventory_movements
    where club_id = p_club_id
      and type in ('damaged', 'lost')
    order by id desc
    limit 100
  ) m
  join public.inventory_items i
    on i.club_id = m.club_id and i.id = m.inventory_item_id
  left join public.inventory_assignments a
    on a.club_id = m.club_id and a.inventory_item_id = m.inventory_item_id and a.id = m.inventory_assignment_id;

  return jsonb_build_object(
    'damaged_count', coalesce(v_damaged_count, 0),
    'lost_count', coalesce(v_lost_count, 0),
    'data', v_rows
  );
end $$;

revoke all on function public.get_inventory_incidents_report(bigint) from public, anon;
grant execute on function public.get_inventory_incidents_report(bigint) to authenticated;

-- ============================================================================
-- 3. Trang công khai CLB nâng cao & Nộp đơn ứng tuyển trực tuyến
-- ============================================================================
create or replace function public.get_public_club_page(
  p_slug text default null,
  p_club_id bigint default null
) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_club public.clubs;
  v_settings public.club_public_settings;
  v_can_preview boolean := false;
  v_today date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
  v_show_teams boolean;
  v_show_awards boolean;
  v_allow_applications boolean;
  v_teams jsonb := '[]'::jsonb;
  v_awards jsonb := '[]'::jsonb;
  v_posts jsonb := '[]'::jsonb;
  v_teams_count integer := 0;
  v_players_count integer := 0;
  v_matches_count integer := 0;
begin
  if coalesce(trim(p_slug), '') <> '' then
    select c.* into v_club
    from public.clubs c
    left join public.club_public_settings s on s.club_id = c.id
    where c.status = 'active'
      and c.deleted_at is null
      and (
        lower(coalesce(s.public_slug, '')) = lower(trim(p_slug))
        or lower(c.slug) = lower(trim(p_slug))
      )
    order by (lower(coalesce(s.public_slug, '')) = lower(trim(p_slug))) desc
    limit 1;
  elsif p_club_id is not null then
    select * into v_club
    from public.clubs
    where id = p_club_id
      and status = 'active'
      and deleted_at is null;
  end if;

  if v_club.id is null then
    raise exception 'public_club_not_found';
  end if;

  select * into v_settings
  from public.club_public_settings
  where club_id = v_club.id;

  if auth.uid() is not null then
    v_can_preview := public.can_manage_club(v_club.id, auth.uid());
  end if;

  if not coalesce(v_settings.is_published, false) and not v_can_preview then
    raise exception 'public_club_not_published';
  end if;

  v_show_teams := coalesce((v_settings.content->>'show_teams')::boolean, true);
  v_show_awards := coalesce((v_settings.content->>'show_awards')::boolean, true);
  v_allow_applications := coalesce((v_settings.content->>'allow_applications')::boolean, true);

  select count(*) into v_teams_count from public.teams where club_id = v_club.id;
  select count(*) into v_players_count from public.player_profiles where club_id = v_club.id and status = 'active';
  select count(*) into v_matches_count from public.club_matches where club_id = v_club.id;

  if v_show_teams then
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', t.id,
          'name', t.name,
          'format', t.format,
          'members_count', (select count(*) from public.team_players tp where tp.club_id = v_club.id and tp.team_id = t.id)
        )
        order by t.name
      ),
      '[]'::jsonb
    )
    into v_teams
    from public.teams t
    where t.club_id = v_club.id;
  end if;

  if v_show_awards then
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', a.id,
          'award_year', a.award_year,
          'title', a.title,
          'player_name', a.player_name
        )
        order by a.award_year desc, a.id desc
      ),
      '[]'::jsonb
    )
    into v_awards
    from (
      select id, award_year, title, player_name
      from public.club_awards
      where club_id = v_club.id
        and approval_status = 'approved'
      order by award_year desc, id desc
      limit 12
    ) a;
  end if;

  if v_allow_applications then
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', p.id,
          'title', p.title,
          'position', p.position,
          'requirements', p.requirements,
          'deadline', p.deadline
        )
        order by p.created_at desc
      ),
      '[]'::jsonb
    )
    into v_posts
    from public.recruitment_posts p
    where p.club_id = v_club.id
      and p.status = 'open'
      and (p.deadline is null or p.deadline >= v_today);
  end if;

  return jsonb_build_object(
    'club', jsonb_build_object(
      'id', v_club.id,
      'name', v_club.name,
      'slug', coalesce(nullif(v_settings.public_slug, ''), v_club.slug),
      'city', v_club.city,
      'home_ground', v_club.home_ground,
      'formats', coalesce(v_club.formats, jsonb_build_array(v_club.format)),
      'description', v_club.description,
      'activity_start_date', coalesce(v_club.activity_start_date, v_club.created_at::date),
      'is_published', coalesce(v_settings.is_published, false),
      'is_preview', (not coalesce(v_settings.is_published, false) and v_can_preview),
      'headline', v_settings.headline,
      'content', coalesce(v_settings.content, '{}'::jsonb)
    ),
    'stats', jsonb_build_object(
      'teams_count', v_teams_count,
      'active_players_count', v_players_count,
      'matches_count', v_matches_count
    ),
    'teams', v_teams,
    'awards', v_awards,
    'open_posts', v_posts
  );
end $$;

revoke all on function public.get_public_club_page(text, bigint) from public;
grant execute on function public.get_public_club_page(text, bigint) to anon, authenticated;

create or replace function public.submit_public_recruitment_application(
  p_club_id bigint,
  p_post_id bigint,
  p_full_name text,
  p_phone text default null,
  p_email text default null,
  p_date_of_birth date default null,
  p_notes text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_today date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
  v_name text := trim(coalesce(p_full_name, ''));
  v_phone text := nullif(trim(coalesce(p_phone, '')), '');
  v_email text := nullif(lower(trim(coalesce(p_email, ''))), '');
  v_notes text := nullif(trim(coalesce(p_notes, '')), '');
  v_app_id bigint;
begin
  if not exists (
    select 1
    from public.clubs c
    join public.club_public_settings s on s.club_id = c.id
    where c.id = p_club_id
      and c.status = 'active'
      and c.deleted_at is null
      and s.is_published = true
      and coalesce((s.content->>'allow_applications')::boolean, true) = true
  ) then
    raise exception 'public_recruitment_closed';
  end if;

  if not exists (
    select 1
    from public.recruitment_posts p
    where p.club_id = p_club_id
      and p.id = p_post_id
      and p.status = 'open'
      and (p.deadline is null or p.deadline >= v_today)
  ) then
    raise exception 'recruitment_post_closed';
  end if;

  if v_name = '' or char_length(v_name) > 160 then
    raise exception 'invalid_applicant_name';
  end if;

  if v_phone is null and v_email is null then
    raise exception 'invalid_application_contact';
  end if;

  if exists (
    select 1
    from public.recruitment_applications a
    where a.club_id = p_club_id
      and a.post_id = p_post_id
      and a.status in ('new', 'reviewing', 'trial')
      and (
        (v_email is not null and lower(coalesce(a.email, '')) = v_email)
        or (v_phone is not null and coalesce(a.phone, '') = v_phone)
      )
  ) then
    raise exception 'duplicate_application';
  end if;

  insert into public.recruitment_applications(
    club_id,
    post_id,
    full_name,
    date_of_birth,
    email,
    phone,
    notes,
    status
  )
  values(
    p_club_id,
    p_post_id,
    v_name,
    p_date_of_birth,
    v_email,
    v_phone,
    v_notes,
    'new'
  )
  returning id into v_app_id;

  return jsonb_build_object('id', v_app_id, 'status', 'new');
end $$;

revoke all on function public.submit_public_recruitment_application(bigint, bigint, text, text, text, date, text) from public;
grant execute on function public.submit_public_recruitment_application(bigint, bigint, text, text, text, date, text) to anon, authenticated;

-- ============================================================================
-- 4. Kết nạp ứng viên trúng tuyển vào danh sách thành viên CLB
-- ============================================================================
create or replace function public.promote_recruitment_application(
  p_club_id bigint,
  p_application_id bigint
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_app public.recruitment_applications;
  v_player public.player_profiles;
begin
  if not public.can_manage_roster(p_club_id) then
    raise exception 'forbidden';
  end if;

  select * into v_app
  from public.recruitment_applications
  where club_id = p_club_id and id = p_application_id
  for update;

  if v_app.id is null then
    raise exception 'application_not_found';
  end if;

  if v_app.email is not null then
    select * into v_player
    from public.player_profiles
    where club_id = p_club_id
      and lower(coalesce(email, '')) = lower(v_app.email)
    limit 1;
  end if;

  if v_player.id is null then
    insert into public.player_profiles(
      club_id,
      full_name,
      date_of_birth,
      email,
      phone,
      notes,
      status
    )
    values(
      p_club_id,
      v_app.full_name,
      v_app.date_of_birth,
      v_app.email,
      v_app.phone,
      v_app.notes,
      'active'
    )
    returning * into v_player;
  end if;

  update public.recruitment_applications
  set status = 'accepted',
      updated_at = now()
  where id = v_app.id;

  insert into public.audit_logs(club_id, actor_id, action, subject_type, subject_id)
  values(p_club_id, auth.uid(), 'recruitment.promoted', 'PlayerProfile', v_player.id);

  return jsonb_build_object(
    'application_id', v_app.id,
    'player_id', v_player.id,
    'full_name', v_player.full_name
  );
end $$;

revoke all on function public.promote_recruitment_application(bigint, bigint) from public, anon;
grant execute on function public.promote_recruitment_application(bigint, bigint) to authenticated;

-- ============================================================================
-- 5. Hệ thống thông báo tự động thông minh theo vai trò thành viên
-- ============================================================================
alter table public.club_members
  add column if not exists notification_read_keys jsonb not null default '[]'::jsonb;

create or replace function public.get_my_club_notifications(p_club_id bigint)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_today date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
  v_month_start date := date_trunc('month', (now() at time zone 'Asia/Ho_Chi_Minh')::date)::date;
  v_read_keys jsonb := '[]'::jsonb;
  v_items jsonb := '[]'::jsonb;
  v_user_email text;
  v_can_fin boolean;
  v_can_inv boolean;
  v_can_club boolean;
  v_can_roster boolean;
  v_can_act boolean;
  v_rec record;
  v_count integer;
  v_max_id bigint;
  v_unread integer := 0;
begin
  if v_uid is null then
    return jsonb_build_object('items', '[]'::jsonb, 'unread_count', 0);
  end if;

  if not public.is_active_member(p_club_id, v_uid) and not public.is_system_admin(v_uid) then
    return jsonb_build_object('items', '[]'::jsonb, 'unread_count', 0);
  end if;

  select coalesce(notification_read_keys, '[]'::jsonb)
  into v_read_keys
  from public.club_members
  where club_id = p_club_id and user_id = v_uid and status = 'active';

  v_read_keys := coalesce(v_read_keys, '[]'::jsonb);

  select email into v_user_email from public.profiles where id = v_uid;

  v_can_fin := public.can_view_finance(p_club_id, v_uid);
  v_can_inv := public.can_view_inventory(p_club_id, v_uid);
  v_can_club := public.can_manage_club(p_club_id, v_uid);
  v_can_roster := public.can_manage_roster(p_club_id, v_uid);
  v_can_act := public.can_view_activities(p_club_id, v_uid);

  -- 5.1. Lịch tập sắp diễn ra (hôm nay -> 3 ngày tới)
  for v_rec in
    select id, team_name, training_date, training_time, location
    from public.team_trainings
    where club_id = p_club_id
      and training_status = 'scheduled'
      and training_date between v_today and (v_today + 3)
    order by training_date asc, training_time asc
    limit 5
  loop
    v_items := v_items || jsonb_build_array(
      jsonb_build_object(
        'key', 'training:' || v_rec.id || ':' || to_char(v_rec.training_date, 'YYYY-MM-DD'),
        'tone', case when v_rec.training_date = v_today then 'warning' else 'info' end,
        'title', case when v_rec.training_date = v_today then 'Lịch tập hôm nay · ' else 'Lịch tập sắp tới · ' end || v_rec.team_name,
        'body', to_char(v_rec.training_date, 'DD/MM/YYYY') || ' lúc ' || v_rec.training_time || ' tại ' || v_rec.location,
        'href', '#attendance',
        'date', to_char(v_rec.training_date, 'YYYY-MM-DD')
      )
    );
  end loop;

  -- 5.2. Sinh nhật thành viên trong tháng trùng hôm nay hoặc 3 ngày tới
  for v_rec in
    select id, full_name, date_of_birth
    from public.player_profiles
    where club_id = p_club_id
      and status = 'active'
      and date_of_birth is not null
      and to_char(date_of_birth, 'MM-DD') in (
        to_char(v_today, 'MM-DD'),
        to_char(v_today + 1, 'MM-DD'),
        to_char(v_today + 2, 'MM-DD'),
        to_char(v_today + 3, 'MM-DD')
      )
    order by to_char(date_of_birth, 'MM-DD') asc, full_name asc
    limit 5
  loop
    v_items := v_items || jsonb_build_array(
      jsonb_build_object(
        'key', 'birthday:' || v_rec.id || ':' || extract(year from v_today)::int,
        'tone', 'gold',
        'title', case
          when to_char(v_rec.date_of_birth, 'MM-DD') = to_char(v_today, 'MM-DD')
            then 'Chúc mừng sinh nhật hôm nay · ' || v_rec.full_name
          else 'Sinh nhật sắp tới · ' || v_rec.full_name
        end,
        'body', 'Ngày sinh: ' || to_char(v_rec.date_of_birth, 'DD/MM/YYYY'),
        'href', case when v_can_act then '#activities' else '#members' end,
        'date', to_char(v_today, 'YYYY-MM-DD')
      )
    );
  end loop;

  -- 5.3. Dịp kỷ niệm CLB sắp tới (7 ngày) cho người có quyền xem hoạt động
  if v_can_act then
    for v_rec in
      select id, title, event_date
      from public.club_celebrations
      where club_id = p_club_id
        and approval_status = 'approved'
        and event_date between v_today and (v_today + 7)
      order by event_date asc
      limit 3
    loop
      v_items := v_items || jsonb_build_array(
        jsonb_build_object(
          'key', 'celebration:' || v_rec.id || ':' || to_char(v_rec.event_date, 'YYYY-MM-DD'),
          'tone', 'gold',
          'title', 'Sự kiện CLB · ' || v_rec.title,
          'body', 'Diễn ra ngày ' || to_char(v_rec.event_date, 'DD/MM/YYYY'),
          'href', '#activities',
          'date', to_char(v_rec.event_date, 'YYYY-MM-DD')
        )
      );
    end loop;
  end if;

  -- 5.4. Nhắc đóng quỹ cá nhân tháng hiện tại (cho thành viên có hồ sơ cầu thủ liên kết)
  if exists (
    select 1
    from public.player_profiles p
    join public.team_players tp on tp.club_id = p.club_id and tp.player_id = p.id
    where p.club_id = p_club_id
      and p.status in ('active', 'injured')
      and (p.user_id = v_uid or (v_user_email is not null and lower(coalesce(p.email, '')) = lower(v_user_email)))
      and coalesce(public.get_player_team_dues_rate(p_club_id, tp.team_id, p.id, v_month_start), 0) > 0
      and not exists (
        select 1
        from public.team_dues_entries e
        where e.club_id = p_club_id
          and e.team_id = tp.team_id
          and e.player_id = p.id
          and e.month = v_month_start
          and e.status in ('paid', 'exempt')
      )
  ) then
    v_items := v_items || jsonb_build_array(
      jsonb_build_object(
        'key', 'my_dues:' || to_char(v_month_start, 'YYYY-MM'),
        'tone', 'warning',
        'title', 'Nhắc đóng quỹ tháng ' || to_char(v_month_start, 'MM/YYYY'),
        'body', 'Hồ sơ thành viên của bạn chưa ghi nhận hoàn tất quỹ tháng này.',
        'href', case when v_can_fin then '#dues' else '#profile' end,
        'date', to_char(v_today, 'YYYY-MM-DD')
      )
    );
  end if;

  -- 5.5. Thông báo tài chính cho Thủ quỹ / BCN (giao dịch chờ phê duyệt)
  if v_can_fin then
    select count(*), max(id)
    into v_count, v_max_id
    from public.transaction_approvals
    where club_id = p_club_id and status = 'pending';

    if coalesce(v_count, 0) > 0 then
      v_items := v_items || jsonb_build_array(
        jsonb_build_object(
          'key', 'fin_approval:' || v_max_id || ':' || v_count,
          'tone', 'warning',
          'title', 'Có ' || v_count || ' khoản thu/chi chờ phê duyệt',
          'body', 'Kiểm tra và phê duyệt trên Sổ thu chi CLB.',
          'href', '#finance',
          'date', to_char(v_today, 'YYYY-MM-DD')
        )
      );
    end if;
  end if;

  -- 5.6. Cảnh báo Kho trang bị tồn thấp & sự cố hỏng/mất mới (cho người có quyền xem kho)
  if v_can_inv then
    select count(*)
    into v_count
    from public.inventory_items
    where club_id = p_club_id
      and archived = false
      and quantity <= low_stock_threshold;

    if coalesce(v_count, 0) > 0 then
      v_items := v_items || jsonb_build_array(
        jsonb_build_object(
          'key', 'low_stock:' || v_count || ':' || to_char(v_today, 'YYYY-MM'),
          'tone', 'warning',
          'title', 'Cảnh báo kho sắp hết (' || v_count || ' vật tư)',
          'body', 'Một số trang bị chạm hoặc dưới mức tồn tối thiểu.',
          'href', '#inventory',
          'date', to_char(v_today, 'YYYY-MM-DD')
        )
      );
    end if;

    select count(*), max(id)
    into v_count, v_max_id
    from public.inventory_movements
    where club_id = p_club_id
      and type in ('damaged', 'lost')
      and created_at >= (now() - interval '7 days');

    if coalesce(v_count, 0) > 0 then
      v_items := v_items || jsonb_build_array(
        jsonb_build_object(
          'key', 'inv_incident:' || v_max_id,
          'tone', 'danger',
          'title', 'Phát sinh ' || v_count || ' sự cố hỏng/mất thiết bị (7 ngày qua)',
          'body', 'Xem chi tiết trong Báo cáo hỏng/mất tại Kho trang bị.',
          'href', '#inventory',
          'date', to_char(v_today, 'YYYY-MM-DD')
        )
      );
    end if;
  end if;

  -- 5.7. Lời mời giao hữu & Hồ sơ ứng tuyển mới
  if v_can_club then
    select count(*), max(id)
    into v_count, v_max_id
    from public.friendly_invitations
    where target_club_id = p_club_id
      and status = 'pending';

    if coalesce(v_count, 0) > 0 then
      v_items := v_items || jsonb_build_array(
        jsonb_build_object(
          'key', 'friendly:' || v_max_id || ':' || v_count,
          'tone', 'info',
          'title', 'Có ' || v_count || ' lời mời giao hữu chờ phản hồi',
          'body', 'Mở trang Khám phá CLB để chấp nhận hoặc từ chối.',
          'href', '#discover',
          'date', to_char(v_today, 'YYYY-MM-DD')
        )
      );
    end if;
  end if;

  if v_can_roster then
    select count(*), max(id)
    into v_count, v_max_id
    from public.recruitment_applications
    where club_id = p_club_id
      and status = 'new';

    if coalesce(v_count, 0) > 0 then
      v_items := v_items || jsonb_build_array(
        jsonb_build_object(
          'key', 'recruitment:' || v_max_id || ':' || v_count,
          'tone', 'info',
          'title', 'Có ' || v_count || ' hồ sơ ứng viên mới đăng ký',
          'body', 'Xem và xét duyệt hồ sơ trong mục Tuyển dụng CLB.',
          'href', '#recruitment',
          'date', to_char(v_today, 'YYYY-MM-DD')
        )
      );
    end if;
  end if;

  -- Đánh dấu trạng thái đã đọc từng mục
  select
    coalesce(
      jsonb_agg(
        elem || jsonb_build_object('read', (v_read_keys ? (elem->>'key')))
      ),
      '[]'::jsonb
    ),
    coalesce(
      count(*) filter (where not (v_read_keys ? (elem->>'key'))),
      0
    )
  into v_items, v_unread
  from jsonb_array_elements(v_items) as elem;

  return jsonb_build_object(
    'items', v_items,
    'unread_count', v_unread
  );
end $$;

revoke all on function public.get_my_club_notifications(bigint) from public, anon;
grant execute on function public.get_my_club_notifications(bigint) to authenticated;

create or replace function public.mark_club_notifications_read(
  p_club_id bigint,
  p_keys text[]
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_merged jsonb;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if coalesce(array_length(p_keys, 1), 0) = 0 then
    return jsonb_build_object('ok', true);
  end if;

  select coalesce(jsonb_agg(distinct k), '[]'::jsonb)
  into v_merged
  from (
    select jsonb_array_elements_text(coalesce(m.notification_read_keys, '[]'::jsonb)) as k
    from public.club_members m
    where m.club_id = p_club_id and m.user_id = v_uid
    union
    select unnest(p_keys) as k
    limit 200
  ) merged_keys
  where coalesce(k, '') <> '';

  update public.club_members
  set notification_read_keys = coalesce(v_merged, '[]'::jsonb)
  where club_id = p_club_id
    and user_id = v_uid;

  return jsonb_build_object('ok', true);
end $$;

revoke all on function public.mark_club_notifications_read(bigint, text[]) from public, anon;
grant execute on function public.mark_club_notifications_read(bigint, text[]) to authenticated;
