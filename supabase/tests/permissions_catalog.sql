begin;
create extension if not exists pgtap;
select plan(15);

select ok((select count(*)::integer from information_schema.tables where table_schema='public' and table_type='BASE TABLE') > 0,'all current public tables are inventoried');
select is(
  (select count(*)::integer from information_schema.tables t join pg_class c on c.relname=t.table_name join pg_namespace n on n.oid=c.relnamespace and n.nspname='public' where t.table_schema='public' and t.table_type='BASE TABLE' and not c.relrowsecurity),
  0,
  'all current public tables have RLS'
);
select is((select count(*)::integer from information_schema.role_table_grants where table_schema='public' and grantee='anon'),0,'anon has no direct table grants');
select ok(has_table_privilege('authenticated','public.clubs','SELECT'),'authenticated can read clubs through RLS');
select ok(has_column_privilege('authenticated','public.player_profiles','full_name','INSERT'),'authenticated can create roster rows through column grants and roster RLS');
select ok(has_table_privilege('authenticated','public.club_matches','UPDATE'),'authenticated can update matches through roster RLS');
select ok(not has_table_privilege('authenticated','public.finance_transactions','INSERT'),'finance transactions cannot be inserted directly');
select ok(not has_table_privilege('authenticated','public.finance_transactions','UPDATE'),'finance transactions cannot be updated directly');
select ok(not has_table_privilege('authenticated','public.audit_logs','INSERT'),'audit logs cannot be inserted directly');
select ok(not has_table_privilege('authenticated','public.dues_collection_requests','SELECT'),'dues replay records are never exposed directly');
select ok(not has_table_privilege('authenticated','public.match_attendances','INSERT'),'match attendance cannot be inserted directly');
select ok(not has_table_privilege('authenticated','public.club_members','UPDATE') or has_column_privilege('authenticated','public.club_members','title','UPDATE'),'membership writes are limited to the title column');
select ok(not has_function_privilege('anon','public.create_club(text,text,text,text,jsonb)','EXECUTE'),'anon cannot execute create_club');
select ok(has_function_privilege('authenticated','public.create_club(text,text,text,text,jsonb)','EXECUTE'),'authenticated can execute create_club');
select ok(has_function_privilege('authenticated','public.post_finance_payment(bigint,bigint,numeric,date,text,jsonb,uuid)','EXECUTE'),'authenticated can execute payment RPC');
select ok(has_function_privilege('authenticated','public.save_match_attendance(bigint,bigint,jsonb)','EXECUTE'),'authenticated can execute locked match attendance RPC');

select * from finish();
rollback;
