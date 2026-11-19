begin;
create extension if not exists pgtap;
select plan(7);

-- 1. Check delete permissions
select ok(has_table_privilege('authenticated','public.shared_board_dues_rates','DELETE'),'authenticated has DELETE privilege on shared_board_dues_rates');
select ok(has_table_privilege('authenticated','public.board_dues_rates','DELETE'),'authenticated has DELETE privilege on board_dues_rates');

-- 2. Check function execute privilege
select ok(has_function_privilege('authenticated','public.get_player_team_dues_rate(bigint,bigint,bigint,date)','EXECUTE'),'authenticated can execute get_player_team_dues_rate');
select ok(not has_function_privilege('anon','public.get_player_team_dues_rate(bigint,bigint,bigint,date)','EXECUTE'),'anon cannot execute get_player_team_dues_rate');

-- 3. Functional test for rate precedence
do $$
declare
  v_club_id bigint;
  v_team_id bigint;
  v_player_reg bigint;
  v_player_board bigint;
  v_board_rate_id bigint;
  v_rate_reg numeric;
  v_rate_board numeric;
begin
  insert into public.clubs (name, slug, format, formats, status) values ('Test Board Club', 'test-board-club', '7', '["7"]'::jsonb, 'active') returning id into v_club_id;
  insert into public.teams (club_id, name, format) values (v_club_id, 'Test Team', '7') returning id into v_team_id;
  insert into public.player_profiles (club_id, full_name, status) values (v_club_id, 'Regular Player', 'active') returning id into v_player_reg;
  insert into public.player_profiles (club_id, full_name, status) values (v_club_id, 'Board Player', 'active') returning id into v_player_board;

  insert into public.team_players (club_id, team_id, player_id) values (v_club_id, v_team_id, v_player_reg);
  insert into public.team_players (club_id, team_id, player_id) values (v_club_id, v_team_id, v_player_board);

  -- Standard team dues: 100.00
  insert into public.team_dues_rates (club_id, team_id, effective_month, amount) values (v_club_id, v_team_id, '2026-01-01', 100.00);

  -- Add player to board members
  insert into public.club_board_members (club_id, player_id, title) values (v_club_id, v_player_board, 'Uỷ viên');

  -- Shared board dues: 40.00
  insert into public.shared_board_dues_rates (club_id, team_id, effective_month, amount) values (v_club_id, v_team_id, '2026-01-01', 40.00) returning id into v_board_rate_id;

  v_rate_reg := public.get_player_team_dues_rate(v_club_id, v_team_id, v_player_reg, '2026-05-01');
  v_rate_board := public.get_player_team_dues_rate(v_club_id, v_team_id, v_player_board, '2026-05-01');

  if v_rate_reg <> 100.00 then
    raise exception 'Regular rate expected 100.00, got %', v_rate_reg;
  end if;

  if v_rate_board <> 40.00 then
    raise exception 'Board rate expected 40.00, got %', v_rate_board;
  end if;

  -- Delete board dues rate
  delete from public.shared_board_dues_rates where id = v_board_rate_id;

  v_rate_board := public.get_player_team_dues_rate(v_club_id, v_team_id, v_player_board, '2026-05-01');
  if v_rate_board <> 100.00 then
    raise exception 'Board rate after deletion expected 100.00, got %', v_rate_board;
  end if;
end $$;

select pass('get_player_team_dues_rate applies standard rate to regular members');
select pass('get_player_team_dues_rate applies discount rate to board members');
select pass('deleting shared board dues rate restores standard team rate');

select * from finish();
rollback;
