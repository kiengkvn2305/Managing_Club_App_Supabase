-- Runtime transaction tests. Every row is created inside a transaction and rolled back.
begin;
create extension if not exists pgtap;
select plan(17);

create temp table finance_test_context (
  user_id uuid,
  club_id bigint,
  team_id bigint,
  player_id bigint,
  period_id bigint,
  transaction_id bigint,
  dues_id bigint,
  payment_id bigint
) on commit drop;

insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values('00000000-0000-0000-0000-000000000099','authenticated','authenticated','finance-test@example.local','',now(),'{}'::jsonb,'{"name":"Finance Test"}'::jsonb,now(),now());
insert into finance_test_context(user_id) values('00000000-0000-0000-0000-000000000099');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000099',true);

with created as (
  insert into public.clubs(name,slug,format,formats) values('Finance Test Club','finance-test-club','7','["7"]'::jsonb) returning id
)
update finance_test_context set club_id=(select id from created);
insert into public.club_members(club_id,user_id,role,status) select club_id,user_id,'owner','active'::public.member_status from finance_test_context;
with created as (
  insert into public.teams(club_id,name,format) select club_id,'Finance Test Team','7' from finance_test_context returning id
)
update finance_test_context set team_id=(select id from created);
with created as (
  insert into public.player_profiles(club_id,full_name,status) select club_id,'Finance Test Player','active'::public.player_status from finance_test_context returning id
)
update finance_test_context set player_id=(select id from created);
insert into public.team_players(club_id,team_id,player_id) select club_id,team_id,player_id from finance_test_context;

select ok(public.can_manage_finance((select club_id from finance_test_context)), 'test owner can manage finance');
select lives_ok($$select public.create_financial_period((select club_id from finance_test_context),'2099-01-01','2099-01-31')$$, 'period can be created');
update finance_test_context set period_id=(select id from public.financial_periods where club_id=(select club_id from finance_test_context) and starts_on='2099-01-01');
select lives_ok($$select public.record_finance_transaction((select club_id from finance_test_context),'expense'::public.finance_type,125.50,'2099-01-05','Test expense',null,null,null,null,'00000000-0000-0000-0000-000000000101')$$, 'transaction can be posted');
update finance_test_context set transaction_id=(select id from public.finance_transactions where club_id=(select club_id from finance_test_context) and idempotency_key='00000000-0000-0000-0000-000000000101');
select is((select status from public.finance_transactions where id=(select transaction_id from finance_test_context)),'posted','new transaction is posted');
select is((select count(*)::integer from public.finance_transactions where club_id=(select club_id from finance_test_context) and idempotency_key='00000000-0000-0000-0000-000000000101'),1,'idempotency prevents duplicate transaction');
select lives_ok($$select public.request_finance_approval((select club_id from finance_test_context),(select transaction_id from finance_test_context))$$, 'approval can be requested');
select is((select status from public.finance_transactions where id=(select transaction_id from finance_test_context)),'pending','approval makes transaction pending');
select lives_ok($$select public.decide_finance_approval((select club_id from finance_test_context),(select transaction_id from finance_test_context),'approved','test approval')$$, 'approval can be decided');
select is((select status from public.finance_transactions where id=(select transaction_id from finance_test_context)),'posted','approved transaction is posted');
select lives_ok($$select public.reverse_finance_transaction((select club_id from finance_test_context),(select transaction_id from finance_test_context),'test reversal','00000000-0000-0000-0000-000000000102')$$, 'transaction can be reversed');
select is((select status from public.finance_transactions where id=(select transaction_id from finance_test_context)),'reversed','original transaction is marked reversed');
select is((select count(*)::integer from public.finance_transactions where reversal_of_id=(select transaction_id from finance_test_context)),1,'reversal creates one compensating transaction');
select is((public.finance_ledger_page((select club_id from finance_test_context),null,null,1,20,'day')->'summary'->>'expense'),'0','ledger excludes reversed original from expenses');
select is((public.finance_ledger_page((select club_id from finance_test_context),null,null,1,20,'day')->'summary'->>'income'),'125.50','ledger includes the posted compensating reversal');
with created as (
  insert into public.team_dues_entries(club_id,team_id,player_id,month,status,amount,created_by)
  select club_id,team_id,player_id,'2100-01-01','unpaid',100,'00000000-0000-0000-0000-000000000099' from finance_test_context returning id
)
update finance_test_context set dues_id=(select id from created);
select lives_ok($$select public.post_finance_payment((select club_id from finance_test_context),(select player_id from finance_test_context),40,'2100-01-02','PAY-1',jsonb_build_array(jsonb_build_object('dues_entry_id',(select dues_id from finance_test_context),'amount',40)),'00000000-0000-0000-0000-000000000103')$$, 'partial payment can be posted');
select is((select paid_amount from public.team_dues_entries where id=(select dues_id from finance_test_context)),40::numeric,'partial payment updates paid amount');
select is((select status from public.team_dues_entries where id=(select dues_id from finance_test_context)),'unpaid','partial payment keeps due open');
rollback;
