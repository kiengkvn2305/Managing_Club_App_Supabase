import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { currentAcademicYear, statusLabel } from '../src/utils.js';
import { duesPage } from '../src/dues-page.js';
import { state } from '../src/state.js';
import { parseMembers, buildMembersWorkbook } from '../src/spreadsheets.js';
import { createDuesService } from '../src/services/dues-service.js';
import { createRosterService } from '../src/services/roster-service.js';

test('currentAcademicYear accurately calculates school year for Sept-May cycle', () => {
  // Month is 0-indexed in Date (0 = Jan, 4 = May, 8 = Sept, 11 = Dec)
  assert.equal(currentAcademicYear(new Date(2026, 4, 15)), '2025-2026'); // May 2026 -> 2025-2026
  assert.equal(currentAcademicYear(new Date(2025, 8, 1)), '2025-2026');  // Sept 2025 -> 2025-2026
  assert.equal(currentAcademicYear(new Date(2025, 11, 31)), '2025-2026'); // Dec 2025 -> 2025-2026
  assert.equal(currentAcademicYear(new Date(2026, 0, 10)), '2025-2026'); // Jan 2026 -> 2025-2026
  assert.equal(currentAcademicYear(new Date(2026, 7, 20)), '2025-2026'); // Aug 2026 -> 2025-2026
  assert.equal(currentAcademicYear(new Date(2026, 8, 1)), '2026-2027');  // Sept 2026 -> 2026-2027
});

test('statusLabel correctly translates graduated and inactive statuses', () => {
  assert.equal(statusLabel('graduated'), 'Đã ra trường');
  assert.equal(statusLabel('inactive'), 'Tạm ngưng');
  assert.equal(statusLabel('active'), 'Đang hoạt động');
  assert.equal(statusLabel('injured'), 'Chấn thương');
});

test('duesPage displays maintenance fee settings, amount, and suspended badges', () => {
  Object.assign(state, {
    clubs: [{
      id: 1,
      membership_role: 'owner',
      can_view_finance: true,
      can_manage_finance: true,
      maintenance_fee: 75000,
    }],
    clubId: 1,
    duesMonth: '2026-05',
    duesSearch: '',
    duesTeam: '',
    duesStatus: '',
    duesDirection: 'asc',
    teams: [{ id: 10, name: 'Đội 1' }],
    dues: [
      {
        player_id: 101,
        name: 'Trần Bình',
        date_of_birth: '2001-05-10',
        email: 'binh@test.com',
        notes: '',
        status: 'inactive',
        total: 75000,
        teams: [
          {
            team_id: 10,
            name: 'Đội 1',
            amount: 75000,
            status: 'debt',
            is_maintenance: true,
          },
        ],
      },
    ],
  });

  const html = duesPage();
  assert.match(html, /Cài đặt phí duy trì/);
  assert.match(html, /75\.000 đ\/tháng/);
  assert.match(html, /Trần Bình/);
  assert.match(html, />Tạm ngưng<\/span>/);
  assert.match(html, />\(Phí duy trì\)<\/div>/);
  assert.doesNotMatch(html, /Tổng các đội trong tháng/);
  assert.match(html, /data-action="record-dues" data-id="101" data-team="10"/);
});

test('duesService passes p_team_id when recording dues for a specific team', async () => {
  let captured = null;
  const duesService = createDuesService({
    supabase: {
      async rpc(fn, args) {
        captured = { fn, args };
        return { data: { player_id: args.p_player_id, team_id: args.p_team_id, amount: 150000 }, error: null };
      },
    },
  });

  const res = await duesService.handleDuesRequest(
    '/clubs/1/dues',
    'POST',
    {
      player_id: 55,
      team_id: 12,
      month: '2026-11',
      months: 1,
      status: 'paid',
      idempotency_key: '11111111-1111-4111-8111-111111111111',
    },
    new URLSearchParams(),
    1
  );

  assert.equal(captured.fn, 'record_player_dues');
  assert.equal(captured.args.p_team_id, 12);
  assert.equal(res.data.team_id, 12);
});

