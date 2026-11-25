import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  formatDate,
  formatMonth,
  formatVietnamDateTime,
  matchesSearch,
  canManageClub,
  canManageRoster,
  canManageAttendance,
  isCoOwnerOrOwner,
  TITLE_PRESETS,
  unpackList,
  escapeHtml,
  roleLabel,
  compareVietnameseNames,
} from '../frontend/src/utils.js';
import { state } from '../frontend/src/state.js';
import { dateControl, select } from '../frontend/src/components/ui.js';
import { duesPage } from '../frontend/src/dues-page.js';
import { financePage } from '../frontend/src/finance-page.js';
import { matchesPage, calendarRange } from '../frontend/src/matches-page.js';
import { clubPage } from '../frontend/src/views/club-page.js';
import { boardPage } from '../frontend/src/views/board-page.js';
import { attendancePage } from '../frontend/src/views/attendance-page.js';
import { activitiesPage } from '../frontend/src/views/activities-page.js';
import { dashboardPage } from '../frontend/src/views/dashboard-page.js';
import { createClubController } from '../frontend/src/controllers/club-controller.js';
import { createRosterController } from '../frontend/src/controllers/roster-controller.js';
import { createBoardController } from '../frontend/src/controllers/board-controller.js';
import { createSupabaseApiClient } from '../frontend/src/supabase-api.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const MIGRATIONS_DIR = path.join(ROOT, 'supabase', 'migrations');

function readText(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf8');
}

function readAllMigrations() {
  const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
  return files.map((file) => ({
    file,
    sql: fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8'),
  }));
}

function getLatestSqlFunction(fnName) {
  const migrations = readAllMigrations();
  const re = new RegExp(
    `create\\s+or\\s+replace\\s+function\\s+public\\.${fnName}\\b[\\s\\S]*?\\$\\$;`,
    'gi',
  );
  let latest = null;
  for (const m of migrations) {
    const matches = m.sql.match(re);
    if (matches?.length) {
      latest = { file: m.file, body: matches[matches.length - 1] };
    }
  }
  return latest;
}

/**
 * Chainable Supabase mock compatible with createSupabaseApiClient({ client }).
 */
function createMockSupabase(tables = {}, rpcHandlers = {}, spies = {}) {
  const applyFilters = (rows, ops) => {
    let out = rows.map((r) => ({ ...r }));
    for (const op of ops) {
      if (op.type === 'eq') out = out.filter((r) => r[op.col] === op.val);
      if (op.type === 'neq') out = out.filter((r) => r[op.col] !== op.val);
      if (op.type === 'in') out = out.filter((r) => op.vals.includes(r[op.col]));
      if (op.type === 'is') out = out.filter((r) => (op.val === null ? r[op.col] == null : r[op.col] === op.val));
      if (op.type === 'order') {
        out.sort((a, b) => {
          const av = a[op.col] ?? '';
          const bv = b[op.col] ?? '';
          const cmp = String(av).localeCompare(String(bv));
          return op.asc ? cmp : -cmp;
        });
      }
      if (op.type === 'limit') out = out.slice(0, op.n);
    }
    return out;
  };

  return {
    auth: {
      async getUser() {
        return { data: { user: { id: 'u-current', email: 'current@fcms.vn', user_metadata: { name: 'Current User' } } }, error: null };
      },
      async getSession() {
        return {
          data: {
            session: {
              access_token: 'mock-token',
              user: { id: 'u-current', email: 'current@fcms.vn', user_metadata: { name: 'Current User' } },
            },
          },
          error: null,
        };
      },
    },
    async rpc(name, params) {
      if (spies.rpcs) spies.rpcs.push({ name, params });
      if (rpcHandlers[name]) return rpcHandlers[name](params);
      return { data: null, error: null };
    },
    from(table) {
      const ops = [];
      let mode = 'select';
      let payload = null;
      const builder = {
        select() {
          return builder;
        },
        insert(data) {
          mode = 'insert';
          payload = data;
          if (spies.inserts) spies.inserts.push({ table, data });
          return builder;
        },
        upsert(data) {
          mode = 'upsert';
          payload = data;
          if (spies.upserts) spies.upserts.push({ table, data });
          return builder;
        },
        update(data) {
          mode = 'update';
          payload = data;
          if (spies.updates) spies.updates.push({ table, data });
          return builder;
        },
        delete() {
          mode = 'delete';
          if (spies.deletes) spies.deletes.push({ table });
          return builder;
        },
        eq(col, val) {
          ops.push({ type: 'eq', col, val });
          return builder;
        },
        neq(col, val) {
          ops.push({ type: 'neq', col, val });
          return builder;
        },
        in(col, vals) {
          ops.push({ type: 'in', col, vals });
          return builder;
        },
        is(col, val) {
          ops.push({ type: 'is', col, val });
          return builder;
        },
        ilike() {
          return builder;
        },
        or() {
          return builder;
        },
        order(col, opts = {}) {
          ops.push({ type: 'order', col, asc: opts.ascending !== false });
          return builder;
        },
        limit(n) {
          ops.push({ type: 'limit', n });
          return builder;
        },
        range(from, to) {
          ops.push({ type: 'range', from, to });
          return builder;
        },
        single() {
          const res = builder._exec();
          const row = Array.isArray(res.data) ? res.data[0] || null : res.data;
          return Promise.resolve({ data: row, error: res.error });
        },
        maybeSingle() {
          const res = builder._exec();
          const row = Array.isArray(res.data) ? res.data[0] || null : res.data;
          return Promise.resolve({ data: row, error: res.error });
        },
        _exec() {
          if (mode === 'insert' || mode === 'upsert') {
            const rows = Array.isArray(payload) ? payload : [payload];
            return { data: rows.map((r, i) => ({ id: 900 + i, ...r })), error: null };
          }
          if (mode === 'update') {
            return { data: [{ id: 1, ...payload }], error: null };
          }
          if (mode === 'delete') {
            return { data: [], error: null };
          }
          const rows = applyFilters(tables[table] || [], ops);
          return { data: rows, error: null };
        },
        then(resolve, reject) {
          return Promise.resolve(builder._exec()).then(resolve, reject);
        },
      };
      return builder;
    },
  };
}

