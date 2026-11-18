-- Run with `supabase test db` after the local Supabase stack is available.
-- This is intentionally data-free: it checks schema/RLS/RPC contracts without
-- creating users or financial records.
begin;
create extension if not exists pgtap;
select plan(18);
select ok(to_regclass('public.profiles') is not null, 'profiles exists');
select ok(to_regclass('public.club_members') is not null, 'club_members exists');
select ok(to_regclass('public.finance_transactions') is not null, 'finance_transactions exists');
select ok(to_regclass('public.transaction_approvals') is not null, 'transaction_approvals exists');
select is((select data_type from information_schema.columns where table_schema='public' and table_name='finance_transactions' and column_name='amount'), 'numeric', 'finance amount uses numeric');
select is((select relrowsecurity::text from pg_class where oid='public.club_members'::regclass), 'true', 'club_members has RLS');
select is((select relrowsecurity::text from pg_class where oid='public.finance_transactions'::regclass), 'true', 'finance_transactions has RLS');
select ok(to_regprocedure('public.record_finance_transaction(bigint,public.finance_type,numeric,date,text,text,text,text,text,uuid)') is not null, 'finance RPC exists');
select ok(to_regprocedure('public.record_player_dues(bigint,bigint,date,integer,text)') is not null, 'dues RPC exists');
select ok(to_regprocedure('public.record_inventory_movement(bigint,bigint,text,integer,text)') is not null, 'inventory RPC exists');
select ok(to_regprocedure('public.create_financial_period(bigint,date,date)') is not null, 'financial period RPC exists');
select ok(to_regprocedure('public.close_financial_period(bigint,bigint)') is not null, 'close period RPC exists');
select ok(to_regprocedure('public.request_finance_approval(bigint,bigint)') is not null, 'approval request RPC exists');
select ok(to_regprocedure('public.decide_finance_approval(bigint,bigint,text,text)') is not null, 'approval decision RPC exists');
select ok(to_regprocedure('public.reverse_finance_transaction(bigint,bigint,text,uuid)') is not null, 'reversal RPC exists');
select ok(to_regprocedure('public.post_finance_payment(bigint,bigint,numeric,date,text,jsonb,uuid)') is not null, 'payment RPC exists');
select ok(to_regprocedure('public.finance_summary(bigint,date,date)') is not null, 'finance summary RPC exists');
select is((select data_type from information_schema.columns where table_schema='public' and table_name='team_dues_entries' and column_name='paid_amount'), 'numeric', 'dues partial payment amount uses numeric');
select * from finish();
rollback;
