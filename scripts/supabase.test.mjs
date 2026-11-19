import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname.replace(/^\//, '').replaceAll('/', '\\');
const sql = readFileSync(join(root, 'supabase', 'migrations', '20261119000000_fcms_supabase.sql'), 'utf8');
const financeWorkflow = readFileSync(join(root, 'supabase', 'migrations', '20261119000002_finance_workflows.sql'), 'utf8');
const permissions = readFileSync(join(root, 'supabase', 'migrations', '20261119000003_permissions_hardening.sql'), 'utf8');
const frontend = readFileSync(join(root, 'frontend', 'src', 'supabase-api.js'), 'utf8');
const app = readFileSync(join(root, 'frontend', 'src', 'app.js'), 'utf8');
const vite = readFileSync(join(root, 'frontend', 'vite.config.js'), 'utf8');
const sw = readFileSync(join(root, 'frontend', 'public', 'sw.js'), 'utf8');
const redirects = readFileSync(join(root, 'frontend', 'public', '_redirects'), 'utf8');

test('Supabase migration contains the multi-club identity model and tenant helpers', () => {
  assert.match(sql, /create table public\.profiles/);
  assert.match(sql, /create table public\.club_members/);
  assert.match(sql, /unique \(club_id, user_id\)/);
  assert.match(sql, /create or replace function public\.is_active_member/);
  assert.match(sql, /create or replace function public\.club_role/);
  assert.match(sql, /create or replace function public\.create_club/);
  assert.match(sql, /create or replace function public\.accept_club_invitation/);
});

test('every tenant table is RLS-enabled and has an active-membership select policy', () => {
  assert.ok([...sql.matchAll(/create table public\./g)].length >= 40);
  assert.match(sql, /alter table public\.[^;]+ enable row level security/);
  assert.match(sql, /create policy [^;]+_select on public\.[^;]+using \(public\.is_active_member\(club_id\)\)/);
  assert.match(sql, /create policy clubs_member_select/);
});

test('financial and inventory writes are database RPCs with row locks and replay protection', () => {
  assert.match(sql, /create or replace function public\.record_finance_transaction/);
  assert.match(sql, /from public\.finance_transactions where club_id=p_club_id and idempotency_key=p_idempotency_key/);
  assert.match(sql, /from public\.clubs where id=p_club_id and status='active' for update/);
  assert.match(sql, /create or replace function public\.record_inventory_movement/);
  assert.match(sql, /from public\.inventory_items where club_id=p_club_id and id=p_item_id for update/);
  assert.match(sql, /create or replace function public\.record_team_dues/);
  assert.match(sql, /create or replace function public\.record_player_dues/);
  assert.match(sql, /create or replace function public\.correct_team_dues/);
  assert.match(sql, /create or replace function public\.sync_team_players/);
  assert.match(sql, /create or replace function public\.set_player_primary_team/);
  assert.match(sql, /create or replace function public\.set_team_player_attribute/);
  assert.match(sql, /create or replace function public\.create_match_cost_split/);
  assert.match(sql, /create or replace function public\.assign_inventory/);
  assert.match(sql, /create or replace function public\.return_inventory_assignment/);
  assert.match(sql, /create or replace function public\.save_planned_expense/);
  assert.match(sql, /create or replace function public\.create_club_poll/);
  assert.match(sql, /create or replace function public\.create_club_invitation/);
  assert.match(sql, /create or replace function public\.claim_player_profile/);
  assert.match(sql, /not public\.is_active_member\(p_club_id\)/);
  assert.match(frontend, /rpc\("record_finance_transaction"/);
  assert.match(frontend, /rpc\("record_player_dues"/);
  assert.match(frontend, /rpc\("correct_team_dues"/);
  assert.match(frontend, /rpc\("record_inventory_movement"/);
  assert.doesNotMatch(frontend, /from\("finance_transactions"\)\.insert/);
  assert.doesNotMatch(frontend, /from\("inventory_items"\)\.update/);
  assert.match(sql, /amount numeric\(20,2\) not null check \(amount > 0\)/);
  assert.match(sql, /create table public\.financial_periods/);
  assert.match(sql, /create table public\.transaction_approvals/);
  assert.match(sql, /create table public\.payment_allocations/);
});

test('financial workflow RPCs cover periods, approvals, reversals and partial payments', () => {
  assert.match(financeWorkflow, /create or replace function public\.create_financial_period/);
  assert.match(financeWorkflow, /create or replace function public\.close_financial_period/);
  assert.match(financeWorkflow, /create or replace function public\.request_finance_approval/);
  assert.match(financeWorkflow, /create or replace function public\.decide_finance_approval/);
  assert.match(financeWorkflow, /create or replace function public\.reverse_finance_transaction/);
  assert.match(financeWorkflow, /create or replace function public\.post_finance_payment/);
  assert.match(financeWorkflow, /paid_amount numeric\(20,2\)/);
  assert.match(financeWorkflow, /create or replace function public\.finance_summary/);
  assert.match(financeWorkflow, /assert_financial_period_open/);
  for (const rpc of ['finance_summary', 'create_financial_period', 'close_financial_period', 'request_finance_approval', 'decide_finance_approval', 'reverse_finance_transaction', 'post_finance_payment']) {
    assert.match(frontend, new RegExp(`rpc\\("${rpc}"`));
  }
});

test('team manager edits use the atomic RPC instead of direct link writes', () => {
  const managerMigration = readFileSync(join(root, 'supabase', 'migrations', '20261119000005_sync_team_managers.sql'), 'utf8');
  assert.match(managerMigration, /create or replace function public\.sync_team_managers/);
  assert.match(frontend, /rpc\("sync_team_managers"/);
  assert.doesNotMatch(frontend, /from\("team_managers"\)\.(insert|update|delete)/);
});

test('Cloudflare frontend uses public Supabase config and never service-role credentials', () => {
  assert.match(frontend, /VITE_SUPABASE_URL/);
  assert.match(frontend, /VITE_SUPABASE_ANON_KEY/);
  assert.doesNotMatch(frontend, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.doesNotMatch(vite, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(app, /from ["']\.\/api-supabase\.js["']/);
  assert.match(sw, /url\.pathname\.startsWith\("\/api"\)/);
  assert.match(sw, /url\.pathname\.startsWith\("\/auth"\)/);
  assert.match(redirects, /\/\* \/index\.html 200/);
});

test('permission hardening uses explicit grants without weakening RLS', () => {
  assert.match(permissions, /revoke all privileges on all tables in schema public from anon, authenticated/);
  assert.doesNotMatch(permissions, /grant all on all tables/i);
  assert.match(permissions, /grant select on public\.club_public_settings to anon/);
  assert.match(permissions, /create policy profiles_visible_select/);
  assert.match(permissions, /create policy club_polls_select/);
  assert.match(permissions, /revoke all on function public\.can_view_profile\(uuid\) from anon/);
  assert.match(permissions, /record_finance_transaction\(bigint,public\.finance_type,numeric,date,text/);
  assert.doesNotMatch(permissions, /grant (insert|update|delete).*public\.finance_transactions/i);
  assert.doesNotMatch(permissions, /grant (insert|update|delete).*public\.audit_logs/i);
});