// ============================================================================
// 1. ĐỊNH DẠNG NGÀY THÁNG (dd/mm/yyyy, mm/yyyy) & TIỆN ÍCH LÕI
// ============================================================================
describe('1. Định dạng ngày tháng (dd/mm/yyyy) & Tiện ích lõi', () => {
  test('formatDate hiển thị chuẩn dd/mm/yyyy, formatMonth chuẩn mm/yyyy và formatVietnamDateTime đúng giờ VN (UTC+7)', () => {
    assert.equal(formatDate('2026-11-25'), '25/11/2026');
    assert.equal(formatDate('2005-06-17T08:30:00Z'), '17/06/2005');
    assert.equal(formatMonth('2026-11'), '11/2026');
    assert.equal(formatMonth('2026-11-01'), '11/2026');
    assert.equal(formatVietnamDateTime('2026-11-25T10:30:00Z'), '17:30 25/11/2026');
  });

  test('dateControl tạo cặp input hiển thị dd/mm/yyyy và input date ISO ẩn kèm nút lịch', () => {
    const html = dateControl('training_date', '2026-11-25', { required: true });
    assert.match(html, /class="date-display"[^>]*value="25\/11\/2026"/);
    assert.match(html, /name="training_date"[^>]*type="date"[^>]*value="2026-11-25"/);
    assert.match(html, /data-date-picker-btn/);
  });

  test('matchesSearch hỗ trợ tìm kiếm tiếng Việt không dấu (chuỗi con)', () => {
    assert.equal(matchesSearch('Nguyễn Chí Bảo', 'nguyen chi bao'), true);
    assert.equal(matchesSearch('Đặng Văn Lâm', 'dang van lam'), true);
    assert.equal(matchesSearch('Phạm Xuân Mạnh', 'khong khop'), false);
  });
});

// ============================================================================
// 2. QUẢN TRỊ CLB, CHUYỂN QUYỀN CHỦ NHIỆM, XÓA CLB & GỠ TRANG CÔNG KHAI
// ============================================================================
describe('2. Quản trị CLB, Chuyển quyền Chủ nhiệm, Xóa CLB & Gỡ Trang công khai', () => {
  test('BUG-01: Bấm "Trao quyền Chủ nhiệm" ở dòng thành viên cụ thể trong #club-members phải mở đúng người được chọn (không bị club-controller chặn)', async () => {
    const openedDialogs = [];
    const club = { id: 1, name: 'FC Test', membership_role: 'owner', role: 'owner', status: 'active' };
    const ctx = {
      state: {
        clubId: 1,
        clubs: [club],
        clubMemberships: [
          { id: 10, user_id: 'u-owner', name: 'Chủ nhiệm A', role: 'owner', status: 'active' },
          { id: 11, user_id: 'u-other', name: 'Trần Văn X', email: 'x@fcms.vn', role: 'member', status: 'active' },
          { id: 12, user_id: 'u-target', name: 'Nguyễn Văn B', email: 'b@fcms.vn', role: 'member', status: 'active' },
        ],
        teams: [],
        members: [],
      },
      api: {
        post: async () => ({}),
        get: async () => ({
          data: [
            { id: 10, user_id: 'u-owner', name: 'Chủ nhiệm A', role: 'owner', status: 'active' },
            { id: 11, user_id: 'u-other', name: 'Trần Văn X', email: 'x@fcms.vn', role: 'member', status: 'active' },
            { id: 12, user_id: 'u-target', name: 'Nguyễn Văn B', email: 'b@fcms.vn', role: 'member', status: 'active' },
          ],
        }),
      },
      base: (p) => `/clubs/1${p}`,
      currentClub: () => club,
      currentRole: () => 'owner',
      unpackList,
      select,
      e: escapeHtml,
      roleLabel,
      compareVietnameseNames,
      requirePermission: () => true,
      dialog: (title, desc, body) => {
        openedDialogs.push({ title, desc, body });
        return { querySelector: () => ({ addEventListener: () => {} }) };
      },
      submit: () => {},
      toast: () => {},
      loadView: async () => {},
      loadApp: async () => {},
    };

    const clubCtrl = createClubController(ctx);
    const rosterCtrl = createRosterController(ctx);
    // Thứ tự đăng ký thật trong frontend/src/app.js: clubController đứng trước rosterController
    const controllers = [clubCtrl, rosterCtrl];
    const targetButton = { dataset: { id: 'u-target', name: 'Nguyễn Văn B' } };

    for (const c of controllers) {
      if (await c.handleAction('transfer-ownership', targetButton)) break;
    }

    assert.equal(openedDialogs.length, 1);
    const body = openedDialogs[0].body;
    // Khi bấm nút ở dòng của "Nguyễn Văn B" (data-id="u-target"), dialog phải trao trực tiếp (không bắt chọn lại dropdown) hoặc chọn sẵn u-target
    const isDirectConfirm = !body.includes('<select') && body.includes('Nguyễn Văn B');
    const hasPreselectedOption = /value="u-target"[^>]*selected/.test(body);
    assert.ok(
      isDirectConfirm || hasPreselectedOption,
      'club-controller.js chặn mất action transfer-ownership trước roster-controller.js nên bỏ qua data-id thành viên đã bấm trên #club-members',
    );
  });

  test('BUG-02: Nút "Xóa CLB" hiển thị cho System Admin trên club-page phải hoạt động khi bấm vào', async () => {
    const adminClub = { id: 1, name: 'FC Test', membership_role: 'member', role: 'member', status: 'active', is_system_admin: true };
    state.clubId = 1;
    state.clubs = [adminClub];
    state.user = { id: 'u-admin', is_system_admin: true };
    const html = clubPage();
    assert.match(html, /data-action="delete-club"/, 'club-page.js hiển thị nút Xóa CLB cho System Admin');

    let dialogOpened = false;
    const clubCtrl = createClubController({
      state,
      api: {},
      base: (p) => `/clubs/1${p}`,
      currentClub: () => adminClub,
      currentRole: () => 'member',
      e: escapeHtml,
      dialog: () => {
        dialogOpened = true;
        return { querySelector: () => ({ addEventListener: () => {} }) };
      },
      submit: () => {},
      toast: () => {},
      loadApp: async () => {},
    });

    const handled = await clubCtrl.handleAction('delete-club', { dataset: {} });
    assert.equal(
      Boolean(handled && dialogOpened),
      true,
      'club-controller.js:285 chỉ check currentRole() === "owner" nên System Admin bấm nút Xóa CLB không mở hộp thoại xác nhận',
    );
  });

  test('BUG-03: Đã bỏ Trang công khai thì không được còn chữ "cài đặt công khai" hay handler /public-settings thừa', () => {
    const rosterCtrlSrc = readText('frontend/src/controllers/roster-controller.js');
    const clubSvcSrc = readText('frontend/src/services/club-service.js');
    assert.doesNotMatch(
      rosterCtrlSrc,
      /cài đặt (trang )?công khai/i,
      'roster-controller.js vẫn còn chữ "cài đặt công khai" / "cài đặt trang công khai" sau khi đã bỏ tính năng Trang công khai',
    );
    assert.doesNotMatch(
      clubSvcSrc,
      /\/public-settings/,
      'club-service.js vẫn còn handler chết cho /public-settings',
    );
  });
});

