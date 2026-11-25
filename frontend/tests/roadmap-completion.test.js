import test from 'node:test';
import assert from 'node:assert/strict';
import { state } from '../src/state.js';
import { page } from '../src/pages.js';
import { inventoryPage } from '../src/inventory-page.js';
import { financePage } from '../src/finance-page.js';
import { publicClubPage } from '../src/views/public-club-page.js';
import { createSupabaseApiClient } from '../src/supabase-api.js';
import { check } from '../src/services/service-helpers.js';

test('roadmap marks all 6 platform modules as ĐÃ HOÀN THIỆN', () => {
  state.loading = false;
  state.error = '';
  state.route = 'roadmap';
  const html = page();
  const completedBadges = [...html.matchAll(/ĐÃ HOÀN THIỆN/g)].length;
  assert.equal(completedBadges, 6);
  assert.doesNotMatch(html, /ĐANG PHÁT TRIỂN|CHƯA TRIỂN KHAI/);
});

test('inventoryPage renders incident KPIs and damage/loss action controls', () => {
  const html = inventoryPage({
    inventory: {
      data: [
        {
          id: 11,
          name: 'Bóng thi đấu FIFA',
          category: 'Dụng cụ sân',
          unit: 'quả',
          kind: 'asset',
          quantity: 4,
          low_stock_threshold: 5,
          archived: false,
        },
      ],
      current_page: 1,
      last_page: 1,
      total: 1,
      summary: { total_items: 1, low_stock_count: 1, incident_count: 3 },
    },
    canManage: true,
  });

  assert.match(html, /Báo cáo hỏng \/ mất \(3\)/);
  assert.match(html, /data-action="inventory-incident"/);
  assert.match(html, /Tồn thấp/);
});

test('inventoryService routes damage/loss movements, assignment incidents, and incident reports', async () => {
  const rpcCalls = [];
  const client = {
    auth: {
      async getUser() {
        return { data: { user: { id: 'u-1', email: 'mgr@club.vn' } }, error: null };
      },
    },
    async rpc(fn, args) {
      rpcCalls.push({ fn, args });
      if (fn === 'record_inventory_movement') {
        return { data: { id: 90, ...args }, error: null };
      }
      if (fn === 'report_inventory_assignment_incident') {
        return { data: { assignment_id: args.p_assignment_id, remaining: 0 }, error: null };
      }
      if (fn === 'get_inventory_incidents_report') {
        return {
          data: {
            damaged_count: 2,
            lost_count: 1,
            data: [{ id: 1, item_name: 'Áo bib', type: 'damaged', reason: 'Rách' }],
          },
          error: null,
        };
      }
      return { data: null, error: null };
    },
    from(table) {
      return {
        select() { return this; },
        eq() { return this; },
        single() {
          if (table === 'profiles') {
            return Promise.resolve({ data: { id: 'u-1', name: 'Quản lý', email: 'mgr@club.vn' }, error: null });
          }
          if (table === 'inventory_items') {
            return Promise.resolve({ data: { quantity: 10 }, error: null });
          }
          return Promise.resolve({ data: null, error: null });
        },
      };
    },
  };

  const api = createSupabaseApiClient({ client });

  await api.post('/clubs/7/inventory/15/movements', {
    type: 'damaged',
    quantity: 2,
    reason: 'Rách vỏ bóng khi tập',
  });
  assert.equal(rpcCalls[0].fn, 'record_inventory_movement');
  assert.equal(rpcCalls[0].args.p_type, 'damaged');
  assert.equal(rpcCalls[0].args.p_change, -2);

  const assignIncident = await api.post('/clubs/7/inventory/15/assignments/44/incident', {
    incident_type: 'lost',
    quantity: 1,
    reason: 'Thất lạc sau trận giao hữu',
  });
  assert.equal(assignIncident.data.remaining, 0);
  assert.equal(rpcCalls[1].fn, 'report_inventory_assignment_incident');
  assert.equal(rpcCalls[1].args.p_incident_type, 'lost');

  const report = await api.get('/clubs/7/inventory/incidents');
  assert.equal(report.data.damaged_count, 2);
  assert.equal(report.data.lost_count, 1);
});

test('publicClubPage renders safely for anonymous visitors and escapes untrusted fields', () => {
  state.loading = false;
  state.user = null;
  state.publicClub = {
    club: {
      id: 9,
      name: 'FC <script>alert(1)</script> Sài Gòn',
      slug: 'fc-saigon',
      city: 'TP.HCM',
      home_ground: 'Sân Phú Thọ',
      formats: ['7', '11'],
      activity_start_date: '2024-05-10',
      is_published: true,
      headline: 'Chơi đẹp & Đoàn kết',
      content: {
        schedule_text: 'Thứ 4 & Chủ nhật 19:00',
        contact_phone: '0909123456',
      },
    },
    stats: { teams_count: 2, active_players_count: 28, matches_count: 14 },
    teams: [{ id: 1, name: 'Đội Hình A', format: '7', members_count: 15 }],
    awards: [{ id: 1, award_year: 2026, title: 'Cầu thủ xuất sắc', player_name: 'Nguyễn Văn A' }],
    open_posts: [
      {
        id: 3,
        title: 'Tuyển thủ môn & hậu vệ',
        position: 'GK / CB',
        requirements: 'Nhiệt huyết, đúng giờ',
        deadline: '2026-12-20',
      },
    ],
  };

  const html = publicClubPage();
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /FC &lt;script&gt;alert\(1\)&lt;\/script&gt; Sài Gòn/);
  assert.match(html, /10\/05\/2024/);
  assert.match(html, /20\/12\/2026/);
  assert.match(html, /data-form="public-recruitment-apply"/);
});

