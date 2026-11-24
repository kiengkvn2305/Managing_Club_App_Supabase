-- 20261122000004_backend_business_logic_and_security_rpcs.sql
-- Chuyển toàn bộ nghiệp vụ quan trọng về backend (PostgreSQL RPC / Security Definer)
-- để bảo mật hệ thống, chống rò rỉ dữ liệu qua frontend và đảm bảo tính toán tập trung.

-- 1. RPC: Lấy thông tin thành viên và phân quyền thực tế từ backend
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
  v_can_view_fin boolean := false;
  v_can_manage_fin boolean := false;
  v_can_manage_ros boolean := false;
  v_can_manage_clb boolean := false;
  v_can_view_inv boolean := false;
  v_can_manage_inv boolean := false;
  v_can_view_act boolean := false;
  v_can_manage_act boolean := false;
begin
  if v_user_id is null then
    raise exception 'Unauthorized: Chưa đăng nhập';
  end if;

  -- Kiểm tra system admin
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
        'can_view_activities', true
      ),
      'is_owner', true,
      'is_system_admin', true,
      'can_view_finance', true,
      'can_manage_finance', true,
      'can_manage_roster', true,
      'can_manage_club', true,
      'can_manage_inventory', true,
      'can_view_inventory', true,
      'can_manage_activities', true,
      'can_view_activities', true
    );
  end if;

  -- Lấy thông tin thành viên CLB
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

  -- Kiểm tra BCN
  select bm.title into v_board_title
  from public.club_board_members bm
  join public.player_profiles p on p.id = bm.player_id
  where bm.club_id = p_club_id
    and bm.archived_at is null
    and (p.user_id = v_user_id or lower(p.email) = lower((select email from public.profiles where id = v_user_id)))
  limit 1;

  -- Tính toán quyền hạn an toàn tại backend
  v_can_view_fin := v_is_owner or coalesce((v_perms->>'can_view_finance')::boolean, (
    v_role in ('owner', 'co_owner', 'general_manager', 'treasurer', 'sporting_manager', 'equipment_manager', 'hr_manager')
    or v_board_title is not null
    or lower(v_title) ~* '(thủ quỹ|tài chính|chủ nhiệm|kế toán|quản lý|bcn|ban chủ nhiệm|cán sự|uỷ viên|ủy viên|hlv|huấn luyện viên)'
  ));

  v_can_manage_fin := v_is_owner or coalesce((v_perms->>'can_manage_finance')::boolean, (
    v_role in ('owner', 'co_owner', 'general_manager', 'treasurer')
    or (v_board_title is not null and lower(v_board_title) ~* '(thủ quỹ|chủ nhiệm|kế toán)')
    or lower(v_title) ~* '(thủ quỹ|chủ nhiệm|kế toán)'
  ));

  v_can_manage_ros := v_is_owner or coalesce((v_perms->>'can_manage_roster')::boolean, (
    v_role in ('owner', 'co_owner', 'general_manager', 'hr_manager', 'sporting_manager')
  ));

  v_can_manage_clb := v_is_owner or coalesce((v_perms->>'can_manage_club')::boolean, (
    v_role in ('owner', 'co_owner', 'general_manager')
  ));

  v_can_manage_inv := v_is_owner or coalesce((v_perms->>'can_manage_inventory')::boolean, (
    v_role in ('owner', 'co_owner', 'general_manager', 'equipment_manager')
  ));

  v_can_view_inv := v_can_manage_inv or (
    v_role in ('owner', 'co_owner', 'general_manager', 'equipment_manager', 'sporting_manager')
  );

  v_can_manage_act := v_is_owner or coalesce((v_perms->>'can_manage_activities')::boolean, (
    v_role in ('owner', 'co_owner', 'general_manager', 'hr_manager', 'sporting_manager')
    or lower(v_title) ~* 'phó chủ nhiệm'
  ));

  v_can_view_act := v_can_manage_act or v_can_manage_ros;

  -- Phó chủ nhiệm có đầy đủ chức năng quản trị như chủ nhiệm (ngoại trừ xoá CLB hoặc chuyển giao quyền sở hữu)
  if v_role = 'co_owner' or lower(v_title) ~* 'phó chủ nhiệm' or (v_board_title is not null and lower(v_board_title) ~* 'phó chủ nhiệm') then
    v_can_view_fin := true;
    v_can_manage_fin := true;
    v_can_manage_ros := true;
    v_can_manage_clb := true;
    v_can_manage_inv := true;
    v_can_view_inv := true;
    v_can_manage_act := true;
    v_can_view_act := true;
  end if;

  return jsonb_build_object(
    'club_id', p_club_id,
    'user_id', v_user_id,
    'role', v_role,
    'title', v_title,
    'board_title', v_board_title,
    'permissions', v_perms,
    'is_owner', v_is_owner,
    'is_system_admin', false,
    'can_view_finance', v_can_view_fin,
    'can_manage_finance', v_can_manage_fin,
    'can_manage_roster', v_can_manage_ros,
    'can_manage_club', v_can_manage_clb,
    'can_manage_inventory', v_can_manage_inv,
    'can_view_inventory', v_can_view_inv,
    'can_manage_activities', v_can_manage_act,
    'can_view_activities', v_can_view_act
  );
