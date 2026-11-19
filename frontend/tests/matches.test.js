import test from 'node:test';
import assert from 'node:assert/strict';
import { state } from '../src/state.js';
import { matchesPage, calendarRange } from '../src/matches-page.js';
import { createSupabaseApiClient } from '../src/supabase-api.js';

test('match list shows status and score without rendering untrusted markup', () => {
  Object.assign(state, { clubId: 1, clubs: [{ id: 1, membership_role: 'owner' }], matchesMonth: '2026-05', matches: { meta: { total: 1, current_page: 1, last_page: 1 }, data: [{ id: 9, match_date: '2026-05-12', start_time: '18:00', opponent: '<script>bad</script>', team_name: 'A', match_type: 'friendly', status: 'completed', our_score: 2, opponent_score: 1 }] } });
  const html = matchesPage();
  assert.match(html, /Lịch trận đấu/); assert.match(html, /2 – 1/); assert.match(html, /Đã kết thúc/);
  assert.doesNotMatch(html, /<script>bad<\/script>/);
});

test('calendar ranges align to Monday across months and years', () => {
  assert.deepEqual(calendarRange('month', '2026-02', '2026-02-01'), { from: '2026-01-26', to: '2026-03-01' });
  assert.deepEqual(calendarRange('week', '2026-05', '2026-05-12'), { from: '2026-05-11', to: '2026-05-17' });
});

test('match cost split preview calculates equal and weighted shares with exact remainder allocation', async () => {
  const fakeSupabase = {
    auth: { getUser: async () => ({ data: { user: { id: '00000000-0000-0000-0000-000000000001' } } }) },
    from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { role: 'owner' } }) }) }) }) }),
  };
  const api = createSupabaseApiClient({ client: fakeSupabase });
  const res1 = await api.post('/clubs/1/matches/10/cost-split/preview', {
    stadium: 100,
    method: 'equal',
    players: [
      { player_id: 1, exempt: true },
      { player_id: 2, exempt: false },
      { player_id: 3, exempt: false }
    ]
  });
  assert.equal(res1.data.total, 100);
  assert.equal(res1.data.receivables.find((r) => r.player_id === 1).amount, 0);
  assert.equal(res1.data.receivables.find((r) => r.player_id === 2).amount, 50);
  assert.equal(res1.data.receivables.find((r) => r.player_id === 3).amount, 50);

  const res2 = await api.post('/clubs/1/matches/10/cost-split/preview', {
    stadium: 100,
    method: 'weighted',
    players: [
      { player_id: 1, weight: 1, exempt: false },
      { player_id: 2, weight: 3, exempt: false }
    ]
  });
  assert.equal(res2.data.total, 100);
  assert.equal(res2.data.receivables.find((r) => r.player_id === 1).amount, 25);
  assert.equal(res2.data.receivables.find((r) => r.player_id === 2).amount, 75);

  const res3 = await api.post('/clubs/1/matches/10/cost-split/preview', {
    stadium: 100,
    method: 'equal',
    players: [
      { player_id: 1, exempt: false },
      { player_id: 2, exempt: false },
      { player_id: 3, exempt: false }
    ]
  });
  const sum = res3.data.receivables.reduce((acc, r) => acc + r.amount, 0);
  assert.equal(sum, 100);
});
