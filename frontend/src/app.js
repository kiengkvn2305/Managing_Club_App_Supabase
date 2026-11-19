import { createApiClient } from './api-supabase.js';
import { state as s, currentClub } from './state.js';
import { page, authPage, titles } from './pages.js';
import { exportFinance } from './spreadsheets.js';
import { avatar, imageUrl, primeImageUrls } from './images.js';
import { calendarRange } from './matches-page.js';
import { passwordResetPage } from './password-reset-page.js';
import {
  icon,
  field,
  select,
  dialog,
  toast,
  showErrors,
} from './components/ui.js';
import {
  escapeHtml as e,
  number,
  roleLabel,
  canManageRoster,
  canManageClub,
  validate,
  formatDate,
  vietnamToday,
  compareVietnameseNames,
  unpackList,
} from './utils.js';

import { createClubController } from './controllers/club-controller.js';
import { createRosterController } from './controllers/roster-controller.js';
import { createDuesController } from './controllers/dues-controller.js';
import { createFinanceController } from './controllers/finance-controller.js';
import { createBoardController } from './controllers/board-controller.js';
import { createMatchController } from './controllers/match-controller.js';
import { createInventoryController } from './controllers/inventory-controller.js';
import { createActivityController } from './controllers/activity-controller.js';
import { createRecruitmentController } from './controllers/recruitment-controller.js';
import { createPollController } from './controllers/poll-controller.js';
import { createDiscoveryController } from './controllers/discovery-controller.js';

const root = document.querySelector('#app');
let sequence = 0;
let abortController;
let searchTimer;

const api = createApiClient({
  onUnauthorized: () => {
    clearSession();
    toast('Phiên đăng nhập đã hết hạn.', true);
  },
});

const currentRole = () => currentClub()?.membership_role || 'member';

const vietnamCalendarDate = () => {
  const [year, month, day] = vietnamToday().split('-').map(Number);
  return new Date(year, month - 1, day);
};

const base = (suffix = '') => `/clubs/${encodeURIComponent(s.clubId)}${suffix}`;

function values(form) {
  return Object.fromEntries(
    [...new FormData(form)].map(([k, v]) => [
      k,
      k.includes('password') ? v : String(v).trim(),
    ])
  );
}

async function submit(form, kind, handler) {
  const data = values(form);
  const errors = validate(kind, data);
  if (kind === 'accept' && data.token?.length !== 64) {
    errors.token = 'Mã lời mời phải có 64 ký tự.';
  }

  showErrors(form, errors);
  if (Object.keys(errors).length) return false;

  const btn = form.querySelector('[type="submit"]');
  if (btn?.disabled) return false;

  const originalButtonHtml = btn?.innerHTML;
  if (btn) btn.disabled = true;
  if (btn) {
    btn.setAttribute("aria-busy", "true");
    btn.textContent = 'Đang lưu…';
  }
  form.setAttribute("aria-busy", "true");

  try {
    await handler(data);
    return true;
  } catch (error) {
    if (form.isConnected) showErrors(form, error.errors || {}, error.message);
    return false;
  } finally {
    if (btn?.isConnected) {
      btn.disabled = false;
      if (btn.textContent === 'Đang lưu…') btn.innerHTML = originalButtonHtml;
      btn.removeAttribute('aria-busy');
    }
    form.removeAttribute('aria-busy');
  }
}

// Controller Context
const ctx = {
  state: s,
  api,
  base,
  currentClub,
  currentRole,
  loadApp,
  loadView,
  render,
  clearSession,
  submit,
  dialog,
  toast,
  field,
  select,
  showErrors,
  e,
  number,
  roleLabel,
  canManageRoster,
  canManageClub,
  formatDate,
  vietnamToday,
  vietnamCalendarDate,
  compareVietnameseNames,
  unpackList,
  exportFinance,
};

const clubController = createClubController(ctx);
const rosterController = createRosterController(ctx);
const duesController = createDuesController(ctx);
const financeController = createFinanceController(ctx);
const boardController = createBoardController(ctx);
const matchController = createMatchController(ctx);
const inventoryController = createInventoryController(ctx);
const activityController = createActivityController(ctx);
const recruitmentController = createRecruitmentController(ctx);
const pollController = createPollController(ctx);
const discoveryController = createDiscoveryController(ctx);