end;
$$;

-- 2. RPC: Tính toán và tổng hợp báo cáo quỹ CLB hoàn toàn trên backend
create or replace function public.get_club_dues_report(p_club_id bigint, p_month text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_target_month date;
  v_player record;
  v_team record;
  v_rate numeric;
  v_entry record;
  v_teams_json jsonb;
  v_total numeric;
  v_status text;
  v_res jsonb := '[]'::jsonb;
begin
  if not public.can_view_finance(p_club_id, v_user_id) then
    raise exception 'Forbidden: Bạn không có quyền xem thông tin quỹ của CLB này';
  end if;

  v_target_month := (p_month || '-01')::date;

  for v_player in
    select distinct p.id as player_id, p.full_name, p.date_of_birth, p.email, p.notes, p.status
    from public.player_profiles p
    left join public.team_players tp on tp.player_id = p.id and tp.club_id = p_club_id
    where p.club_id = p_club_id
      and p.status in ('active', 'inactive')
      and (p.team_id is not null or tp.team_id is not null)
    order by p.full_name
  loop
    v_teams_json := '[]'::jsonb;
    v_total := 0;

    for v_team in
      select distinct t.id as team_id, t.name as team_name
      from public.teams t
      where t.club_id = p_club_id
        and (
          t.id = (select team_id from public.player_profiles where id = v_player.player_id)
          or exists(select 1 from public.team_players tp where tp.player_id = v_player.player_id and tp.team_id = t.id)
        )
      order by t.name
    loop
      -- Tính mức quỹ từ hàm lõi PostgreSQL
      v_rate := public.get_player_team_dues_rate(p_club_id, v_team.team_id, v_player.player_id, v_target_month);
      if v_rate is null then
        v_rate := 0;
      end if;

      -- Tìm bản ghi đóng quỹ đã có
      select id, status, amount into v_entry
      from public.team_dues_entries
      where club_id = p_club_id
        and team_id = v_team.team_id
        and player_id = v_player.player_id
        and month = v_target_month
      limit 1;

      if v_entry.id is not null then
        v_status := v_entry.status;
        if v_status in ('paid', 'exempt') then
          v_rate := coalesce(v_entry.amount, v_rate);
        end if;
      else
        v_status := 'debt';
      end if;

      v_total := v_total + coalesce(v_rate, 0);

      v_teams_json := v_teams_json || jsonb_build_object(
        'team_id', v_team.team_id,
        'name', v_team.team_name,
        'amount', v_rate,
        'status', v_status,
        'notes', '',
        'is_maintenance', (v_player.status = 'inactive')
      );
    end loop;

    if jsonb_array_length(v_teams_json) > 0 then
      v_res := v_res || jsonb_build_object(
        'player_id', v_player.player_id,
        'name', v_player.full_name,
        'date_of_birth', v_player.date_of_birth,
        'email', v_player.email,
        'notes', v_player.notes,
        'status', v_player.status,
        'total', v_total,
        'teams', v_teams_json
      );
    end if;
  end loop;

  return v_res;
end;
$$;

-- 3. RPC: Thống kê tổng hợp số liệu Dashboard an toàn trên backend
create or replace function public.get_club_dashboard_metrics(p_club_id bigint)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_players_count bigint := 0;
  v_active_players_count bigint := 0;
  v_members_count bigint := 0;
  v_teams_count bigint := 0;
  v_total_income numeric := 0;
  v_total_expense numeric := 0;
  v_balance numeric := 0;
  v_uncollected_dues numeric := 0;
  v_current_month date := date_trunc('month', current_date)::date;
begin
  if not public.is_active_member(p_club_id, v_user_id) then
    raise exception 'Forbidden: Bạn không phải thành viên của CLB này';
  end if;

  select count(*) into v_players_count from public.player_profiles where club_id = p_club_id;
  select count(*) into v_active_players_count from public.player_profiles where club_id = p_club_id and status = 'active';
  select count(*) into v_members_count from public.club_members where club_id = p_club_id and status = 'active';
  select count(*) into v_teams_count from public.teams where club_id = p_club_id;

  -- Số dư tài chính từ ledger thực tế
  select
    coalesce(sum(case when type = 'income' then amount else 0 end), 0),
    coalesce(sum(case when type = 'expense' then amount else 0 end), 0)
  into v_total_income, v_total_expense
  from public.finance_transactions
  where club_id = p_club_id and (status is null or status = 'posted');

  v_balance := v_total_income - v_total_expense;

  -- Tổng tiền quỹ chưa thu tháng này
  select coalesce(sum(amount), 0)
  into v_uncollected_dues
  from public.team_dues_entries
  where club_id = p_club_id and month = v_current_month and status = 'debt';

  return jsonb_build_object(
    'players_count', v_players_count,
    'active_players_count', v_active_players_count,
    'members_count', v_members_count,
    'teams_count', v_teams_count,
    'total_income', v_total_income,
    'total_expense', v_total_expense,
    'finance_balance', v_balance,
    'uncollected_dues', v_uncollected_dues
  );
end;
$$;

-- 4. RPC: Lưu hoặc cập nhật hồ sơ cầu thủ với xác thực nghiệp vụ chặt chẽ phía backend
create or replace function public.save_player_profile(
  p_club_id bigint,
  p_player_id bigint,
  p_data jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_full_name text;
  v_status text;
  v_jersey integer;
  v_dob date;
  v_res record;
  v_team_id bigint;
begin
  if not public.can_manage_roster(p_club_id, v_user_id) then
    raise exception 'Forbidden: Bạn không có quyền quản lý danh sách thành viên CLB';
  end if;

  v_full_name := trim(p_data->>'full_name');
  if v_full_name is null or length(v_full_name) = 0 then
    raise exception 'Họ và tên thành viên không được để trống';
  end if;

  v_status := coalesce(p_data->>'status', 'active');
  if v_status not in ('active', 'inactive', 'injured', 'graduated') then
    raise exception 'Trạng thái thành viên không hợp lệ';
  end if;

  if (p_data->>'jersey_number') is not null and (p_data->>'jersey_number') <> '' then
    v_jersey := (p_data->>'jersey_number')::integer;
    if v_jersey < 0 or v_jersey > 999 then
      raise exception 'Số áo phải nằm trong khoảng 0 đến 999';
    end if;
  else
    v_jersey := null;
  end if;

  if (p_data->>'date_of_birth') is not null and (p_data->>'date_of_birth') <> '' then
    v_dob := (p_data->>'date_of_birth')::date;
    if v_dob > current_date then
      raise exception 'Ngày sinh không được nằm trong tương lai';
    end if;
  else
    v_dob := null;
  end if;

  if (p_data->>'team_id') is not null and (p_data->>'team_id') <> '' then
    v_team_id := (p_data->>'team_id')::bigint;
  else
    v_team_id := null;
  end if;

  if p_player_id is not null and p_player_id > 0 then
    update public.player_profiles
    set
      full_name = v_full_name,
      email = nullif(trim(p_data->>'email'), ''),
      phone = nullif(trim(p_data->>'phone'), ''),
      date_of_birth = v_dob,
      position = nullif(trim(p_data->>'position'), ''),
      preferred_foot = nullif(trim(p_data->>'preferred_foot'), ''),
      status = v_status::public.player_status,
      jersey_number = v_jersey,
      notes = nullif(trim(p_data->>'notes'), ''),
      team_id = v_team_id,
      updated_at = now()
    where id = p_player_id and club_id = p_club_id
    returning * into v_res;
  else
    insert into public.player_profiles (
      club_id,
      full_name,
      email,
      phone,
      date_of_birth,
      position,
      preferred_foot,
      status,
      jersey_number,
      notes,
      team_id
    ) values (
      p_club_id,
      v_full_name,
      nullif(trim(p_data->>'email'), ''),
      nullif(trim(p_data->>'phone'), ''),
      v_dob,
      nullif(trim(p_data->>'position'), ''),
      nullif(trim(p_data->>'preferred_foot'), ''),
      v_status::public.player_status,
      v_jersey,
      nullif(trim(p_data->>'notes'), ''),
      v_team_id
    )
    returning * into v_res;
  end if;

  if v_team_id is not null then
    perform public.set_player_primary_team(p_club_id, v_res.id, v_team_id);
  end if;

  return to_jsonb(v_res);
end;
$$;

-- 5. RPC: Thêm / sửa thành viên BCN an toàn phía backend
create or replace function public.save_board_member(
  p_club_id bigint,
  p_player_id bigint,
  p_title text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_title text;
  v_res record;
begin
  if not public.can_manage_club(p_club_id, v_user_id) then
    raise exception 'Forbidden: Bạn không có quyền quản lý Ban Chủ Nhiệm';
  end if;

  v_title := trim(p_title);
  if v_title is null or length(v_title) = 0 then
    raise exception 'Chức danh Ban Chủ Nhiệm không được để trống';
  end if;

  -- Lưu hoặc cập nhật
  insert into public.club_board_members (club_id, player_id, title)
  values (p_club_id, p_player_id, v_title)
  on conflict (club_id, player_id) do update
  set title = excluded.title, archived_at = null
  returning * into v_res;

  return to_jsonb(v_res);
end;
$$;

-- 6. RPC: Quản lý lưu và xóa tài liệu an toàn phía backend
create or replace function public.save_club_document(
  p_club_id bigint,
  p_doc_id bigint,
  p_data jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_uploader_name text;
  v_res record;
begin
  if not public.can_manage_club(p_club_id, v_user_id) then
    raise exception 'Forbidden: Bạn không có quyền quản lý tài liệu CLB';
  end if;

  select name into v_uploader_name from public.profiles where id = v_user_id;

  if p_doc_id is not null and p_doc_id > 0 then
    update public.club_documents
    set
      name = coalesce(p_data->>'name', name),
      folder_name = coalesce(p_data->>'folder_name', folder_name),
      notes = coalesce(p_data->>'notes', notes),
      updated_at = now()
    where id = p_doc_id and club_id = p_club_id
    returning * into v_res;
  else
    insert into public.club_documents (
      club_id,
      uploader_user_id,
      folder_name,
      name,
      file_name,
      file_path,
      file_size,
      file_type,
      notes,
      uploader_name
    ) values (
      p_club_id,
      v_user_id,
      coalesce(p_data->>'folder_name', 'Biên bản họp'),
      coalesce(p_data->>'name', 'Tài liệu không tên'),
      p_data->>'file_name',
      p_data->>'file_path',
      coalesce((p_data->>'file_size')::bigint, 0),
      p_data->>'file_type',
      p_data->>'notes',
      coalesce(v_uploader_name, 'Chủ nhiệm CLB')
    )
    returning * into v_res;
  end if;

  return to_jsonb(v_res);
end;
$$;

create or replace function public.delete_club_document(
  p_club_id bigint,
  p_doc_id bigint
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if not public.can_manage_club(p_club_id, v_user_id) then
    raise exception 'Forbidden: Bạn không có quyền xóa tài liệu CLB';
  end if;

  delete from public.club_documents
  where id = p_doc_id and club_id = p_club_id;

  return true;
end;
$$;

-- 7. RPC: Cập nhật ảnh đại diện hoặc ảnh nền câu lạc bộ
create or replace function public.update_club_image(
  p_club_id bigint,
  p_kind text,
  p_image_path text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if not public.can_manage_club(p_club_id, v_user_id) then
    raise exception 'Forbidden: Bạn không có quyền chỉnh sửa thông tin CLB';
  end if;

  if p_kind = 'avatar' then
    update public.clubs
    set avatar_path = p_image_path, updated_at = now()
    where id = p_club_id;
  elsif p_kind = 'background' then
    update public.clubs
    set background_path = p_image_path, updated_at = now()
    where id = p_club_id;
  else
    raise exception 'Invalid kind: Chỉ chấp nhận avatar hoặc background';
  end if;

  return true;
end;
$$;

-- Cấp quyền gọi các RPC cho authenticated users
grant execute on function public.get_my_club_membership(bigint) to authenticated;
grant execute on function public.get_club_dues_report(bigint, text) to authenticated;
grant execute on function public.get_club_dashboard_metrics(bigint) to authenticated;
grant execute on function public.save_player_profile(bigint, bigint, jsonb) to authenticated;
grant execute on function public.save_board_member(bigint, bigint, text) to authenticated;
grant execute on function public.save_club_document(bigint, bigint, jsonb) to authenticated;
grant execute on function public.delete_club_document(bigint, bigint) to authenticated;
grant execute on function public.update_club_image(bigint, text, text) to authenticated;

-- Cập nhật quyền hạn cho Phó chủ nhiệm đối với các bản ghi hiện có
update public.club_members
set permissions = coalesce(permissions, '{}'::jsonb) || '{"can_manage_finance": true}'::jsonb
where (role = 'co_owner' or lower(title) ~* 'phó chủ nhiệm')
  and (permissions->>'can_manage_finance' = 'false' or permissions->>'can_manage_finance' is null);

update public.club_invitations
set permissions = coalesce(permissions, '{}'::jsonb) || '{"can_manage_finance": true}'::jsonb
where (role = 'co_owner' or lower(title) ~* 'phó chủ nhiệm')
  and (permissions->>'can_manage_finance' = 'false' or permissions->>'can_manage_finance' is null);
