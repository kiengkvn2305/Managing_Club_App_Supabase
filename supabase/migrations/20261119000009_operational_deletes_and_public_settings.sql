-- 20261119000009_operational_deletes_and_public_settings.sql
-- Grants DELETE privileges and adds safe operational RPCs for team management, activities, sponsors, and board tasks.

-- 1. Safe team deletion RPC
create or replace function public.delete_team(
  p_club_id bigint,
  p_team_id bigint
) returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.can_manage_roster(p_club_id) then
    raise exception 'forbidden';
  end if;

  perform 1 from public.teams where club_id = p_club_id and id = p_team_id for update;
  if not found then
    raise exception 'team_not_found';
  end if;

  -- Block deletion if team has recorded dues history to protect audit trail
  if exists (select 1 from public.team_dues_entries where club_id = p_club_id and team_id = p_team_id) then
    raise exception 'cannot_delete_team_with_dues_history';
  end if;

  -- Block deletion if team has recorded matches
  if exists (select 1 from public.club_matches where club_id = p_club_id and team_id = p_team_id) then
    raise exception 'cannot_delete_team_with_matches';
  end if;

  -- Unlink primary team from player profiles
  update public.player_profiles
  set team_id = null, current_jersey = null
  where club_id = p_club_id and team_id = p_team_id;

  -- Close active memberships in periods
  update public.team_membership_periods
  set left_on = current_date, updated_at = now()
  where club_id = p_club_id and team_id = p_team_id and left_on is null;

  -- Delete roster assignments
  delete from public.team_players where club_id = p_club_id and team_id = p_team_id;

  -- Delete team managers
  delete from public.team_managers where club_id = p_club_id and team_id = p_team_id;

  -- Delete dues rate configurations for this team
  delete from public.team_dues_rates where club_id = p_club_id and team_id = p_team_id;
  delete from public.shared_board_dues_rates where club_id = p_club_id and team_id = p_team_id;
  delete from public.board_dues_rates where club_id = p_club_id and team_id = p_team_id;

  -- Delete trainings and lineups for this team
  delete from public.team_trainings where club_id = p_club_id and team_id = p_team_id;
  delete from public.match_lineups where club_id = p_club_id and team_id = p_team_id;

  -- Finally delete team row
  delete from public.teams where club_id = p_club_id and id = p_team_id;
end $$;

revoke all on function public.delete_team(bigint,bigint) from public, anon;
grant execute on function public.delete_team(bigint,bigint) to authenticated;

-- 2. Safe team player removal RPC
create or replace function public.remove_team_player(
  p_club_id bigint,
  p_team_id bigint,
  p_player_id bigint
) returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.can_manage_roster(p_club_id) then
    raise exception 'forbidden';
  end if;

  perform 1 from public.teams where club_id = p_club_id and id = p_team_id for update;

  -- Remove from team_players
  delete from public.team_players
  where club_id = p_club_id and team_id = p_team_id and player_id = p_player_id;

  -- Close membership period
  update public.team_membership_periods
  set left_on = current_date, updated_at = now()
  where club_id = p_club_id and team_id = p_team_id and player_id = p_player_id and left_on is null;

  -- If this was player's primary team, re-point to another team of player or set null
  update public.player_profiles
  set team_id = (select team_id from public.team_players where club_id = p_club_id and player_id = p_player_id limit 1),
      current_jersey = null
  where club_id = p_club_id and id = p_player_id and team_id = p_team_id;

  -- If player was team captain, clear captain_id
  update public.teams
  set captain_id = null
  where club_id = p_club_id and id = p_team_id and captain_id = p_player_id;
end $$;

revoke all on function public.remove_team_player(bigint,bigint,bigint) from public, anon;
grant execute on function public.remove_team_player(bigint,bigint,bigint) to authenticated;

-- 3. Explicit table grants for operational deletions and public website settings
grant delete on public.board_tasks to authenticated;
grant delete on public.club_celebrations, public.team_trainings, public.club_awards to authenticated;
grant delete on public.sponsors, public.sponsorships, public.sponsorship_receipts to authenticated;
grant delete on public.club_matches to authenticated;
grant insert, update on public.club_public_settings to authenticated;

-- 4. Explicit RLS policies for delete operations
drop policy if exists board_tasks_delete on public.board_tasks;
create policy board_tasks_delete on public.board_tasks
  for delete to authenticated
  using (public.can_manage_roster(club_id));

drop policy if exists club_celebrations_delete on public.club_celebrations;
create policy club_celebrations_delete on public.club_celebrations
  for delete to authenticated
  using (public.can_manage_roster(club_id));

drop policy if exists team_trainings_delete on public.team_trainings;
create policy team_trainings_delete on public.team_trainings
  for delete to authenticated
  using (public.can_manage_roster(club_id));

drop policy if exists club_awards_delete on public.club_awards;
create policy club_awards_delete on public.club_awards
  for delete to authenticated
  using (public.can_manage_roster(club_id));

drop policy if exists sponsors_delete on public.sponsors;
create policy sponsors_delete on public.sponsors
  for delete to authenticated
  using (public.can_manage_club(club_id));

drop policy if exists sponsorships_delete on public.sponsorships;
create policy sponsorships_delete on public.sponsorships
  for delete to authenticated
  using (public.can_manage_club(club_id));

drop policy if exists sponsorship_receipts_delete on public.sponsorship_receipts;
create policy sponsorship_receipts_delete on public.sponsorship_receipts
  for delete to authenticated
  using (public.can_manage_club(club_id));

drop policy if exists club_matches_delete on public.club_matches;
create policy club_matches_delete on public.club_matches
  for delete to authenticated
  using (public.can_manage_roster(club_id));