// ============================================================================
// 3. PHÂN QUYỀN CHI TIẾT BCN & CÔ LẬP VAI TRÒ (FRONTEND + SQL)
// ============================================================================
describe('3. Phân quyền BCN chi tiết & Cô lập vai trò (Frontend + SQL)', () => {
  const memberClub = {
    id: 1,
    name: 'FC Test',
    membership_role: 'member',
    role: 'member',
    title: 'Thành viên',
    can_view_finance: false,
    can_manage_finance: false,
    can_manage_roster: false,
    can_manage_club: false,
    can_view_inventory: false,
    can_manage_inventory: false,
    can_view_activities: false,
    can_manage_activities: false,
    can_manage_attendance: false,
    can_view_attendance: true,
  };

  const treasurerClub = {
    ...memberClub,
    membership_role: 'treasurer',
    role: 'treasurer',
    title: 'Thủ quỹ',
    can_view_finance: true,
    can_manage_finance: true,
  };

  const mediaClub = {
    ...memberClub,
    title: 'Truyền thông',
    can_view_activities: true,
    can_manage_activities: true,
  };

  const externalClub = {
    ...memberClub,
    title: 'Đối ngoại',
    can_view_activities: true,
    can_manage_activities: true,
  };

  const coOwnerClub = {
    id: 1,
    name: 'FC Test',
    membership_role: 'co_owner',
    role: 'co_owner',
    title: 'Phó chủ nhiệm CLB',
    is_co_owner: true,
    can_view_finance: true,
    can_manage_finance: true,
    can_manage_roster: true,
    can_manage_club: true,
    can_view_inventory: true,
    can_manage_inventory: true,
    can_view_activities: true,
    can_manage_activities: true,
    can_manage_attendance: true,
    can_view_attendance: true,
  };

  test('Ma trận phân quyền frontend & TITLE_PRESETS khớp yêu cầu: Thành viên, Thủ quỹ, Truyền thông, Đối ngoại, Phó chủ nhiệm', () => {
    assert.equal(canManageAttendance(memberClub), false);
    assert.equal(canManageRoster(memberClub), false);
    assert.equal(canManageClub(memberClub), false);
    assert.equal(isCoOwnerOrOwner(memberClub), false);

    assert.equal(TITLE_PRESETS['Thủ quỹ'].can_view_finance, true);
    assert.equal(TITLE_PRESETS['Thủ quỹ'].can_manage_finance, true);
    assert.equal(TITLE_PRESETS['Thủ quỹ'].can_manage_activities, false);
    assert.equal(TITLE_PRESETS['Thủ quỹ'].can_manage_attendance, false);
    assert.equal(canManageClub(treasurerClub), false);

    for (const presetName of ['Truyền thông', 'Đối ngoại']) {
      assert.equal(TITLE_PRESETS[presetName].can_manage_activities, true);
      assert.equal(TITLE_PRESETS[presetName].can_view_finance, false);
      assert.equal(TITLE_PRESETS[presetName].can_manage_finance, false);
      assert.equal(TITLE_PRESETS[presetName].can_manage_attendance, false);
    }
    for (const c of [mediaClub, externalClub]) {
      assert.equal(canManageAttendance(c), false);
      assert.equal(canManageClub(c), false);
    }

    assert.equal(isCoOwnerOrOwner(coOwnerClub), true);
    assert.equal(canManageClub(coOwnerClub), true);
    assert.equal(canManageRoster(coOwnerClub), true);
    assert.equal(canManageAttendance(coOwnerClub), true);
    assert.equal(TITLE_PRESETS['Phó chủ nhiệm CLB'].can_manage_club, true);
    assert.equal(TITLE_PRESETS['Phó chủ nhiệm CLB'].can_manage_attendance, true);
    assert.equal(TITLE_PRESETS['Phó chủ nhiệm CLB'].can_manage_finance, true);
    assert.equal(TITLE_PRESETS['Phó chủ nhiệm CLB'].can_manage_activities, true);
  });

  test('BUG-04: Thủ quỹ (chỉ có quyền Tài chính) KHÔNG được phép gọi thao tác quản trị Ban chủ nhiệm (board-new)', async () => {
    let denied = false;
    let opened = false;
    const boardCtrl = createBoardController({
      state: {
        clubId: 1,
        clubs: [treasurerClub],
        members: [],
        boardMembers: [],
      },
      api: { get: async () => ({ data: [] }) },
      base: (p) => `/clubs/1${p}`,
      currentClub: () => treasurerClub,
      currentRole: () => 'treasurer',
      canManageClub: () => canManageClub(treasurerClub),
      unpackList,
      select,
      e: escapeHtml,
      requirePermission: (allowed) => {
        if (!allowed) denied = true;
        return allowed;
      },
      dialog: () => {
        opened = true;
        return { querySelector: () => ({ addEventListener: () => {} }) };
      },
      submit: () => {},
      toast: () => {},
      loadView: async () => {},
    });

    await boardCtrl.handleAction('board-new', { dataset: {} });
    assert.equal(
      denied && !opened,
      true,
      'board-controller.js:60-70 cho phép cả can_manage_finance / can_manage_roster quản trị BCN, trái với board-page.js & app.js (chỉ canManageClub)',
    );
  });

  test('BUG-05: SQL can_view_inventory() phải kiểm tra quyền can_view_inventory thay vì chỉ check can_manage_inventory', () => {
    const fn = getLatestSqlFunction('can_view_inventory');
    assert.ok(fn, 'Tìm thấy hàm SQL public.can_view_inventory');
    assert.match(
      fn.body,
      /has_club_permission\([^)]*'can_view_inventory'/,
      `SQL ${fn.file} can_view_inventory đang kiểm tra 'can_manage_inventory' thay vì 'can_view_inventory', làm người chỉ có quyền xem kho bị RLS chặn`,
    );
  });

  test('BUG-06: Mời thành viên với vai trò đơn lẻ (Hậu cần / HLV) không được gán role="general_manager" (tránh leo thang quyền mặc định)', () => {
    const rosterCtrlSrc = readText('frontend/src/controllers/roster-controller.js');
    const inviteSection = rosterCtrlSrc.slice(
      rosterCtrlSrc.indexOf('function invite()'),
      rosterCtrlSrc.indexOf('function editPermissions('),
    );
    assert.doesNotMatch(
      inviteSection,
      /permissions\.can_manage_roster[\s\S]{0,80}role\s*=\s*'general_manager'/,
      'roster-controller.js:318-323 gán role="general_manager" khi mời HLV/Hậu cần/Tài chính lẻ, dễ leo thang quyền mặc định trong SQL fallback',
    );
  });
});

