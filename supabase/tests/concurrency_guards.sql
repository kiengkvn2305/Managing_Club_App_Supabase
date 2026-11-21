-- Transaction and replay safeguards. All fixtures are rolled back.
begin;
create extension if not exists pgtap;
select plan(13);

select ok(to_regprocedure('public.save_match_attendance(bigint,bigint,jsonb)') is not null, 'locked match attendance RPC exists');
select ok(to_regprocedure('public.save_training_attendance(bigint,bigint,jsonb,timestamp with time zone)') is not null, 'optimistic training attendance RPC exists');
select ok(to_regprocedure('public.record_player_dues(bigint,bigint,date,integer,text,uuid)') is not null, 'idempotent dues RPC exists');
select ok(not has_table_privilege('authenticated', 'public.match_attendances', 'INSERT'), 'attendance has no direct insert grant');

create temp table concurrency_test_context (
  user_id uuid,
  club_id bigint,
  team_id bigint,
  player_id bigint,
  match_id bigint,
  training_id bigint,
  before_training_update timestamptz
) on commit drop;

insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values ('00000000-0000-0000-0000-000000000177','authenticated','authenticated','concurrency-owner@example.local','',now(),'{}'::jsonb,'{"name":"Concurrency Owner"}'::jsonb,now(),now());
insert into concurrency_test_context(user_id) values ('00000000-0000-0000-0000-000000000177');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000177', true);

with created as (
  insert into public.clubs(name,slug,format,formats) values ('Concurrency Test Club','concurrency-test-club','7','["7"]'::jsonb) returning id
) update concurrency_test_context set club_id = (select id from created);
insert into public.club_members(club_id,user_id,role,status)
select club_id,user_id,'owner','active'::public.member_status from concurrency_test_context;
with created as (
  insert into public.teams(club_id,name,format) select club_id,'Concurrency Team','7' from concurrency_test_context returning id
) update concurrency_test_context set team_id = (select id from created);
with created as (
  insert into public.player_profiles(club_id,full_name,status) select club_id,'Concurrency Player','active' from concurrency_test_context returning id
) update concurrency_test_context set player_id = (select id from created);
insert into public.team_players(club_id,team_id,player_id)
select club_id,team_id,player_id from concurrency_test_context;
with created as (
  insert into public.club_matches(club_id,team_id,opponent,match_date,start_time,match_type,status,created_by)
  select club_id,team_id,'Opponent','2099-02-01','19:00','friendly','scheduled',user_id from concurrency_test_context returning id
) update concurrency_test_context set match_id = (select id from created);
with created as (
  insert into public.team_trainings(club_id,team_id,team_name,training_date,training_time,location,submitted_by)
  select c.club_id,c.team_id,'Concurrency Team','2099-02-02','19:00','Test field',c.user_id from concurrency_test_context c returning id,updated_at
) update concurrency_test_context set training_id = (select id from created), before_training_update = (select updated_at from created);

select throws_ok(
  $$select public.leave_club((select club_id from concurrency_test_context))$$,
  'owner_cannot_leave',
  'club owner cannot leave their club'
);
select is((select count(*)::integer from public.club_members where club_id=(select club_id from concurrency_test_context) and role='owner'), 1, 'owner membership remains after rejected leave');

select lives_ok(
  $$select public.record_finance_transaction((select club_id from concurrency_test_context),'income'::public.finance_type,200,'2099-02-01','Replay-safe income',null,null,null,null,'00000000-0000-0000-0000-000000000701')$$,
  'first ledger request succeeds'
);
select lives_ok(
  $$select public.record_finance_transaction((select club_id from concurrency_test_context),'income'::public.finance_type,200,'2099-02-01','Replay-safe income',null,null,null,null,'00000000-0000-0000-0000-000000000701')$$,
  'same ledger request is replayed safely'
);
select is((select count(*)::integer from public.finance_transactions where club_id=(select club_id from concurrency_test_context) and idempotency_key='00000000-0000-0000-0000-000000000701'), 1, 'replayed ledger request creates one transaction');

select lives_ok(
  $$select public.save_match_attendance((select club_id from concurrency_test_context),(select match_id from concurrency_test_context),jsonb_build_array(jsonb_build_object('player_id',(select player_id from concurrency_test_context),'rsvp','yes','attendance','present')))$$,
  'locked match attendance succeeds'
);
select is((select count(*)::integer from public.match_attendances where club_id=(select club_id from concurrency_test_context) and match_id=(select match_id from concurrency_test_context)), 1, 'one match attendance row exists');

select lives_ok(
  $$select public.save_training_attendance((select club_id from concurrency_test_context),(select training_id from concurrency_test_context),jsonb_build_array(jsonb_build_object('player_id',(select player_id from concurrency_test_context),'status','present')),(select before_training_update from concurrency_test_context))$$,
  'training attendance accepts the current revision'
);
select throws_ok(
  $$select public.save_training_attendance((select club_id from concurrency_test_context),(select training_id from concurrency_test_context),'[]'::jsonb,(select before_training_update from concurrency_test_context))$$,
  'attendance_stale_reload',
  'stale training update is rejected rather than overwriting another manager'
);

select * from finish();
rollback;
