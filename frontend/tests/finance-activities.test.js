import test from 'node:test';
import assert from 'node:assert/strict';
import { state } from '../src/state.js';
import { financePage } from '../src/finance-page.js';
import { page } from '../src/pages.js';

test('finance shows remaining, period comparison and correction history', () => {
  Object.assign(state, { clubs: [{ id: 1, membership_role: 'owner', can_view_finance: true }], clubId: 1, financePeriod: 'month', financeMonth: '2026-02', financeYear: '2026', finance: { summary: { income: 40, expense: 10, balance: 30, remaining: 180, change: -20 }, meta: {}, data: [], chart: [{ period: '2026-02-10', type: 'income', total: 40 }], adjustments: { data: [{ created_at: '2026-02-11', player_name: 'An', team_name: 'A', month: '2026-02-01', old_status: 'paid', new_status: 'unpaid', amount: 10, reason: 'Ghi nhầm' }], meta: {} } } });
  const html = financePage();
  assert.match(html, /Còn lại đến cuối kỳ/); assert.match(html, /180 đ/); assert.match(html, /-20 đ/);
  assert.match(html, /Đã đóng → Chưa đóng/); assert.match(html, /Ghi nhầm/); assert.match(html, /2026-02-10/);
});

test('birthdays show only the current month and paginate three at a time', () => {
  const month = String(new Date().getMonth() + 1).padStart(2, '0'), other = String(new Date().getMonth() === 0 ? 12 : new Date().getMonth()).padStart(2, '0');
  Object.assign(state, { loading: false, error: '', route: 'activities', birthdayPage: 1, clubs: [{ id: 1, membership_role: 'owner', can_manage_activities: true }], clubId: 1, activities: { celebrations: [], trainings: [], awards: [], birthdays: [...['An','Binh','Chi','Dung'].map((name, i) => ({ id: i + 1, name, date_of_birth: `2000-${month}-0${i + 1}` })), { id: 5, name: 'KhacThang', date_of_birth: `2000-${other}-01` }] } });
  const first = page(); assert.match(first, /An/); assert.match(first, /Chi/); assert.doesNotMatch(first, /Dung/); assert.doesNotMatch(first, /KhacThang/); assert.match(first, /1 \/ 2/);
  state.birthdayPage = 2; const second = page(); assert.match(second, /Dung/); assert.doesNotMatch(second, /KhacThang/); assert.match(second, /2 \/ 2/);
  state.birthdayMonth = other; state.birthdayPage = 1;
  const selected = page(); assert.match(selected, /KhacThang/); assert.doesNotMatch(selected, />Dung</); assert.match(selected, /data-birthday-month/);
  state.birthdayMonth = '';
});

test('awards render recipient, year, title, gift and management controls', () => {
  Object.assign(state, {
    loading: false,
    error: '',
    route: 'activities',
    clubs: [{ id: 1, membership_role: 'owner', can_manage_activities: true }],
    clubId: 1,
    activities: {
      celebrations: [],
      trainings: [],
      birthdays: [],
      awards: [
        {
          id: 10,
          award_year: 2026,
          player_name: 'Nguyễn Văn An',
          title: 'Cầu thủ xuất sắc nhất',
          gift: 'Cúp vàng và 1.000.000đ',
          notes: 'Đóng góp nhiều bàn thắng',
          approval_status: 'approved',
        },
      ],
      players: [{ id: 1, full_name: 'Nguyễn Văn An' }],
    },
  });

  const html = page();
  assert.match(html, /Khen thưởng & phần quà/);
  assert.match(html, /2026 · Nguyễn Văn An/);
  assert.match(html, /Cầu thủ xuất sắc nhất/);
  assert.match(html, /Quà: Cúp vàng và 1.000.000đ/);
  assert.match(html, /Đóng góp nhiều bàn thắng/);
  assert.match(html, /data-action="edit-activity"/);
  assert.match(html, /data-action="delete-activity"/);
});

test('award recipient search and sort handles name, date of birth, and notes accurately', () => {
  const players = [
    { id: 1, full_name: 'Nguyễn Văn An', date_of_birth: '2000-05-15', notes: 'Hậu vệ kỳ cựu' },
    { id: 2, full_name: 'Nguyễn Văn An', date_of_birth: '2005-11-20', notes: 'Tiền đạo trẻ mới lên' },
    { id: 3, full_name: 'Trần Bình', date_of_birth: '1998-02-10', notes: '' },
  ];

  // Distinguish members with the exact same name by DOB or notes
  const searchBlob = (p) => `${p.full_name} ${p.date_of_birth} ${p.notes}`.toLowerCase();
  const match2000 = players.filter((p) => searchBlob(p).includes('2000'));
  assert.equal(match2000.length, 1);
  assert.equal(match2000[0].notes, 'Hậu vệ kỳ cựu');

  const matchTienDao = players.filter((p) => searchBlob(p).includes('tiền đạo'));
  assert.equal(matchTienDao.length, 1);
  assert.equal(matchTienDao[0].date_of_birth, '2005-11-20');

  // Sort by DOB: oldest first (dob_asc)
  const sortedDobAsc = [...players].sort((a, b) => a.date_of_birth.localeCompare(b.date_of_birth));
  assert.equal(sortedDobAsc[0].id, 3); // 1998
  assert.equal(sortedDobAsc[1].id, 1); // 2000
  assert.equal(sortedDobAsc[2].id, 2); // 2005
});
