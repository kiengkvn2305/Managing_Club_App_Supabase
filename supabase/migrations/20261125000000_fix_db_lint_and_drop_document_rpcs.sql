-- 20261125000000_fix_db_lint_and_drop_document_rpcs.sql
-- Khắc phục toàn bộ 3 lỗi phát hiện bởi `supabase db lint --linked`:
-- 1. Đảm bảo bảng public.clubs có cột activity_start_date (cần cho admin_list_all_clubs)
-- 2. Sửa hàm public.get_club_dues_report bỏ cột notes không tồn tại trên public.team_dues_entries
-- 3. Gỡ bỏ các hàm Tài liệu CLB đã ngừng sử dụng (save_club_document, delete_club_document)

alter table public.clubs
  add column if not exists activity_start_date date default now()::date;

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
      v_rate := public.get_player_team_dues_rate(p_club_id, v_team.team_id, v_player.player_id, v_target_month);
      if v_rate is null then
        v_rate := 0;
      end if;

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

grant execute on function public.get_club_dues_report(bigint, text) to authenticated;

drop function if exists public.save_club_document(bigint, bigint, jsonb);
drop function if exists public.delete_club_document(bigint, bigint);
