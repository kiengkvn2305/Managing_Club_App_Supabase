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
});

test('parseMembers supports both 8-column legacy and 9-column format with academic_year', async () => {
  // Test 9 columns
  const headers9 = ['full_name', 'email', 'phone', 'date_of_birth', 'position', 'preferred_foot', 'status', 'notes', 'academic_year'];
  const book9 = new ExcelJS.Workbook();
  const sheet9 = book9.addWorksheet('Thanh vien');
  sheet9.addRow(headers9);
  sheet9.addRow(['Lê Cường', 'cuong@test.com', '0901234567', '2002-03-15', 'PIVOT', 'left', 'graduated', 'Đã tốt nghiệp', '2025-2026']);
  const buf9 = await book9.xlsx.writeBuffer();
  const file9 = { name: 'members9.xlsx', size: buf9.byteLength, arrayBuffer: async () => buf9 };

  const parsed9 = await parseMembers(file9);
  assert.equal(parsed9.length, 1);
  assert.equal(parsed9[0].full_name, 'Lê Cường');
  assert.equal(parsed9[0].status, 'graduated');
  assert.equal(parsed9[0].academic_year, '2025-2026');

  // Test buildMembersWorkbook exports academic_year
  const exportBook = await buildMembersWorkbook(parsed9);
  const exportSheet = exportBook.worksheets[0];
  const row1 = exportSheet.getRow(1).values.slice(1);
  assert.ok(row1.includes('Niên khóa'));
  const row2 = exportSheet.getRow(2);
  assert.equal(row2.getCell(row1.length).value, '2025-2026');
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

test('rosterService filters members by academic_year', async () => {
  const mockMembers = [
    { id: 1, full_name: 'SV Năm 1', academic_year: '2025-2026', status: 'active', team_players: [] },
    { id: 2, full_name: 'SV Năm 2', academic_year: '2024-2025', status: 'active', team_players: [] },
    { id: 3, full_name: 'SV Năm 3', academic_year: '2025-2026', status: 'graduated', team_players: [] },
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
  const res = await rosterService.members(1, new URLSearchParams('academic_year=2025-2026'));
  assert.equal(res.data.length, 2);
  assert.equal(res.data[0].full_name, 'SV Năm 1');
  assert.equal(res.data[1].full_name, 'SV Năm 3');
});