ctx.clubController = clubController;
ctx.rosterController = rosterController;

const controllers = [
  clubController,
  rosterController,
  duesController,
  financeController,
  boardController,
  matchController,
  inventoryController,
  activityController,
  recruitmentController,
  pollController,
  discoveryController,
];

const navItems = [
  ['dashboard', 'Tổng quan', 'grid'],
  ['members', 'Thành viên CLB', 'users'],
  ['teams', 'Đội bóng', 'layers'],
  ['club-members', 'Thành viên BCN', 'users'],
  ['finance', 'Sổ thu chi CLB', 'layers'],
  ['dues', 'Đóng quỹ', 'layers'],
  ['inventory', 'Kho trang bị', 'layers'],
  ['activities', 'Hoạt động CLB', 'flag'],
  ['club', 'Câu lạc bộ', 'shield'],
  ['profile', 'Tài khoản', 'user'],
];

const nav = () =>
  navItems
    .filter(
      ([route]) =>
        route !== 'club-members' ||
        currentRole() === 'owner' ||
        canManageClub(currentRole()) ||
        currentClub()?.can_manage_finance
    )
    .filter(
      ([route]) =>
        !['finance', 'dues'].includes(route) || currentClub()?.can_view_finance
    )
    .filter(
      ([route]) => route !== 'inventory' || currentClub()?.can_view_inventory
    )
    .map(
      ([route, name, glyph]) =>
        `<a href="#${route}" class="nav-link ${s.route === route ? 'active' : ''}" ${s.route === route ? 'aria-current="page"' : ''}>${icon(glyph)}<span>${name}</span></a>`
    )
    .join('');

const clubSelect = () =>
  `<select data-club-switch aria-label="Chuyển câu lạc bộ">${s.clubs.length ? s.clubs.map((c) => `<option value="${c.id}" ${String(c.id) === String(s.clubId) ? 'selected' : ''}>${e(c.name)}</option>`).join('') : '<option>Chưa có câu lạc bộ</option>'}</select>`;

function render() {
  if (['forgot', 'reset'].includes(s.authMode)) {
    root.innerHTML = passwordResetPage(s);
    return;
  }
  if (!s.user) {
    root.innerHTML = authPage();
    return;
  }

  const club = currentClub();
  const background = imageUrl(
    'background',
    club?.id,
    club?.background_version,
    club?.id
  );

  root.innerHTML = `
    <div class="shell">
      <aside class="sidebar">
        <a class="brand" href="#dashboard">
          <img src="/icons/crest.svg" alt="">FCMS <small>PRO</small>
        </a>
        <div class="club-selector">
          ${avatar(club?.name || 'FC', imageUrl('club', club?.id, club?.avatar_version, club?.id), 'club-icon')}
          <div>
            <small>CÂU LẠC BỘ CỦA BẠN</small>
            ${clubSelect()}
          </div>
        </div>
        <div class="nav-label">QUẢN LÝ CÂU LẠC BỘ</div>
        <nav aria-label="Điều hướng chính">
          ${nav()}
          <div class="nav-divider"></div>
          <a class="nav-link ${s.route === 'roadmap' ? 'active' : ''}" href="#roadmap">
            ${icon('flag')}<span>Lộ trình phát triển</span>
          </a>
        </nav>
        <div class="sidebar-bottom">
          <div>
            ${icon('flag')}
            <h3>Vững đội hình.<br>Chung mục tiêu.</h3>
            <p>Mỗi hồ sơ chỉn chu là một bước tiến của câu lạc bộ.</p>
          </div>
          <small>FCMS PRO / PHIÊN BẢN NỀN TẢNG</small>
        </div>
      </aside>

      <div class="workspace ${background ? 'has-club-background' : ''}" ${background ? `style="--club-background: url('${e(background)}')"` : ''}>
        <header class="topbar">
          <div class="breadcrumb">
            ${icon('shield')} ${e(currentClub()?.name || 'FCMS PRO')} <span>/</span> <strong>${titles[s.route]}</strong>
          </div>
          <a class="brand mobile-brand" href="#dashboard">
            <img src="/icons/crest.svg" alt="">FCMS <small>PRO</small>
          </a>
          <div class="header-actions">
            <button class="icon-button" data-action="theme" aria-label="Đổi giao diện sáng tối">
              ${icon('moon')}
            </button>
            <a class="user-link" href="#profile">
              ${avatar(s.user.name, imageUrl('account', s.user.id, s.user.avatar_version))}
              <div>
                <strong>${e(s.user.name)}</strong>
                <small>${e(roleLabel(currentRole()))}</small>
              </div>
            </a>
          </div>
        </header>

        <div id="connection-banner" class="connection-banner" ${navigator.onLine ? 'hidden' : ''} role="status">
          Bạn đang ngoại tuyến. Kết nối lại để cập nhật dữ liệu.
        </div>
        <div class="mobile-club">${clubSelect()}</div>
        <main id="main-content" tabindex="-1" class="page">
          ${page()}
          <footer>© ${new Date().getFullYear()} FCMS PRO. Cùng câu lạc bộ vươn xa.</footer>
        </main>
      </div>
      <nav class="bottom-nav" aria-label="Điều hướng di động">${nav()}</nav>
    </div>
  `;
}

