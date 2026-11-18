import test from 'node:test';
import assert from 'node:assert/strict';
import { dashboardMetrics } from '../src/supabase-api.js';

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
