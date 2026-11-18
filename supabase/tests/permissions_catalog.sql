begin;
create extension if not exists pgtap;
select plan(14);

select is((select count(*)::integer from information_schema.tables where table_schema='public' and table_type='BASE TABLE'),54,'all current public tables are inventoried');
select is((select count(*)::integer from information_schema.tables t join pg_class c on c.relname=t.table_name join pg_namespace n on n.oid=c.relnamespace and n.nspname='public' where t.table_schema='public' and t.table_type='BASE TABLE' and c.relrowsecurity),54,'all current public tables have RLS');
select is((select count(*)::integer from information_schema.role_table_grants where table_schema='public' and grantee='anon' and table_name <> 'club_public_settings'),0,'anon has no direct private table grants');
select ok(has_table_privilege('anon','public.club_public_settings','SELECT'),'anon can read only the public settings table');
select ok(has_table_privilege('authenticated','public.clubs','SELECT'),'authenticated can read clubs through RLS');
select ok(has_table_privilege('authenticated','public.player_profiles','INSERT'),'authenticated can create roster rows through roster RLS');
select ok(has_table_privilege('authenticated','public.club_matches','UPDATE'),'authenticated can update matches through roster RLS');
select ok(not has_table_privilege('authenticated','public.finance_transactions','INSERT'),'finance transactions cannot be inserted directly');
select ok(not has_table_privilege('authenticated','public.finance_transactions','UPDATE'),'finance transactions cannot be updated directly');
select ok(not has_table_privilege('authenticated','public.audit_logs','INSERT'),'audit logs cannot be inserted directly');
select ok(not has_table_privilege('authenticated','public.club_members','UPDATE') or has_column_privilege('authenticated','public.club_members','title','UPDATE'),'membership writes are limited to the title column');
select ok(not has_function_privilege('anon','public.create_club(text,text,text,text,jsonb)','EXECUTE'),'anon cannot execute create_club');
select ok(has_function_privilege('authenticated','public.create_club(text,text,text,text,jsonb)','EXECUTE'),'authenticated can execute create_club');
select ok(has_function_privilege('authenticated','public.post_finance_payment(bigint,bigint,numeric,date,text,jsonb,uuid)','EXECUTE'),'authenticated can execute payment RPC');

select * from finish();
rollback;