function clearSession() {
  sequence++;
  abortController?.abort();
  s.user = null;
  s.clubs = [];
  s.clubId = null;
  clearData();
  document.querySelectorAll('dialog').forEach((x) => x.close());
  render();
}

function clearData() {
  s.members = [];
  s.myPlayer = null;
  s.canClaimPlayer = false;
  s.teams = [];
  s.lineups = [];
  s.matches = { data: [], meta: {} };
  s.matchCalendar = [];
  s.inventory = { data: [], current_page: 1, last_page: 1, total: 0 };
  s.polls = { data: [], current_page: 1, last_page: 1 };
  s.recruitment = { data: [], current_page: 1, last_page: 1, total: 0 };
  s.clubMemberships = [];
  s.boardMembers = [];
  s.boardSharedRates = [];
  s.boardTasks = [];
  s.activities = { celebrations: [], birthdays: [], trainings: [], awards: [] };
  s.finance = { data: [], summary: {}, meta: {} };
  s.plannedExpenses = [];
  s.discovery = { data: [], meta: {} };
  s.friendlies = { data: [], meta: {} };
  s.meta = {};
  s.dashboard = {};
  s.error = '';
}

function readRoute() {
  const rawHash = location.hash.slice(1);
  const recoveryText = rawHash.includes('access_token=')
    ? rawHash
    : location.search.slice(1);
  const recovery = new URLSearchParams(recoveryText);

  if (recovery.get('type') === 'recovery' || recovery.get('code')) {
    s.authMode = 'reset';
    s.resetToken = recovery.get('access_token') || recovery.get('code') || '';
    s.resetEmail = '';
    s.route = 'dashboard';
    return;
  }

  const [route, query = ''] = rawHash.split('?');
  if (route === 'reset-password') {
    const params = new URLSearchParams(query);
    s.resetToken = params.get('token') || '';
    s.resetEmail = params.get('email') || '';
    s.authMode = 'reset';
    s.route = 'dashboard';
    history.replaceState(null, '', location.pathname + location.search);
    return;
  }

  const token = new URLSearchParams(query).get('token');
  s.route = Object.hasOwn(titles, route) ? route : 'dashboard';
  s.teamRosterId =
    route === 'team-roster' ? new URLSearchParams(query).get('id') || '' : '';

  if (token) {
    s.invite = token;
    history.replaceState(null, '', location.pathname + '#accept');
    s.route = 'accept';
  }
}

async function loadApp() {
  const seq = ++sequence;
  s.loading = true;
  s.error = '';
  render();

  try {
    const result = await api.get('/clubs');
    if (seq !== sequence || !s.user) return;
    s.clubs = unpackList(result).rows;
    if (!currentClub()) s.clubId = s.clubs[0]?.id || null;

    await primeImageUrls([
      { kind: 'account', id: s.user.id, version: s.user.avatar_version },
      ...s.clubs.flatMap((club) => [
        {
          kind: 'club',
          id: club.id,
          version: club.avatar_version,
          clubId: club.id,
        },
        {
          kind: 'background',
          id: club.id,
          version: club.background_version,
          clubId: club.id,
        },
      ]),
    ]);

    await loadView();
  } catch (error) {
    if (seq !== sequence || !s.user) return;
    s.loading = false;
    s.error = error.message;
    render();
  }
}

