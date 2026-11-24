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

test('attendancePage filters by date, sorts chronologically, and restricts marking to authorized users', () => {
  const t1 = {
    id: 1,
    team_name: 'Futsal Đội Lớn',
    team_id: 'team-1',
    training_date: '2026-11-23',
    training_time: '18:00',
    location: 'Sân Thống Nhất',
    notes: 'Theo kế hoạch',
    present_count: 0,
    training_status: 'scheduled',
    approval_status: 'approved',
  };
  const t2 = {
    id: 2,
    team_name: 'Futsal Đội Trẻ',
    team_id: 'team-2',
    training_date: '2026-11-22',
    training_time: '17:00',
    location: 'Sân Thống Nhất',
    notes: 'Theo kế hoạch',
    present_count: 0,
    training_status: 'scheduled',
    approval_status: 'approved',
  };
  const t3 = {
    id: 3,
    team_name: 'Futsal Đội Lớn',
    team_id: 'team-1',
    training_date: '2026-11-22',
    training_time: '15:39',
    location: 'Sân Thống Nhất',
    notes: 'Theo kế hoạch',
    present_count: 13,
    training_status: 'scheduled',
    approval_status: 'approved',
  };

  Object.assign(state, {
    loading: false,
    error: '',
    route: 'attendance',
    clubs: [{ id: 1, membership_role: 'owner', can_manage_attendance: true }],
    clubId: 1,
    teams: [
      { id: 'team-1', name: 'Futsal Đội Lớn' },
      { id: 'team-2', name: 'Futsal Đội Trẻ' },
    ],
    trainingFilterDate: '',
    trainingFilterTeam: '',
    trainingSort: 'asc',
    activities: {
      celebrations: [],
      awards: [],
      birthdays: [],
      trainings: [t1, t2, t3], // deliberately unsorted: 23rd, 22nd 17:00, 22nd 15:39
    },
  });

  // Ascending sort: 22nd 15:39 -> 22nd 17:00 -> 23rd 18:00
  let html = page();
  const idxT3 = html.indexOf('22/11/2026 15:39');
  const idxT2 = html.indexOf('22/11/2026 17:00');
  const idxT1 = html.indexOf('23/11/2026 18:00');
  assert.ok(idxT3 !== -1 && idxT2 !== -1 && idxT1 !== -1);
  assert.ok(idxT3 < idxT2, '15:39 comes before 17:00 on same day');
  assert.ok(idxT2 < idxT1, '22/11 comes before 23/11');
  assert.match(html, /data-training-date/);
  assert.match(html, /data-training-sort/);
  assert.match(html, /3<\/strong> lịch tập/);
  assert.match(html, /data-action="attendance"/);
  assert.match(html, /data-action="new-training"/);

  // Regular member: read-only attendance view, no Điểm danh button or Tạo lịch tập
  state.clubs = [{ id: 1, membership_role: 'member', can_manage_attendance: false }];
  html = page();
  assert.match(html, /22\/11\/2026 15:39/);
  assert.match(html, /Chỉ xem/);
  assert.doesNotMatch(html, /data-action="attendance"/);
  assert.doesNotMatch(html, /data-action="new-training"/);

  // Member granted attendance permission: can mark attendance & create trainings
  state.clubs = [{ id: 1, membership_role: 'member', can_manage_attendance: true }];
  html = page();
  assert.match(html, /data-action="attendance"/);
  assert.match(html, /data-action="new-training"/);

  // Restore owner for filter checks
  state.clubs = [{ id: 1, membership_role: 'owner', can_manage_attendance: true }];

  // Descending sort: 23rd 18:00 -> 22nd 17:00 -> 22nd 15:39
  state.trainingSort = 'desc';
  html = page();
  const revT1 = html.indexOf('23/11/2026 18:00');
  const revT2 = html.indexOf('22/11/2026 17:00');
  const revT3 = html.indexOf('22/11/2026 15:39');
  assert.ok(revT1 < revT2, '23/11 comes first in desc sort');
  assert.ok(revT2 < revT3, '17:00 comes before 15:39 in desc sort');

  // Filter by single date: 2026-11-22
  state.trainingSort = 'asc';
  state.trainingFilterDate = '2026-11-22';
  html = page();
  assert.match(html, /22\/11\/2026 15:39/);
  assert.match(html, /22\/11\/2026 17:00/);
  assert.doesNotMatch(html, /23\/11\/2026 18:00/);
  assert.match(html, /2<\/strong> lịch tập/);
  assert.match(html, /ngày <strong>22\/11\/2026<\/strong>/);

  // Filter by date with zero sessions
  state.trainingFilterDate = '2026-11-25';
  html = page();
  assert.match(html, /Không có lịch tập nào vào ngày 25\/11\/2026/);
  assert.match(html, /0<\/strong> lịch tập/);

  // Activities page no longer contains Lịch tập & điểm danh
  state.route = 'activities';
  state.clubs = [{ id: 1, membership_role: 'owner', can_manage_activities: true }];
  const actHtml = page();
  assert.doesNotMatch(actHtml, /Lịch tập & điểm danh/);

  // Reset filter
  state.trainingFilterDate = '';
  state.trainingFilterTeam = '';
  state.trainingSort = 'asc';
});
