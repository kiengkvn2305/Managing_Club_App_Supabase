begin;
create extension if not exists pgtap;
select plan(9);

-- 1. Check RPC privileges
select ok(has_function_privilege('authenticated','public.delete_team(bigint,bigint)','EXECUTE'),'authenticated can execute delete_team');
select ok(not has_function_privilege('anon','public.delete_team(bigint,bigint)','EXECUTE'),'anon cannot execute delete_team');
select ok(has_function_privilege('authenticated','public.remove_team_player(bigint,bigint,bigint)','EXECUTE'),'authenticated can execute remove_team_player');
select ok(not has_function_privilege('anon','public.remove_team_player(bigint,bigint,bigint)','EXECUTE'),'anon cannot execute remove_team_player');

-- 2. Check table grants
select ok(has_table_privilege('authenticated','public.board_tasks','DELETE'),'authenticated has DELETE on board_tasks');
select ok(has_table_privilege('authenticated','public.club_celebrations','DELETE'),'authenticated has DELETE on club_celebrations');
select ok(has_table_privilege('authenticated','public.team_trainings','DELETE'),'authenticated has DELETE on team_trainings');
select ok(has_table_privilege('authenticated','public.club_awards','DELETE'),'authenticated has DELETE on club_awards');
select ok(has_table_privilege('authenticated','public.club_matches','DELETE'),'authenticated has DELETE on club_matches');

-- 3. Functional test for delete_team and remove_team_player
do $$
declare
  v_user_id uuid := '00000000-0000-0000-0000-000000000088'::uuid;
  v_club_id bigint;
  v_team_id bigint;
  v_player_id bigint;
begin
  insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values (v_user_id, 'authenticated', 'authenticated', 'op-test@example.local', '', now(), '{}'::jsonb, '{"name":"Op Test"}'::jsonb, now(), now())
  on conflict (id) do nothing;

  perform set_config('request.jwt.claim.sub', v_user_id::text, true);

  insert into public.clubs (name, slug, format, formats, status) values ('Op Delete Club', 'op-delete-club', '7', '["7"]'::jsonb, 'active') returning id into v_club_id;
  insert into public.club_members (club_id, user_id, role, status) values (v_club_id, v_user_id, 'owner', 'active');
  insert into public.teams (club_id, name, format) values (v_club_id, 'Op Team', '7') returning id into v_team_id;
  insert into public.player_profiles (club_id, full_name, team_id, status) values (v_club_id, 'Op Player', v_team_id, 'active') returning id into v_player_id;
  insert into public.team_players (club_id, team_id, player_id) values (v_club_id, v_team_id, v_player_id);

  -- Remove team player
  perform public.remove_team_player(v_club_id, v_team_id, v_player_id);
  if exists (select 1 from public.team_players where club_id = v_club_id and team_id = v_team_id and player_id = v_player_id) then
    raise exception 'player was not removed from team_players';
  end if;

  -- Delete team
  perform public.delete_team(v_club_id, v_team_id);
  if exists (select 1 from public.teams where club_id = v_club_id and id = v_team_id) then
    raise exception 'team was not deleted';
  end if;
end $$;

select * from finish();
rollback;