async function loadView() {
  abortController?.abort();
  abortController = new AbortController();
  const signal = abortController.signal;
  const tenant = s.clubId;
  const route = s.route;

  clearData();
  s.loading = true;
  render();

  try {
    if (route === 'discover') {
      const tasks = [
        api.get(
          `/discover/clubs?${new URLSearchParams({ q: s.discoveryQuery, page: s.discoveryPage })}`,
          { signal }
        ),
      ];
      if (tenant && canManageClub(currentRole())) {
        tasks.push(
          api.get(
            base(`/friendlies?${new URLSearchParams({ page: s.friendlyPage })}`),
            { signal }
          )
        );
      }
      const results = await Promise.all(tasks);
      if (signal.aborted || !s.user || tenant !== s.clubId || route !== s.route) {
        return;
      }
      s.discovery = results[0];
      s.friendlies = results[1] || { data: [], meta: {} };
    }

    if (
      tenant &&
      [
        'dashboard',
        'members',
        'team-roster',
        'teams',
        'lineups',
        'matches',
        'inventory',
        'polls',
        'recruitment',
        'club-members',
        'finance',
        'dues',
        'activities',
        'profile',
      ].includes(route)
    ) {
      const tasks = [api.get(base('/teams'), { signal })];

      if (route === 'dashboard') {
        tasks.push(api.get(base('/dashboard'), { signal }));
      }
      if (route === 'lineups' && canManageRoster(currentRole())) {
        tasks.push(api.get(base('/lineups'), { signal }));
      }
      if (route === 'matches' && canManageRoster(currentRole())) {
        if (!s.matchesMonth) {
          const now = new Date();
          s.matchesMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
          s.matchesWeek = `${s.matchesMonth}-${String(now.getDate()).padStart(2, '0')}`;
        }
        const query =
          s.matchesView === 'list'
            ? `/matches?${new URLSearchParams({ month: s.matchesMonth, page: s.matchesPage })}`
            : `/matches/calendar?${new URLSearchParams(calendarRange(s.matchesView, s.matchesMonth, s.matchesWeek))}`;
        tasks.push(api.get(base(query), { signal }));
      }
      if (route === 'inventory' && currentClub()?.can_view_inventory) {
        const query = new URLSearchParams({
          page: s.inventoryPage,
          ...(s.inventorySearch ? { search: s.inventorySearch } : {}),
          ...(s.inventoryLowStock ? { low_stock: '1' } : {}),
          ...(s.inventoryArchived ? { archived: '1' } : {}),
        });
        tasks.push(api.get(base(`/inventory?${query}`), { signal }));
      }
      if (route === 'polls') {
        tasks.push(
          api.get(
            base(`/polls?${new URLSearchParams({ page: s.pollsPage })}`),
            { signal }
          )
        );
      }
      if (route === 'recruitment' && canManageRoster(currentRole())) {
        tasks.push(
          api.get(
            base(
              `/recruitment/posts?${new URLSearchParams({ page: s.recruitmentPage, ...(s.recruitmentStatus ? { status: s.recruitmentStatus } : {}) })}`
            ),
            { signal }
          )
        );
      }
      if (
        route === 'club-members' &&
        (currentRole() === 'owner' ||
          canManageClub(currentRole()) ||
          currentClub()?.can_manage_finance)
      ) {
        tasks.push(api.get(base('/board-members'), { signal }));
      }
      if (route === 'finance' && currentClub()?.can_view_finance) {
        if (!s.financeMonth) {
          const d = vietnamCalendarDate();
          s.financeMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
          s.financeYear = String(d.getFullYear());
          s.financeFrom = `${s.financeMonth}-01`;
          s.financeTo = `${s.financeMonth}-${String(new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()).padStart(2, '0')}`;
        }
        tasks.push(
          api.get(
            base(
              `/finance?${new URLSearchParams({ page: s.financePage, adjustment_page: s.financeAdjustmentPage, group: s.financePeriod === 'month' ? 'day' : 'month', period: s.financePeriod, from: s.financeFrom, to: s.financeTo })}`
            ),
            { signal }
          )
        );
        tasks.push(
          api.get(
            base(
              `/finance/planned?${new URLSearchParams({ from: s.financeFrom.slice(0, 7), to: s.financeTo.slice(0, 7) })}`
            ),
            { signal }
          )
        );
      }
      if (route === 'dues' && currentClub()?.can_view_finance) {
        if (!s.duesMonth) {
          const d = vietnamCalendarDate();
          s.duesMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        }
        tasks.push(
          api.get(
            base(`/dues?${new URLSearchParams({ month: s.duesMonth })}`),
            { signal }
          )
        );
      }
      if (route === 'activities' && currentClub()?.can_manage_activities) {
        tasks.push(api.get(base('/activities'), { signal }));
      }
      if (route === 'profile') {
        tasks.push(api.get(base('/my-player'), { signal }));
      }
      if (
        (route === 'dashboard' ||
          route === 'members' ||
          (route === 'team-roster' && /^\d+$/.test(s.teamRosterId))) &&
        canManageRoster(currentRole())
      ) {
        const q =
          route === 'dashboard'
            ? new URLSearchParams({ per_page: '5', sort: 'created_at' })
            : route === 'team-roster'
              ? new URLSearchParams({
                  team_id: s.teamRosterId,
                  sort: s.teamRosterSort,
                  direction: s.teamRosterDirection,
                  q: s.teamRosterSearch,
                  dues_status: s.teamDuesFilter || '',
                  page: String(s.teamRosterPage),
                  per_page: '15',
                })
              : new URLSearchParams({ ...s.filters, per_page: '15' });
        for (const [key, value] of [...q]) if (value === '') q.delete(key);
        tasks.push(api.get(base(`/members?${q}`), { signal }));
      }

      const results = await Promise.all(tasks);
      if (signal.aborted || !s.user || tenant !== s.clubId || route !== s.route) {
        return;
      }

      s.teams = unpackList(results[0]).rows;
      if (route === 'lineups' && results[1]) {
        s.lineups = unpackList(results[1]).rows;
      }
      if (route === 'matches' && results[1]) {
        if (s.matchesView === 'list') s.matches = results[1];
        else s.matchCalendar = results[1].data;
      }
      if (route === 'inventory' && results[1]) s.inventory = results[1];
      if (route === 'polls' && results[1]) s.polls = results[1];
      if (route === 'recruitment' && results[1]) s.recruitment = results[1];
      if (route === 'club-members' && results[1]) {
        s.boardMembers = unpackList(results[1]).rows;
        s.boardSharedRates = results[1].shared_rates || [];
      }
      if (route === 'finance' && results[1]) s.finance = results[1];
      if (route === 'finance' && results[2]) {
        s.plannedExpenses = results[2].data;
      }
      if (route === 'dues') s.dues = results[1]?.data || [];
      if (route === 'activities' && results[1]) {
        s.activities = results[1].data;
      }
      if (route === 'profile') {
        s.myPlayer = results[1]?.data || null;
        s.canClaimPlayer = Boolean(results[1]?.eligible);
      }
      if (route === 'dashboard') s.dashboard = results[1].data;

      const list = [
        'lineups',
        'matches',
        'inventory',
        'polls',
        'recruitment',
        'club-members',
        'finance',
        'dues',
        'activities',
        'profile',
      ].includes(route)
        ? null
        : results[route === 'dashboard' ? 2 : 1];

      if (list) {
        const { rows, meta } = unpackList(list);
        s.members =
          route === 'dashboard'
            ? rows.map((m) => ({
                ...m,
                team: {
                  name:
                    (m.teams || []).map((t) => t.name).join(', ') ||
                    'Chưa xếp đội',
                },
                jersey_number: null,
              }))
            : rows;
        s.meta = meta;
      }

      await primeImageUrls([
        {
          kind: 'account',
          id: s.user.id,
          version: s.user.avatar_version,
        },
        {
          kind: 'club',
          id: tenant,
          version: currentClub()?.avatar_version,
          clubId: tenant,
        },
        {
          kind: 'background',
          id: tenant,
          version: currentClub()?.background_version,
          clubId: tenant,
        },
        ...(s.members || []).map((member) => ({
          kind: 'player',
          id: member.id,
          version: member.avatar_version,
          clubId: tenant,
        })),
        ...(s.myPlayer
          ? [
              {
                kind: 'player',
                id: s.myPlayer.id,
                version: s.myPlayer.avatar_version,
                clubId: tenant,
              },
            ]
          : []),
      ]);
    }

    if (signal.aborted || !s.user) return;
    s.loading = false;
    render();
  } catch (error) {
    if (error.name === 'AbortError' || signal.aborted || !s.user) return;
    s.loading = false;
    s.error = error.message;
    render();
  }
}