// ============================================================================
// 4. TỔNG QUAN (DASHBOARD)
// ============================================================================
describe('4. Tổng quan CLB (Dashboard)', () => {
  test('Dashboard hiển thị số liệu thành viên/đội bóng, ẩn nút tạo thành viên cho thành viên thường và hiện cho quản lý', () => {
    state.clubId = 1;
    state.clubs = [{ id: 1, name: 'FC A', membership_role: 'member', can_manage_roster: false }];
    state.dashboard = {
      counts: { members: 12, active: 10, teams: 2, management: 3 },
    };
    state.members = [
      { id: 1, full_name: 'Nguyễn Văn A', jersey_number: 10, status: 'active', position: 'Tiền đạo' },
    ];
    const memberHtml = dashboardPage();
    assert.match(memberHtml, /12/);
    assert.match(memberHtml, /Nguyễn Văn A/);
    assert.match(memberHtml, /#10/);
    assert.doesNotMatch(memberHtml, /data-action="new-member"/);

    state.clubs = [{ id: 1, name: 'FC A', membership_role: 'owner', can_manage_roster: true }];
    const ownerHtml = dashboardPage();
    assert.match(ownerHtml, /data-action="new-member"/);
  });

  test('BUG-07: GET /clubs/:id/members?sort=created_at (dùng cho Dashboard "Thành viên mới nhất") phải sắp xếp theo ngày tạo mới nhất', async () => {
    const supabase = createMockSupabase({
      player_profiles: [
        { id: 1, club_id: 1, full_name: 'An Cũ Nhất', created_at: '2026-01-01T00:00:00Z', status: 'active' },
        { id: 2, club_id: 1, full_name: 'Zũng Mới Nhất', created_at: '2026-11-25T00:00:00Z', status: 'active' },
        { id: 3, club_id: 1, full_name: 'Bình Giữa', created_at: '2026-06-01T00:00:00Z', status: 'active' },
      ],
      club_members: [],
      teams: [],
      team_players: [],
    });
    const api = createSupabaseApiClient({ client: supabase });
    const res = await api.get('/clubs/1/members?per_page=5&sort=created_at');
    assert.equal(
      res.data[0].full_name,
      'Zũng Mới Nhất',
      'roster-service.js bỏ qua tham số sort=created_at nên Dashboard "Những thành viên mới nhất" không hiển thị người mới nhất',
    );
  });

  test('BUG-08: Dashboard phải giữ số áo thật của thành viên thay vì ghi đè jersey_number: null', () => {
    const appSrc = readText('frontend/src/app.js');
    assert.doesNotMatch(
      appSrc,
      /jersey_number:\s*null/,
      'app.js:933 ghi đè jersey_number: null khi nạp Dashboard nên cột Số áo luôn hiển thị "—"',
    );
  });
});

// ============================================================================
// 5. NHÂN SỰ, THÀNH VIÊN & ĐỘI BÓNG
// ============================================================================
describe('5. Quản lý Thành viên CLB & Đội bóng (Roster & Teams)', () => {
  test('BUG-09: Tìm kiếm ở danh sách Thành viên CLB (GET /members?q=...) phải hỗ trợ tiếng Việt không dấu', async () => {
    const supabase = createMockSupabase({
      player_profiles: [
        { id: 1, club_id: 1, full_name: 'Nguyễn Chí Bảo', email: 'bao@fcms.vn', status: 'active' },
        { id: 2, club_id: 1, full_name: 'Trần Văn Nam', email: 'nam@fcms.vn', status: 'active' },
      ],
      club_members: [],
      teams: [],
      team_players: [],
    });
    const api = createSupabaseApiClient({ client: supabase });
    const res = await api.get('/clubs/1/members?q=nguyen%20chi%20bao');
    assert.equal(
      res.data.length,
      1,
      'roster-service.js dùng .toLowerCase().includes(q) thay vì matchesSearch() nên gõ "nguyen chi bao" không tìm ra "Nguyễn Chí Bảo"',
    );
  });

  test('BUG-10: Thành viên thường (member) mở trang Thành viên CLB không được tự động gọi INSERT vào player_profiles (gây lỗi 403 RLS)', async () => {
    const spies = { inserts: [] };
    const supabase = createMockSupabase(
      {
        player_profiles: [],
        club_members: [
          { id: 1, club_id: 1, user_id: 'u-current', role: 'member', status: 'active', profiles: { name: 'Thành Viên A', email: 'a@fcms.vn' } },
          { id: 2, club_id: 1, user_id: 'u-other', role: 'member', status: 'active', profiles: { name: 'Thành Viên B', email: 'b@fcms.vn' } },
        ],
        teams: [],
        team_players: [],
      },
      {},
      spies,
    );
    const api = createSupabaseApiClient({ client: supabase });
    await api.get('/clubs/1/members');
    const profileInserts = spies.inserts.filter((i) => i.table === 'player_profiles');
    assert.equal(
      profileInserts.length,
      0,
      'roster-service.js cố gọi INSERT player_profiles ngay cả khi người xem là thành viên thường không có quyền ghi (gây 403 network/console error)',
    );
  });
});

// ============================================================================
// 6. ĐÓNG QUỸ (DUES) & QUY TẮC TÍNH RIÊNG TỪNG ĐỘI
// ============================================================================
describe('6. Đóng quỹ (Dues) & Tách riêng theo từng đội', () => {
  test('dues-page không còn cột "Tổng các đội trong tháng" và hiển thị đúng nút ghi đóng riêng theo từng đội', () => {
    state.clubId = 1;
    state.clubs = [{ id: 1, name: 'FC Test', membership_role: 'treasurer', can_view_finance: true, can_manage_finance: true, maintenance_fee: 50000 }];
    state.duesMonth = '2026-11';
    state.duesSearch = '';
    state.duesTeam = '';
    state.duesStatus = '';
    state.teams = [{ id: 10, name: 'Futsal Đội Lớn' }, { id: 11, name: 'UIT Sân 11' }];
    state.dues = [
      {
        player_id: 1,
        name: 'Nguyễn Chí Bảo',
        date_of_birth: '2005-06-17',
        email: null,
        total_amount: 300000,
        teams: [
          { team_id: 10, name: 'Futsal Đội Lớn', amount: 150000, status: 'paid', cumulative_debt: 0 },
          { team_id: 11, name: 'UIT Sân 11', amount: 150000, status: 'unpaid', cumulative_debt: 150000 },
        ],
      },
    ];
    const html = duesPage();
    assert.doesNotMatch(html, /Tổng các đội trong tháng/i);
    assert.match(html, /17\/06\/2005/);
    assert.match(html, /data-action="record-dues"[^>]*data-team="10"/);
    assert.match(html, /data-action="record-dues"[^>]*data-team="11"/);
  });

  test('dues-service truyền p_team_id khi gọi RPC record_player_dues và SQL tách riêng từng đội', async () => {
    const spies = { rpcs: [] };
    const supabase = createMockSupabase({}, {
      record_player_dues: () => ({ data: { recorded: 1 }, error: null }),
    }, spies);
    const api = createSupabaseApiClient({ client: supabase });
    await api.post('/clubs/1/dues', {
      player_id: 5,
      team_id: 10,
      month: '2026-11',
      months: 1,
      status: 'paid',
    });
    assert.equal(spies.rpcs.length, 1);
    assert.equal(spies.rpcs[0].name, 'record_player_dues');
    assert.equal(spies.rpcs[0].params.p_team_id, 10);

    const fn = getLatestSqlFunction('record_player_dues');
    assert.ok(fn && fn.body.includes('p_team_id bigint default null'));
    assert.match(fn.body, /where p_team_id is null or s\.t_id = p_team_id/);
  });

  test('BUG-11: Ô tìm thành viên ở trang Đóng quỹ phải hỗ trợ gõ tiếng Việt không dấu ("chi bao" tìm ra "Nguyễn Chí Bảo")', () => {
    state.clubId = 1;
    state.clubs = [{ id: 1, name: 'FC Test', membership_role: 'treasurer', can_view_finance: true, can_manage_finance: true }];
    state.duesMonth = '2026-11';
    state.duesSearch = 'chi bao';
    state.duesTeam = '';
    state.duesStatus = '';
    state.dues = [
      {
        player_id: 1,
        name: 'Nguyễn Chí Bảo',
        teams: [{ team_id: 10, name: 'Futsal', amount: 150000, status: 'unpaid', cumulative_debt: 150000 }],
      },
    ];
    const html = duesPage();
    state.duesSearch = '';
    assert.match(
      html,
      /Nguyễn Chí Bảo/,
      'dues-page.js:35-39 dùng .toLocaleLowerCase("vi").includes() thay vì matchesSearch() nên gõ không dấu "chi bao" trả về rỗng',
    );
  });

  test('BUG-12: Cập nhật mức quỹ đội phải chặn tháng quá khứ theo đúng quy tắc "trước ngày 3" đã thông báo trên UI', async () => {
    const supabase = createMockSupabase({ teams: [{ id: 10, club_id: 1, name: 'Futsal' }] });
    const api = createSupabaseApiClient({ client: supabase });
    await assert.rejects(
      () => api.post('/clubs/1/teams/10/dues-rate', { amount: 200000, effective_month: '2020-01' }),
      /tháng|hiệu lực|ngày 3|hợp lệ/i,
      'dues-service.js cho phép upsert mức quỹ cho cả tháng quá khứ (2020-01) mà không kiểm tra quy tắc trước ngày 3 đã ghi trên UI',
    );
  });
});

// ============================================================================
// 7. SỔ THU CHI (FINANCE), SO SÁNH KỲ TRƯỚC, ĐẢO BÚT TOÁN & KHÓA KỲ
// ============================================================================
describe('7. Sổ thu chi, So sánh kỳ trước, Đảo bút toán & Khóa kỳ', () => {
  test('finance-page hiển thị đầy đủ nút Đảo bút toán, Khóa kỳ kế toán và định dạng ngày dd/mm/yyyy', () => {
    state.clubId = 1;
    state.clubs = [{ id: 1, name: 'FC Test', membership_role: 'treasurer', can_view_finance: true, can_manage_finance: true }];
    state.finance = {
      data: [
        {
          id: 99,
          occurred_on: '2026-11-20',
          type: 'expense',
          category: 'Tiền sân',
          description: 'Sân 7 tối thứ 6',
          amount: 500000,
          status: 'posted',
          receipt_version: null,
        },
      ],
      meta: { total: 1, current_page: 1, last_page: 1 },
      summary: { income: 1000000, expense: 500000, balance: 500000, change: 200000 },
    };
    state.plannedExpenses = [];
    const html = financePage();
    assert.match(html, /20\/11\/2026/);
    assert.match(html, /data-action="reverse-finance"/);
    assert.match(html, /data-action="manage-finance-periods"/);
  });

  test('BUG-13: SQL finance_ledger_page & finance-service phải tính summary.change thật thay vì hardcode null', () => {
    const fn = getLatestSqlFunction('finance_ledger_page');
    assert.ok(fn, 'Tìm thấy hàm SQL finance_ledger_page');
    const financeSvcSrc = readText('frontend/src/services/finance-service.js');
    const sqlHardcodesNull = /'change'\s*,\s*null/i.test(fn.body);
    const serviceComputesChange = /summary\.change\s*=/.test(financeSvcSrc);
    assert.ok(
      !sqlHardcodesNull || serviceComputesChange,
      'finance_ledger_page hardcode summary.change = null và finance-service.js không tính lại nên thẻ KPI "Chênh lệch so với tháng/năm trước" luôn hiển thị "—"',
    );
  });
});

// ============================================================================
// 8. ĐIỂM DANH ĐỘC LẬP & LỊCH TẬP (ATTENDANCE)
// ============================================================================
describe('8. Điểm danh (Tách riêng) & Lịch tập', () => {
  test('Thành viên thường chỉ được xem trang Điểm danh, không thấy nút thêm/sửa/xóa/bấm điểm danh; người được cấp quyền thấy đầy đủ', () => {
    state.clubId = 1;
    state.trainingFilterDate = '';
    state.trainingFilterTeam = '';
    state.trainingSort = 'asc';
    state.teams = [{ id: 10, name: 'Futsal' }];
    state.activities = {
      celebrations: [],
      birthdays: [],
      awards: [],
      players: [],
      trainings: [
        {
          id: 5,
          team_id: 10,
          team_name: 'Futsal',
          training_date: '2026-11-25',
          training_time: '19:00',
          location: 'Sân KTX',
          attendance: [{ player_id: 1, status: 'present' }],
          approval_status: 'approved',
          training_status: 'scheduled',
        },
      ],
    };

    state.clubs = [{ id: 1, name: 'FC Test', membership_role: 'member', can_manage_attendance: false }];
    const readonlyHtml = attendancePage();
    assert.match(readonlyHtml, /25\/11\/2026/);
    assert.doesNotMatch(readonlyHtml, /data-action="new-training"/);
    assert.doesNotMatch(readonlyHtml, /data-action="edit-activity"/);
    assert.doesNotMatch(readonlyHtml, /data-action="delete-activity"/);
    assert.doesNotMatch(readonlyHtml, /data-action="attendance"/);

    state.clubs = [{ id: 1, name: 'FC Test', membership_role: 'member', can_manage_attendance: true }];
    const managerHtml = attendancePage();
    assert.match(managerHtml, /data-action="new-training"/);
    assert.match(managerHtml, /data-action="edit-activity"/);
    assert.match(managerHtml, /data-action="attendance"/);
  });

  test('SQL migration 20261125000003 đã tách RLS team_trainings (đọc: is_active_member, ghi: can_manage_attendance)', () => {
    const sql = readText('supabase/migrations/20261125000003_separate_attendance_and_role_permissions.sql');
    assert.match(sql, /create policy trainings_read on public\.team_trainings[\s\S]*is_active_member/);
    assert.match(sql, /create policy trainings_write on public\.team_trainings[\s\S]*can_manage_attendance/);
    assert.match(sql, /save_training_attendance[\s\S]*can_manage_attendance/);
  });
});

// ============================================================================
// 9. HOẠT ĐỘNG CLB (TRUYỀN THÔNG / ĐỐI NGOẠI), NGÀY LỄ, SINH NHẬT & VINH DANH
// ============================================================================
describe('9. Hoạt động CLB (Ngày lễ, Sinh nhật, Vinh danh)', () => {
  test('Thành viên thường bị chặn xem Hoạt động CLB; Truyền thông & Đối ngoại được quản lý đầy đủ', () => {
    state.clubId = 1;
    state.activities = { celebrations: [], birthdays: [], trainings: [], awards: [], players: [] };
    state.clubs = [{ id: 1, name: 'FC Test', membership_role: 'member', can_view_activities: false, can_manage_activities: false }];
    assert.match(activitiesPage(), /Quyền truy cập được bảo vệ/i);

    state.clubs = [{ id: 1, name: 'FC Test', membership_role: 'member', title: 'Truyền thông', can_view_activities: true, can_manage_activities: true }];
    const html = activitiesPage();
    assert.match(html, /data-action="new-celebration"/);
    assert.match(html, /data-action="new-award"/);
  });

  test('BUG-14: Ô tìm thành viên trong dialog Vinh danh và Điểm danh (activities.js) phải hỗ trợ gõ tiếng Việt không dấu', () => {
    const actSrc = readText('frontend/src/activities.js');
    assert.doesNotMatch(
      actSrc,
      /\.toLocaleLowerCase\('vi'\)/,
      'activities.js:201,428 dùng .toLocaleLowerCase("vi") thay vì matchesSearch() nên gõ không dấu trong dialog Vinh danh & Điểm danh không ra kết quả',
    );
  });
});

// ============================================================================
// 10. BAN CHỦ NHIỆM (BOARD) & CÔNG VIỆC BCN
// ============================================================================
describe('10. Ban chủ nhiệm & Công việc BCN', () => {
  test('board-page hiển thị phân quyền chi tiết cho Chủ nhiệm / Phó chủ nhiệm', () => {
    state.clubId = 1;
    state.clubs = [{ id: 1, name: 'FC Test', membership_role: 'co_owner', is_co_owner: true, can_manage_club: true }];
    state.boardMembers = [];
    state.boardSharedRates = [];
    state.clubMemberships = [
      { id: 1, user_id: 'u1', name: 'Thành Viên A', email: 'a@fcms.vn', role: 'member', title: 'Thành viên', status: 'active' },
    ];
    state.clubInvitations = [];
    const html = boardPage();
    assert.match(html, /data-action="edit-permissions"/);
    assert.match(html, /data-action="invite"/);
  });

  test('BUG-15: Chức năng Công việc BCN (board-tasks) đã code ở controller & service nhưng chưa được gắn giao diện trên board-page.js', () => {
    const boardCtrlSrc = readText('frontend/src/controllers/board-controller.js');
    const boardPageSrc = readText('frontend/src/views/board-page.js');
    assert.match(boardCtrlSrc, /board-task-new/);
    assert.match(
      boardPageSrc,
      /board-task-new/,
      'board-controller.js và board-service.js có đầy đủ CRUD board-tasks nhưng board-page.js không render khu vực Công việc BCN (dead code)',
    );
  });
});

// ============================================================================
// 11. KHO TRANG BỊ & BÁO HỎNG / MẤT TÀI SẢN
// ============================================================================
describe('11. Kho trang bị & Báo hỏng / mất tài sản', () => {
  test('SQL có đầy đủ RPC báo hỏng/mất và báo cáo sự cố kho (20261125000004)', () => {
    assert.ok(getLatestSqlFunction('report_inventory_assignment_incident'));
    assert.ok(getLatestSqlFunction('get_inventory_incidents_report'));
    assert.ok(getLatestSqlFunction('record_inventory_movement'));
  });

  test('BUG-16: GET /clubs/:id/inventory/members phải trả về team_labels để hộp thoại Cấp phát không luôn hiện "Chưa xếp đội"', async () => {
    const supabase = createMockSupabase({
      player_profiles: [{ id: 1, club_id: 1, full_name: 'Cầu Thủ A', status: 'active' }],
      teams: [{ id: 10, club_id: 1, name: 'Đội 1' }],
      team_players: [{ team_id: 10, player_id: 1, club_id: 1 }],
    });
    const api = createSupabaseApiClient({ client: supabase });
    const res = await api.get('/clubs/1/inventory/members');
    assert.ok(
      Array.isArray(res.data[0].team_labels) && res.data[0].team_labels.includes('Đội 1'),
      'inventory-service.js không trả về team_labels trong /inventory/members nên inventory.js luôn hiển thị "Chưa xếp đội" cho mọi thành viên',
    );
  });
});

// ============================================================================
// 12. LỊCH TRẬN ĐẤU, ĐỘI HÌNH CHIẾN THUẬT & CHIA TIỀN SÂN
// ============================================================================
describe('12. Lịch trận đấu, Đội hình chiến thuật & Chia tiền sân', () => {
  test('calendarRange tính đúng khung tuần/tháng và matchesPage render chuẩn dd/mm/yyyy', () => {
    const wk = calendarRange('week', '2026-11', '2026-11-25');
    assert.equal(wk.from, '2026-11-23');
    assert.equal(wk.to, '2026-11-29');

    state.clubId = 1;
    state.clubs = [{ id: 1, name: 'FC Test', membership_role: 'owner', can_manage_roster: true }];
    state.matchesView = 'list';
    state.matchesMonth = '2026-11';
    state.matchesWeek = '2026-11-25';
    state.matches = {
      data: [{ id: 1, match_date: '2026-11-25', start_time: '19:30', opponent: 'FC Bạn', team_name: 'Đội 1', match_type: 'friendly', status: 'scheduled' }],
      meta: { total: 1, current_page: 1, last_page: 1 },
    };
    const html = matchesPage();
    assert.match(html, /25\/11\/2026/);
    assert.match(html, /data-action="match-lineup"/);
  });

  test('lineups.js hỗ trợ thao tác cảm ứng trên điện thoại (pointer events / touch)', () => {
    const src = readText('frontend/src/lineups.js');
    assert.match(src, /pointerdown|touchstart/);
  });
});

// ============================================================================
// 13. DỌN BỎ BIỂU QUYẾT (POLLS) KHỎI FRONTEND & DB
// ============================================================================
describe('13. Đã gỡ bỏ hoàn toàn Biểu quyết (Polls) khỏi Frontend & DB', () => {
  test('Không còn file polls frontend và migration 20261125000006 đã xóa 4 bảng club_polls*', () => {
    assert.equal(fs.existsSync(path.join(ROOT, 'frontend/src/polls-page.js')), false);
    assert.equal(fs.existsSync(path.join(ROOT, 'frontend/src/controllers/poll-controller.js')), false);
    assert.equal(fs.existsSync(path.join(ROOT, 'frontend/src/services/poll-service.js')), false);
    const mig = readText('supabase/migrations/20261125000006_fix_audit_bugs_and_drop_unused_tables.sql');
    assert.match(mig, /drop table if exists public\.club_polls cascade/i);
    assert.match(mig, /drop table if exists public\.club_poll_votes cascade/i);
    assert.match(mig, /drop table if exists public\.club_poll_options cascade/i);
    assert.match(mig, /drop table if exists public\.club_poll_electors cascade/i);
  });
});

// ============================================================================
// 14. DỌN BỎ KHÁM PHÁ & LỜI MỜI GIAO HỮU KHỎI FRONTEND & DB
// ============================================================================
describe('14. Đã gỡ bỏ hoàn toàn Lời mời giao hữu & Khám phá khỏi Frontend & DB', () => {
  test('Không còn file discovery/friendlies và migration 20261125000006 đã xóa bảng friendly_invitations', () => {
    assert.equal(fs.existsSync(path.join(ROOT, 'frontend/src/discovery-page.js')), false);
    assert.equal(fs.existsSync(path.join(ROOT, 'frontend/src/controllers/discovery-controller.js')), false);
    const clubSvc = readText('frontend/src/services/club-service.js');
    assert.doesNotMatch(clubSvc, /\/friendlies|\/discover\/clubs|\/public-settings/);
    const mig = readText('supabase/migrations/20261125000006_fix_audit_bugs_and_drop_unused_tables.sql');
    assert.match(mig, /drop table if exists public\.friendly_invitations cascade/i);
    assert.match(mig, /drop table if exists public\.club_public_settings cascade/i);
  });
});

// ============================================================================
// 15. TUYỂN QUÂN (RECRUITMENT)
// ============================================================================
describe('15. Tuyển quân & Chuyển ứng viên thành thành viên', () => {
  test('SQL có RPC promote_recruitment_application và recruitment.js gọi đúng endpoint /promote', () => {
    assert.ok(getLatestSqlFunction('promote_recruitment_application'));
    const recUiSrc = readText('frontend/src/recruitment.js');
    assert.match(recUiSrc, /\/promote/);
  });
});

// ============================================================================
// 16. DỌN BỎ CÁC BẢNG & MODULE DƯ THỪA (TÀI TRỢ, KỶ LUẬT, MÙA GIẢI, SỰ KIỆN, TÀI LIỆU)
// ============================================================================
describe('16. Đã gỡ bỏ các module & bảng không dùng để tối ưu dung lượng DB', () => {
  test('Không còn file sponsorship/discipline thừa và migration 20261125000006 đã xóa các bảng không sử dụng', () => {
    assert.equal(fs.existsSync(path.join(ROOT, 'frontend/src/sponsorship-page.js')), false);
    assert.equal(fs.existsSync(path.join(ROOT, 'frontend/src/services/sponsorship-service.js')), false);
    assert.equal(fs.existsSync(path.join(ROOT, 'frontend/src/discipline-page.js')), false);
    assert.equal(fs.existsSync(path.join(ROOT, 'frontend/src/services/discipline-service.js')), false);
    const mig = readText('supabase/migrations/20261125000006_fix_audit_bugs_and_drop_unused_tables.sql');
    assert.match(mig, /drop table if exists public\.sponsorships cascade/i);
    assert.match(mig, /drop table if exists public\.sponsors cascade/i);
    assert.match(mig, /drop table if exists public\.discipline_cases cascade/i);
    assert.match(mig, /drop table if exists public\.seasons cascade/i);
    assert.match(mig, /drop table if exists public\.club_events cascade/i);
    assert.match(mig, /drop table if exists public\.club_documents cascade/i);
  });
});

// ============================================================================
// 17. THÔNG BÁO TỰ ĐỘNG & CỔNG QUẢN TRỊ HỆ THỐNG (ADMIN PORTAL)
// ============================================================================
describe('17. Thông báo tự động & Cổng Quản trị hệ thống', () => {
  test('SQL có RPC thông báo tự động (get_my_club_notifications, mark_club_notifications_read) và Admin Portal có đủ 3 tab', () => {
    assert.ok(getLatestSqlFunction('get_my_club_notifications'));
    assert.ok(getLatestSqlFunction('mark_club_notifications_read'));
    const adminSrc = readText('frontend/src/views/admin-page.js');
    assert.match(adminSrc, /data-tab="overview"/);
    assert.match(adminSrc, /data-tab="clubs"/);
    assert.match(adminSrc, /data-tab="users"/);
    assert.match(adminSrc, /admin-toggle-user-active/);
    assert.match(adminSrc, /admin-toggle-user-admin/);
    assert.match(adminSrc, /admin-toggle-club/);
  });
});

// ============================================================================
// 18. GIAO DIỆN DI ĐỘNG (MOBILE UX) & PWA
// ============================================================================
describe('18. Giao diện di động (Mobile UX), Sidebar thu gọn & PWA', () => {
  test('index.html có meta PWA và styles.css có responsive mobile drawer + anti-iOS-zoom 16px', () => {
    const html = readText('frontend/index.html');
    const css = readText('frontend/src/styles.css');
    assert.match(html, /viewport-fit=cover/);
    assert.match(html, /apple-mobile-web-app-capable/);
    assert.match(css, /@media\s*\(max-width:\s*760px\)/);
    assert.match(css, /font-size:\s*16px/);
    assert.match(css, /mobile-menu-open/);
    assert.match(css, /sidebar-collapsed/);
  });
});