test('parseMembers supports 8-column format and buildMembersWorkbook exports club activity_start_date', async () => {
  const headers = ['full_name', 'email', 'phone', 'date_of_birth', 'position', 'preferred_foot', 'status', 'notes'];
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet('Thanh vien');
  sheet.addRow(headers);
  sheet.addRow(['Lê Cường', 'cuong@test.com', '0901234567', '2002-03-15', 'PIVOT', 'left', 'graduated', 'Đã tốt nghiệp']);
  const buf = await book.xlsx.writeBuffer();
  const file = { name: 'members.xlsx', size: buf.byteLength, arrayBuffer: async () => buf };

  const parsed = await parseMembers(file);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].full_name, 'Lê Cường');
  assert.equal(parsed[0].status, 'graduated');

  // Test buildMembersWorkbook exports activity_start_date
  const exportBook = await buildMembersWorkbook(parsed, '', { activity_start_date: '2025-09-01' });
  const exportSheet = exportBook.worksheets[0];
  const row1 = exportSheet.getRow(1).values.slice(1);
  assert.ok(row1.includes('Ngày bắt đầu hoạt động CLB'));
  const row2 = exportSheet.getRow(2);
  assert.equal(row2.getCell(row1.length).value, '01/09/2025');
});

test('duesService charges maintenance fee for inactive members and skips graduated members', async () => {
  const mockSupabase = {
    from(table) {
      return {
        select() {
          return this;
        },
        eq() {
          return this;
        },
        in() {
          return this;
        },
        not() {
          return this;
        },
        lte() {
          return this;
        },
        order() {
          return this;
        },
        is() {
          return this;
        },
        async maybeSingle() {
          if (table === 'clubs') {
            return { data: { maintenance_fee: 60000 }, error: null };
          }
          return { data: null, error: null };
        },
        then(resolve) {
          if (table === 'team_dues_entries') {
            resolve({ data: [], error: null });
          } else if (table === 'team_players') {
            resolve({
              data: [
                {
                  team_id: 1,
                  player_id: 201,
                  player: { id: 201, full_name: 'Người Active', status: 'active' },
                  team: { id: 1, name: 'Đội A' },
                },
                {
                  team_id: 1,
                  player_id: 202,
                  player: { id: 202, full_name: 'Người Inactive', status: 'inactive' },
                  team: { id: 1, name: 'Đội A' },
                },
                {
                  team_id: 1,
                  player_id: 203,
                  player: { id: 203, full_name: 'Người Graduated', status: 'graduated' },
                  team: { id: 1, name: 'Đội A' },
                },
              ],
              error: null,
            });
          } else if (table === 'player_profiles') {
            resolve({ data: [], error: null });
          } else if (table === 'teams') {
            resolve({ data: [{ id: 1, name: 'Đội A' }], error: null });
          } else if (table === 'team_dues_rates') {
            resolve({
              data: [{ team_id: 1, effective_month: '2026-01-01', amount: 150000 }],
              error: null,
            });
          } else if (table === 'club_board_members') {
            resolve({ data: [], error: null });
          } else if (table === 'shared_board_dues_rates') {
            resolve({ data: [], error: null });
          } else if (table === 'board_dues_rates') {
            resolve({ data: [], error: null });
          } else {
            resolve({ data: [], error: null });
          }
        },
      };
    },
  };

  const duesService = createDuesService({ supabase: mockSupabase });
  const result = await duesService.getDues(1, new URLSearchParams('month=2026-05'));
  const rows = result.data;

  // Active member pays standard rate (150,000)
  const active = rows.find((r) => r.player_id === 201);
  assert.ok(active);
  assert.equal(active.total, 150000);
  assert.equal(active.teams[0].amount, 150000);
  assert.equal(active.teams[0].is_maintenance, false);

  // Inactive member pays maintenance fee (60,000)
  const inactive = rows.find((r) => r.player_id === 202);
  assert.ok(inactive);
  assert.equal(inactive.total, 60000);
  assert.equal(inactive.teams[0].amount, 60000);
  assert.equal(inactive.teams[0].is_maintenance, true);

  // Graduated member is NOT charged dues
  const graduated = rows.find((r) => r.player_id === 203);
  assert.equal(graduated, undefined);
});

test('rosterService filters members without academic_year requirement', async () => {
  const mockMembers = [
    { id: 1, full_name: 'SV Năm 1', status: 'active', team_players: [] },
    { id: 2, full_name: 'SV Năm 2', status: 'inactive', team_players: [] },
    { id: 3, full_name: 'SV Năm 3', status: 'graduated', team_players: [] },
  ];

  const mockSupabase = {
    from() {
      return {
        select() {
          return this;
        },
        eq() {
          return this;
        },
        order() {
          return this;
        },
        range() {
          return this;
        },
        then(resolve) {
          resolve({ data: mockMembers, count: mockMembers.length, error: null });
        },
      };
    },
  };

  const rosterService = createRosterService({ supabase: mockSupabase });
  const res = await rosterService.members(1, new URLSearchParams('status=active'));
  assert.equal(res.data.length, 1);
  assert.equal(res.data[0].full_name, 'SV Năm 1');
});