async function action(el) {
  const a = el.dataset.action;

  if (a === 'theme') {
    const theme =
      document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem('fcms-theme', theme);
    } catch {}
    return;
  }

  if (a === 'auth-mode') {
    s.authMode = s.authMode === 'login' ? 'register' : 'login';
    render();
    return;
  }

  if (a === 'forgot-password') {
    s.authMode = 'forgot';
    render();
    return;
  }

  if (a === 'back-to-login') {
    s.authMode = 'login';
    s.resetToken = '';
    s.resetEmail = '';
    render();
    return;
  }

  if (!s.user) return;

  if (a === 'retry') return loadApp();

  if (a === 'logout') {
    await api.post('/auth/logout');
    clearSession();
    toast('Đã đăng xuất an toàn.');
    return;
  }

  if (a === 'verify') {
    const response = await api.post('/auth/verification-notification');
    toast(response.data.message);
    return;
  }

  if (a === 'refresh-user') {
    s.user = (await api.get('/auth/user')).data;
    render();
    toast(
      s.user.email_verified_at
        ? 'Email đã được xác minh.'
        : 'Email chưa được xác minh.'
    );
    return;
  }

  // Delegate action to domain controllers
  for (const controller of controllers) {
    const handled = await controller.handleAction(a, el);
    if (handled) return;
  }
}

