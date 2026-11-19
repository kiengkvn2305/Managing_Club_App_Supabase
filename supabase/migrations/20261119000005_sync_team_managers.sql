-- Synchronize team managers atomically. Direct Data API writes to team_managers remain disabled.
create or replace function public.sync_team_managers(p_club_id bigint, p_team_id bigint, p_membership_ids bigint[])
returns jsonb language plpgsql security definer set search_path = public as $$
declare manager_ids bigint[] := coalesce(p_membership_ids, '{}'::bigint[]); manager_count integer;
begin
  if not public.can_manage_roster(p_club_id) then raise exception 'forbidden'; end if;
  perform 1 from public.teams where club_id=p_club_id and id=p_team_id for update;
  if not found then raise exception 'team_not_found'; end if;
  if exists (
    select 1 from unnest(manager_ids) requested
    where not exists (select 1 from public.club_members m where m.club_id=p_club_id and m.id=requested and m.status='active')
  ) then raise exception 'invalid_manager_membership'; end if;
  delete from public.team_managers
  where club_id=p_club_id and team_id=p_team_id and not (membership_id=any(manager_ids));
  insert into public.team_managers(club_id,team_id,membership_id)
  select p_club_id,p_team_id,requested
  from unnest(manager_ids) requested
  on conflict(team_id,membership_id) do nothing;
  select count(*) into manager_count from public.team_managers where club_id=p_club_id and team_id=p_team_id;
  return jsonb_build_object('team_id',p_team_id,'manager_count',manager_count);
end $$;

revoke all on function public.sync_team_managers(bigint,bigint,bigint[]) from anon, authenticated;
grant execute on function public.sync_team_managers(bigint,bigint,bigint[]) to authenticated;
