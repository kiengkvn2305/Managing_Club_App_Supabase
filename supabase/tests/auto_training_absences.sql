-- UTC+7 deadline behavior for automatic training attendance.
begin;
create extension if not exists pgtap;
select plan(8);

select ok(to_regprocedure('public.auto_mark_overdue_training_absences(timestamp with time zone)') is not null, 'automatic absence function exists');
select ok(exists(select 1 from cron.job where jobname = 'fcms-auto-mark-training-absences'), 'minute scheduler is registered');

create temp table auto_absence_context (
  user_id uuid,
  club_id bigint,
  team_id bigint,
  present_player_id bigint,
  unmarked_player_id bigint,
  training_id bigint
) on commit drop;

insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values ('00000000-0000-0000-0000-000000000166','authenticated','authenticated','auto-absence@example.local','',now(),'{}'::jsonb,'{"name":"Auto Absence"}'::jsonb,now(),now());
insert into auto_absence_context(user_id) values ('00000000-0000-0000-0000-000000000166');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000166', true);

with created as (
  insert into public.clubs(name,slug,format,formats) values ('Auto Absence Club','auto-absence-club','7','["7"]'::jsonb) returning id
) update auto_absence_context set club_id = (select id from created);
insert into public.club_members(club_id,user_id,role,status)
select club_id,user_id,'owner','active'::public.member_status from auto_absence_context;
with created as (
  insert into public.teams(club_id,name,format) select club_id,'Auto Absence Team','7' from auto_absence_context returning id
) update auto_absence_context set team_id = (select id from created);
with created as (
  insert into public.player_profiles(club_id,full_name,status)
  select club_id,'Có mặt','active' from auto_absence_context returning id
) update auto_absence_context set present_player_id = (select id from created);
with created as (
  insert into public.player_profiles(club_id,full_name,status)
  select club_id,'Chưa điểm danh','active' from auto_absence_context returning id
) update auto_absence_context set unmarked_player_id = (select id from created);
insert into public.team_players(club_id,team_id,player_id)
select club_id,team_id,present_player_id from auto_absence_context
union all
select club_id,team_id,unmarked_player_id from auto_absence_context;
insert into public.team_membership_periods(club_id,team_id,player_id,joined_on)
select club_id,team_id,present_player_id,date '2025-12-01' from auto_absence_context
union all
select club_id,team_id,unmarked_player_id,date '2025-12-01' from auto_absence_context;
with created as (
  insert into public.team_trainings(club_id,team_id,team_name,training_date,training_time,location,attendance,submitted_by)
  select club_id,team_id,'Auto Absence Team','2026-01-01','19:00','Test field',
    jsonb_build_array(jsonb_build_object('player_id',present_player_id,'status','present')),
    user_id
  from auto_absence_context
  returning id
) update auto_absence_context set training_id = (select id from created);

select is(
  public.auto_mark_overdue_training_absences('2026-01-01 12:09:59+00'::timestamptz),
  0,
  'no absence is written before the 10-minute UTC+7 deadline'
);
select is(
  public.auto_mark_overdue_training_absences('2026-01-01 12:10:00+00'::timestamptz),
  1,
  'unmarked attendance is closed at the 10-minute UTC+7 deadline'
);
select ok(
  (select attendance from public.team_trainings where id=(select training_id from auto_absence_context)) @>
    jsonb_build_array(jsonb_build_object('player_id',(select present_player_id from auto_absence_context),'status','present')),
  'explicit present attendance is preserved'
);
select ok(
  (select attendance from public.team_trainings where id=(select training_id from auto_absence_context)) @>
    jsonb_build_array(jsonb_build_object('player_id',(select unmarked_player_id from auto_absence_context),'status','absent')),
  'unmarked active team member becomes absent'
);
select is(
  (select jsonb_array_length(attendance) from public.team_trainings where id=(select training_id from auto_absence_context)),
  2,
  'all roster members have a final attendance status'
);
select throws_ok(
  $$insert into public.team_trainings(club_id,team_id,team_name,training_date,training_time,location,submitted_by)
    select club_id,team_id,'Invalid time','2026-01-02','25:61','Test field',user_id from auto_absence_context$$,
  '23514',
  'new row for relation "team_trainings" violates check constraint "team_trainings_time_of_day_check"',
  'database rejects malformed training times'
);

select * from finish();
rollback;