root.addEventListener('click', (event) => {
  const el = event.target.closest('[data-action]');
  if (el && !el.disabled) {
    action(el).catch((error) => toast(error.message, true));
  }
});

document.addEventListener(
  'error',
  (event) => {
    if (event.target.matches?.('.avatar img')) event.target.remove();
  },
  true
);

root.addEventListener('change', (event) => {
  if (event.target.matches('[data-birthday-month]')) {
    s.birthdayMonth = event.target.value;
    s.birthdayPage = 1;
    render();
    root.querySelector('[data-birthday-month]')?.focus();
    return;
  }

  if (event.target.matches('[data-finance-period]')) {
    const form = event.target.closest('form');
    form.querySelector('[data-finance-month]').hidden =
      event.target.value !== 'month';
    form.querySelector('[data-finance-year]').hidden =
      event.target.value !== 'year';
  }

  if (event.target.matches('[data-club-switch]')) {
    clearTimeout(searchTimer);
    s.clubId = Number(event.target.value);
    s.birthdayPage = 1;
    s.birthdayMonth = '';
    s.friendlyPage = 1;
    s.matchesPage = 1;
    s.inventoryPage = 1;
    s.inventorySearch = '';
    s.inventoryLowStock = false;
    s.inventoryArchived = false;
    s.pollsPage = 1;
    s.recruitmentPage = 1;
    s.recruitmentStatus = '';
    s.filters = { q: '', team_id: '', status: '', page: 1 };
    loadView();
  }
});