test('public club endpoints work without user session and notifications/promotion RPCs wire cleanly', async () => {
  const rpcCalls = [];
  const client = {
    auth: {
      async getUser() {
        return { data: { user: null }, error: null };
      },
    },
    async rpc(fn, args) {
      rpcCalls.push({ fn, args });
      if (fn === 'get_public_club_page') {
        return { data: { club: { id: 5, name: 'FC Mở' }, stats: {}, teams: [], awards: [], open_posts: [] }, error: null };
      }
      if (fn === 'submit_public_recruitment_application') {
        return { data: { id: 88, status: 'new' }, error: null };
      }
      if (fn === 'promote_recruitment_application') {
        return { data: { application_id: args.p_application_id, player_id: 301, full_name: 'Lê Tân Binh' }, error: null };
      }
      if (fn === 'get_my_club_notifications') {
        return { data: { items: [{ key: 'k1', title: 'Lịch tập hôm nay', read: false }], unread_count: 1 }, error: null };
      }
      if (fn === 'mark_club_notifications_read') {
        return { data: { ok: true }, error: null };
      }
      return { data: null, error: null };
    },
    from() {
      return {
        select() { return this; },
        eq() { return this; },
        single() { return Promise.resolve({ data: { id: 'u-1', name: 'Admin', email: 'a@b.c' }, error: null }); },
      };
    },
  };

  const api = createSupabaseApiClient({ client });

  // Unauthenticated public reads & applications succeed without throwing 401
  const pub = await api.get('/public/clubs?slug=fc-mo', { silentUnauthorized: true });
  assert.equal(pub.data.club.name, 'FC Mở');

  const appRes = await api.post(
    '/public/clubs/5/apply',
    { post_id: 2, full_name: 'Lê Tân Binh', phone: '0912345678' },
    { silentUnauthorized: true }
  );
  assert.equal(appRes.data.id, 88);

  // Switch mock user to authenticated for club-scoped endpoints
  client.auth.getUser = async () => ({ data: { user: { id: 'u-1', email: 'a@b.c' } }, error: null });

  const promoted = await api.post('/clubs/5/recruitment/applications/88/promote', {});
  assert.equal(promoted.data.player_id, 301);

  const notifs = await api.get('/clubs/5/notifications');
  assert.equal(notifs.data.unread_count, 1);

  await api.post('/clubs/5/notifications/read', { keys: ['k1'] });
  assert.ok(rpcCalls.some((c) => c.fn === 'mark_club_notifications_read'));
});

test('financePage renders reversal controls for posted entries and period lock button', () => {
  state.clubId = 1;
  state.clubs = [
    {
      id: 1,
      name: 'FC Tài Chính',
      can_view_finance: true,
      can_manage_finance: true,
    },
  ];
  state.financePeriod = 'month';
  state.financeMonth = '2026-11';
  state.financeYear = '2026';
  state.plannedExpenses = [];
  state.finance = {
    summary: { income: 500000, expense: 100000, remaining: 400000, change: 400000 },
    chart: [],
    meta: { current_page: 1, last_page: 1, total: 3 },
    adjustments: { data: [], meta: { current_page: 1, last_page: 1, total: 0 } },
    data: [
      { id: 10, occurred_on: '2026-11-10', description: 'Thu tài trợ', type: 'income', amount: 500000, status: 'posted' },
      { id: 11, occurred_on: '2026-11-11', description: 'Nhập nhầm', type: 'expense', amount: 100000, status: 'reversed' },
      { id: 12, occurred_on: '2026-11-11', description: 'Đảo giao dịch #11', type: 'income', amount: 100000, status: 'posted', reversal_of_id: 11 },
    ],
  };

  const html = financePage();
  assert.match(html, /data-action="manage-finance-periods"/);
  assert.match(html, /data-action="reverse-finance" data-id="10"/);
  assert.doesNotMatch(html, /data-action="reverse-finance" data-id="11"/);
  assert.doesNotMatch(html, /data-action="reverse-finance" data-id="12"/);
  assert.match(html, /Đã đảo/);
  assert.match(html, /Bút toán đảo/);
});

test('check() translates new financial, inventory, and public recruitment errors to Vietnamese', () => {
  assert.throws(
    () => check({ error: { message: 'financial_period_closed' } }),
    /khóa sổ/
  );
  assert.throws(
    () => check({ error: { message: 'duplicate_application' } }),
    /đã được gửi/
  );
  assert.throws(
    () => check({ error: { message: 'invalid_incident_report' } }),
    /hỏng\/mất không hợp lệ/
  );
});
