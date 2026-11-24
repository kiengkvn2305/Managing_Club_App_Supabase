import test from 'node:test';
import assert from 'node:assert/strict';
import { dashboardMetrics, latestTeamDuesRate } from '../src/supabase-api.js';
import { state } from '../src/state.js';
import { dashboardPage } from '../src/views/dashboard-page.js';

test('dashboardPage renders cleanly with 0 members without throwing currentRole ReferenceError', () => {
  Object.assign(state, {
    clubId: 1,
    clubs: [{ id: 1, name: 'CLB Test', membership_role: 'owner', can_manage_roster: true }],
    members: [],
    dashboard: { members_count: 0, active_members_count: 0, teams_count: 0, managers_count: 1 },
  });
  const html = dashboardPage();
  assert.match(html, /Đội hình đang chờ bạn/);
  assert.match(html, /data-action="new-member"/);
});

test('dashboard metrics count player profiles, active profiles and manager memberships separately', () => {
  assert.deepEqual(
    dashboardMetrics({
      players: [{ status: 'active' }, { status: 'inactive' }, { status: 'active' }],
      managerMemberships: [{ role: 'owner', status: 'active' }, { role: 'member', status: 'active' }, { role: 'treasurer', status: 'inactive' }],
      teamsCount: 3,
    }),
    { members_count: 3, active_members_count: 2, teams_count: 3, managers_count: 1 },
  );
});

test('team card shows the latest effective dues rate and ignores future rates', () => {
  assert.deepEqual(
    latestTeamDuesRate([
      { team_id: 7, effective_month: '2026-01-01', amount: 100000 },
      { team_id: 7, effective_month: '2026-11-01', amount: 150000 },
      { team_id: 7, effective_month: '2026-12-01', amount: 200000 },
    ], 7, '2026-11-19'),
    { team_id: 7, effective_month: '2026-11-01', amount: 150000 },
  );
});