root.addEventListener('submit', (event) => {
  const form = event.target.closest('[data-form]');
  if (!form) return;
  event.preventDefault();

  const kind = form.dataset.form;

  if (kind === 'forgot-password' || kind === 'reset-password') {
    submit(form, kind, async (data) => {
      if (kind === 'forgot-password') {
        const result = await api.post('/auth/forgot-password', {
          email: data.email,
        });
        toast(result.message);
      } else {
        await api.post('/auth/reset-password', data);
        s.resetToken = '';
        s.resetEmail = '';
        s.authMode = 'login';
        render();
        toast('Đã đặt lại mật khẩu. Bạn có thể đăng nhập.');
      }
    });
    return;
  }

  if (kind === 'filters') {
    s.filters = { ...values(form), page: 1 };
    loadView();
    return;
  }

  if (kind === 'roster-sort') {
    const data = values(form);
    s.teamRosterSort = data.sort;
    s.teamRosterDirection = data.direction || 'asc';
    s.teamRosterSearch = data.q || '';
    s.teamDuesFilter = data.dues_status || '';
    s.teamRosterPage = 1;
    loadView();
    return;
  }

  if (kind === 'finance-filter') {
    const data = values(form);
    if (
      !/^\d{4}-\d{2}$/.test(data.month) ||
      !/^\d{4}$/.test(data.year) ||
      Number(data.year) < 1901 ||
      Number(data.year) > 9998
    ) {
      toast('Hãy chọn tháng và năm hợp lệ.', true);
      return;
    }
    s.financePeriod = data.period;
    s.financeMonth = data.month;
    s.financeYear = data.year;
    if (data.period === 'year') {
      s.financeFrom = `${data.year}-01-01`;
      s.financeTo = `${data.year}-12-31`;
    } else {
      const [y, m] = data.month.split('-').map(Number);
      s.financeFrom = `${data.month}-01`;
      s.financeTo = `${data.month}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`;
    }
    s.financePage = 1;
    s.financeAdjustmentPage = 1;
    loadView();
    return;
  }

  if (kind === 'dues-filter') {
    const data = values(form);
    s.duesMonth = data.month;
    s.duesSearch = data.q || '';
    s.duesDirection = data.direction || 'asc';
    s.duesTeam = data.team_id || '';
    s.duesStatus = data.status || '';
    loadView();
    return;
  }

  if (kind === 'discover-filter') {
    s.discoveryQuery = values(form).q || '';
    s.discoveryPage = 1;
    loadView();
    return;
  }

  if (kind === 'matches-filter') {
    const data = values(form);
    s.matchesView = data.view;
    s.matchesMonth = data.month;
    s.matchesWeek = data.week;
    s.matchesPage = 1;
    loadView();
    return;
  }

  if (kind === 'inventory-filter') {
    s.inventorySearch = values(form).search || '';
    s.inventoryLowStock = Boolean(form.elements.low_stock.checked);
    s.inventoryArchived = Boolean(form.elements.archived.checked);
    s.inventoryPage = 1;
    loadView();
    return;
  }

  if (kind === 'recruitment-filter') {
    s.recruitmentStatus = values(form).status || '';
    s.recruitmentPage = 1;
    loadView();
    return;
  }

  submit(form, kind, async (data) => {
    if (kind === 'login' || kind === 'register') {
      s.user = (
        await api.post(`/auth/${kind}`, data, { silentUnauthorized: true })
      ).data;
      await loadApp();
      toast('Chào mừng bạn đến với FCMS PRO!');
    }
    if (kind === 'profile') {
      s.user = (await api.patch('/auth/profile', data)).data;
      render();
      toast('Đã cập nhật tài khoản.');
    }
    if (kind === 'accept') {
      const response = await api.post('/invitations/accept', {
        token: data.token,
      });
      s.invite = '';
      s.clubId = response.data.id;
      s.route = 'dashboard';
      history.replaceState(null, '', location.pathname + '#dashboard');
      await loadApp();
      toast('Đã tham gia câu lạc bộ.');
    }
  });
});

root.addEventListener('input', (event) => {
  if (event.target.name !== 'q') return;
  clearTimeout(searchTimer);
  const text = event.target.value;
  searchTimer = setTimeout(async () => {
    if (s.route !== 'members' || !s.user) return;
    s.filters.q = text;
    s.filters.page = 1;
    await loadView();
    const input = root.querySelector('[name="q"]');
    if (input) {
      input.focus();
      input.setSelectionRange(text.length, text.length);
    }
  }, 250);
});

window.addEventListener('hashchange', () => {
  readRoute();
  loadView();
});

window.addEventListener('online', () => {
  document.querySelector('#connection-banner').hidden = true;
});

window.addEventListener('offline', () => {
  document.querySelector('#connection-banner').hidden = false;
});

readRoute();

api
  .get('/auth/user', { silentUnauthorized: true })
  .then((response) => {
    s.user = response.data;
    return loadApp();
  })
  .catch(() => {
    s.loading = false;
    render();
  });
