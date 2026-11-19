begin;
create extension if not exists pgtap;
select plan(5);

create temp table manager_test_context (
  owner_id uuid,
  member_id uuid,
  club_id bigint,
  team_id bigint,
  owner_membership_id bigint,
  member_membership_id bigint
) on commit drop;

insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values
  ('00000000-0000-0000-0000-000000000199','authenticated','authenticated','manager-owner@example.local','',now(),'{}'::jsonb,'{"name":"Manager Owner"}'::jsonb,now(),now()),
  ('00000000-0000-0000-0000-000000000198','authenticated','authenticated','manager-member@example.local','',now(),'{}'::jsonb,'{"name":"Manager Member"}'::jsonb,now(),now());
insert into manager_test_context(owner_id,member_id) values('00000000-0000-0000-0000-000000000199','00000000-0000-0000-0000-000000000198');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000199',true);

with created as (
  insert into public.clubs(name,slug,format,formats) values('Manager Test Club','manager-test-club','7','["7"]'::jsonb) returning id
)
update manager_test_context set club_id=(select id from created);
with memberships as (
  insert into public.club_members(club_id,user_id,role,status)
  select club_id,owner_id,'owner'::public.club_role,'active'::public.member_status from manager_test_context
  union all
  select club_id,member_id,'member'::public.club_role,'active'::public.member_status from manager_test_context
  returning id,user_id
)
update manager_test_context set owner_membership_id=(select id from memberships where user_id=owner_id), member_membership_id=(select id from memberships where user_id=member_id);
with created as (
  insert into public.teams(club_id,name,format) select club_id,'Manager Test Team','7' from manager_test_context returning id
)
update manager_test_context set team_id=(select id from created);

select lives_ok($$select public.sync_team_managers((select club_id from manager_test_context),(select team_id from manager_test_context),array[(select member_membership_id from manager_test_context)]::bigint[])$$, 'manager can assign a team manager');
select is((select count(*)::integer from public.team_managers where club_id=(select club_id from manager_test_context) and team_id=(select team_id from manager_test_context)),1,'one manager link is created');
select is((select membership_id from public.team_managers where club_id=(select club_id from manager_test_context) and team_id=(select team_id from manager_test_context)),(select member_membership_id from manager_test_context),'the selected membership is linked');
select lives_ok($$select public.sync_team_managers((select club_id from manager_test_context),(select team_id from manager_test_context),'{}'::bigint[])$$, 'manager can clear team managers');
select is((select count(*)::integer from public.team_managers where club_id=(select club_id from manager_test_context) and team_id=(select team_id from manager_test_context)),0,'clearing managers removes only the team links');

select * from finish();
rollback;
