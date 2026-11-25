import { createApiClient } from './api-supabase.js';
import { state as s, currentClub } from './state.js';
import { page, authPage, publicClubPage, titles } from './pages.js';
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
  openMemberPickerModal,
} from './components/ui.js';
import {
  escapeHtml as e,
  number,
  roleLabel,
  canManageRoster,
  canManageClub,
  isCoOwnerOrOwner,
  validate,
  formatDate,
  validDate,
  formatVietnamClock,
  vietnamToday,
  compareVietnameseNames,
  unpackList,
} from './utils.js';

function syncThemeMeta(theme) {
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', theme === 'light' ? '#eef3f7' : '#07111e');
}

try {
  const savedTheme = localStorage.getItem('fcms-theme');
  const activeTheme = savedTheme === 'light' ? 'light' : 'dark';
  document.documentElement.dataset.theme = activeTheme;
  syncThemeMeta(activeTheme);
} catch {
  document.documentElement.dataset.theme = 'dark';
  syncThemeMeta('dark');
}

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
let clockTimer;

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
  if (kind === 'accept') {
    let token = String(data.token || '').trim();
    const match = token.match(/token=([^&#]+)/);
    if (match) token = decodeURIComponent(match[1]).trim();
    if (!token) {
      errors.token = 'Vui lòng nhập mã lời mời.';
    }
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
  canManageRoster: (role) => {
    const c = currentClub();
    if (c?.is_system_admin || c?.membership_role === 'owner') return true;
    if (c?.can_manage_roster !== undefined) return Boolean(c.can_manage_roster);
    return canManageRoster(role || currentRole());
  },
  canManageClub: (role) => {
    const c = currentClub();
    if (c?.is_system_admin || c?.membership_role === 'owner') return true;
    if (c?.can_manage_club !== undefined) return Boolean(c.can_manage_club);
    return canManageClub(role || currentRole());
  },
  requirePermission: (allowed, actionLabel = '') => {
    if (!allowed) {
      toast(
        actionLabel
          ? `Bạn không có quyền thực hiện thao tác: ${actionLabel}. Vui lòng liên hệ Chủ nhiệm CLB để được cấp quyền.`
          : 'Bạn không có quyền thực hiện thao tác này. Vui lòng liên hệ Chủ nhiệm CLB để được cấp quyền.',
        true
      );
      return false;
    }
    return true;
  },
  openMemberPickerModal,
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
  ['attendance', 'Điểm danh', 'check'],
  ['club-members', 'Thành viên BCN', 'users'],
  ['finance', 'Sổ thu chi CLB', 'layers'],
  ['dues', 'Đóng quỹ', 'layers'],
  ['inventory', 'Kho trang bị', 'layers'],
  ['activities', 'Hoạt động CLB', 'flag'],
  ['club', 'Câu lạc bộ', 'shield'],
  ['admin', 'Quản trị hệ thống 👑', 'shield'],
  ['profile', 'Tài khoản', 'user'],
];

const isSidebarCollapsed = () => {
  try {
    return localStorage.getItem('fcms-sidebar-collapsed') === '1';
  } catch {
    return false;
  }
};

const nav = () => {
  if (s.user?.is_system_admin) {
    const clubsCount = s.adminClubs?.length || s.clubs?.length || 0;
    const usersCount = s.adminUsers?.length || 0;
    const adminTab = s.adminTab || 'overview';
    const adminNavItems = [
      ['admin?tab=overview', 'Tổng quan hệ thống', 'grid', s.route === 'admin' && adminTab === 'overview'],
      ['admin?tab=clubs', `Quản lý CLB (${clubsCount})`, 'shield', s.route === 'admin' && adminTab === 'clubs'],
      ['admin?tab=users', `Quản lý Người dùng (${usersCount})`, 'users', s.route === 'admin' && adminTab === 'users'],
      ['profile', 'Tài khoản', 'user', s.route === 'profile'],
    ];
    return adminNavItems
      .map(
        ([href, name, glyph, isActive]) =>
          `<a href="#${href}" class="nav-link ${isActive ? 'active' : ''}" ${isActive ? 'aria-current="page"' : ''}>${icon(glyph)}<span>${name}</span></a>`
      )
      .join('');
  }

  return navItems
    .filter(([route]) => {
      if (route === 'admin') {
        return Boolean(s.user?.is_system_admin);
      }
      const c = currentClub();
      if (!c) return true;
      if (isCoOwnerOrOwner(c)) return true;
      if (route === 'club-members') {
        return Boolean(canManageClub(c));
      }
      if (['finance', 'dues'].includes(route)) {
        return Boolean(c.can_view_finance);
      }
      if (route === 'inventory') {
        return Boolean(c.can_view_inventory);
      }
      if (route === 'activities') {
        return Boolean(c.can_manage_activities || c.can_view_activities);
      }
      return true;
    })
    .map(
      ([route, name, glyph]) =>
        `<a href="#${route}" class="nav-link ${s.route === route ? 'active' : ''}" ${s.route === route ? 'aria-current="page"' : ''}>${icon(glyph)}<span>${name}</span></a>`
    )
    .join('');
};

const clubSelect = () =>
  `<select data-club-switch aria-label="Chuyển câu lạc bộ">${s.clubs.length ? s.clubs.map((c) => `<option value="${c.id}" ${String(c.id) === String(s.clubId) ? 'selected' : ''}>${e(c.name)}</option>`).join('') : '<option>Chưa có câu lạc bộ</option>'}</select>`;

function startVietnamClock() {
  clearInterval(clockTimer);
  const update = () => {
    const label = formatVietnamClock();
    document.querySelectorAll('[data-vietnam-clock]').forEach((clock) => {
      clock.textContent = label;
      clock.dateTime = new Date().toISOString();
    });
  };
  update();
  clockTimer = setInterval(update, 1000);
}

function updateNotificationBadge() {
  const count = Number(s.notifications?.unread_count || 0);
  document.querySelectorAll('[data-action="open-notifications"]').forEach((btn) => {
    const existing = btn.querySelector('.notif-badge');
    if (count > 0) {
      const text = count > 99 ? '99+' : String(count);
      if (existing) {
        existing.textContent = text;
      } else {
        const span = document.createElement('span');
        span.className = 'notif-badge';
        span.textContent = text;
        btn.append(span);
      }
    } else if (existing) {
      existing.remove();
    }
  });
}

function render() {
  if (['forgot', 'reset'].includes(s.authMode)) {
    root.innerHTML = passwordResetPage(s);
    startVietnamClock();
    return;
  }
  if (!s.user && s.route === 'public-club') {
    root.innerHTML = publicClubPage();
    startVietnamClock();
    return;
  }
  if (!s.user) {
    root.innerHTML = authPage();
    startVietnamClock();
    return;
  }

  const isSysAdmin = Boolean(s.user?.is_system_admin);
  const club = currentClub();
  const background = !isSysAdmin && imageUrl(
    'background',
    club?.id,
    club?.background_version,
    club?.id
  );

  const adminBreadcrumbTitle =
    s.adminTab === 'clubs'
      ? 'Quản lý Câu lạc bộ'
      : s.adminTab === 'users'
        ? 'Quản lý Người dùng'
        : 'Tổng quan hệ thống';

  const topbarContextHtml = isSysAdmin && s.route === 'admin'
    ? `<div class="breadcrumb">${icon('shield')} FCMS PRO HỆ THỐNG <span>/</span> <strong>${adminBreadcrumbTitle}</strong></div>`
    : `<div class="breadcrumb">${icon('shield')} ${e(currentClub()?.name || 'FCMS PRO')} <span>/</span> <strong>${titles[s.route] || 'Tổng quan'}</strong></div>`;

  const collapsed = isSidebarCollapsed();

  root.innerHTML = `
    <div class="shell ${collapsed ? 'sidebar-collapsed' : ''}">
      <aside class="sidebar">
        <a class="brand" href="${isSysAdmin ? '#admin' : '#dashboard'}">
          <img src="/icons/crest.svg" alt="">FCMS <small>${isSysAdmin ? 'ADMIN' : 'PRO'}</small>
        </a>
        <time class="sidebar-clock" data-vietnam-clock aria-label="Thời gian hiện tại UTC+7">Đang tải thời gian…</time>
        ${
          isSysAdmin
            ? `
            <div class="club-selector" style="border:1px solid rgba(0,102,204,0.3);background:rgba(0,102,204,0.06);border-radius:12px;padding:0.75rem;">
              <div style="display:flex;align-items:center;gap:0.75rem;">
                <div style="width:36px;height:36px;border-radius:8px;background:rgba(0,102,204,0.15);display:flex;align-items:center;justify-content:center;font-size:1.2rem;">
                  👑
                </div>
                <div>
                  <div style="font-weight:700;font-size:0.95rem;color:var(--text);line-height:1.2;">QUẢN TRỊ VIÊN</div>
                  <small style="color:var(--primary);font-size:0.75rem;font-weight:600;">HỆ THỐNG TOÀN DIỆN</small>
                </div>
              </div>
            </div>
            <div class="nav-label">QUẢN TRỊ HỆ THỐNG</div>
          `
            : `
            <div class="club-selector">
              ${avatar(club?.name || 'FC', imageUrl('club', club?.id, club?.avatar_version, club?.id), 'club-icon')}
              <div>
                <small>CÂU LẠC BỘ CỦA BẠN</small>
                ${clubSelect()}
              </div>
            </div>
            <div class="nav-label">QUẢN LÝ CÂU LẠC BỘ</div>
          `
        }
        <nav aria-label="Điều hướng chính">
          ${nav()}
          ${
            !isSysAdmin
              ? `
              <div class="nav-divider"></div>
              <a class="nav-link ${s.route === 'roadmap' ? 'active' : ''}" href="#roadmap">
                ${icon('flag')}<span>Lộ trình phát triển</span>
              </a>
            `
              : ''
          }
        </nav>
        <div class="sidebar-bottom">
          <div>
            ${icon(isSysAdmin ? 'shield' : 'flag')}
            <h3>${isSysAdmin ? 'Cổng Quản Trị Hệ Thống' : 'Vững đội hình.<br>Chung mục tiêu.'}</h3>
            <p>${isSysAdmin ? 'Giám sát toàn bộ Câu lạc bộ, tài khoản người dùng và thiết lập bảo mật.' : 'Mỗi hồ sơ chỉn chu là một bước tiến của câu lạc bộ.'}</p>
          </div>
          <small>FCMS PRO / ${isSysAdmin ? 'SYSTEM ADMIN' : 'PHIÊN BẢN NỀN TẢNG'}</small>
        </div>
      </aside>

      <div class="workspace ${background ? 'has-club-background' : ''}" ${background ? `style="--club-background: url('${e(background)}')"` : ''}>
        <header class="topbar">
          <div class="topbar-left">
            <button type="button" class="icon-button sidebar-toggle" data-action="toggle-sidebar" aria-label="${collapsed ? 'Hiện thanh công cụ' : 'Ẩn thanh công cụ'}" title="${collapsed ? 'Hiện thanh công cụ' : 'Ẩn thanh công cụ'}" aria-expanded="${!collapsed}">
              ${icon('sidebar')}
            </button>
            <div class="topbar-context">
              ${topbarContextHtml}
            </div>
          </div>
          <a class="brand mobile-brand" href="${isSysAdmin ? '#admin' : '#dashboard'}">
            <img src="/icons/crest.svg" alt="">FCMS <small>${isSysAdmin ? 'ADMIN' : 'PRO'}</small>
          </a>
          <time class="mobile-clock" data-vietnam-clock aria-label="Thời gian hiện tại UTC+7">Đang tải thời gian…</time>
          <div class="header-actions">
            ${
              !isSysAdmin && club
                ? `<button type="button" class="icon-button notif-bell" data-action="open-notifications" aria-label="Thông báo tự động" title="Thông báo tự động của CLB">
                    ${icon('bell')}
                    ${
                      Number(s.notifications?.unread_count || 0) > 0
                        ? `<span class="notif-badge">${s.notifications.unread_count > 99 ? '99+' : number(s.notifications.unread_count)}</span>`
                        : ''
                    }
                  </button>`
                : ''
            }
            <button class="icon-button theme-toggle" data-action="theme" aria-label="Đổi giao diện sáng tối" title="${document.documentElement.dataset.theme === 'light' ? 'Chuyển sang nền tối' : 'Chuyển sang nền sáng'}">
              ${icon(document.documentElement.dataset.theme === 'light' ? 'moon' : 'sun')}
            </button>
            <a class="user-link" href="#profile">
              ${avatar(s.user.name, imageUrl('account', s.user.id, s.user.avatar_version))}
              <div>
                <strong>${e(s.user.name)}</strong>
                <small>${isSysAdmin ? '👑 Quản trị viên hệ thống' : e(roleLabel(currentRole()))}</small>
              </div>
            </a>
          </div>
        </header>

        <div id="connection-banner" class="connection-banner" ${navigator.onLine ? 'hidden' : ''} role="status">
          Bạn đang ngoại tuyến. Kết nối lại để cập nhật dữ liệu.
        </div>
        ${!isSysAdmin ? `<div class="mobile-club">${clubSelect()}</div>` : ''}
        <main id="main-content" tabindex="-1" class="page">
          ${page()}
          <footer>© ${new Date().getFullYear()} FCMS PRO. Cùng câu lạc bộ vươn xa.</footer>
        </main>
      </div>
      <nav class="bottom-nav" aria-label="Điều hướng di động">${nav()}</nav>
    </div>
  `;
  startVietnamClock();
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
  s.activities = {
    celebrations: [],
    birthdays: [],
    trainings: [],
    awards: [],
    players: [],
  };
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

  const params = new URLSearchParams(query);
  const token = params.get('token');

  if (route === 'admin' || route.startsWith('admin-')) {
    s.route = 'admin';
    if (route === 'admin-clubs' || params.get('tab') === 'clubs') {
      s.adminTab = 'clubs';
    } else if (route === 'admin-users' || params.get('tab') === 'users') {
      s.adminTab = 'users';
    } else if (route === 'admin-overview' || params.get('tab') === 'overview') {
      s.adminTab = 'overview';
    } else if (!s.adminTab) {
      s.adminTab = 'overview';
    }
  } else {
    s.route = Object.hasOwn(titles, route) ? route : 'dashboard';
    if (s.user?.is_system_admin && (!route || route === 'dashboard')) {
      s.route = 'admin';
      s.adminTab = s.adminTab || 'overview';
    }
  }
  s.teamRosterId =
    route === 'team-roster' ? params.get('id') || '' : '';
  s.publicClubSlug = route === 'public-club' ? params.get('slug') || '' : '';
  s.publicClubId = route === 'public-club' ? params.get('id') || '' : '';

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
    if (s.user?.is_system_admin && (!s.route || s.route === 'dashboard')) {
      s.route = 'admin';
      s.adminTab = s.adminTab || 'overview';
    }

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
    if (route === 'public-club') {
      s.publicClub = null;
      const q = new URLSearchParams({
        ...(s.publicClubSlug ? { slug: s.publicClubSlug } : {}),
        ...(s.publicClubId ? { id: s.publicClubId } : {}),
      });
      try {
        const res = await api.get(`/public/clubs?${q}`, {
          signal,
          silentUnauthorized: true,
        });
        if (signal.aborted || route !== s.route) return;
        s.publicClub = res.data || null;
        s.error = '';
      } catch (err) {
        if (signal.aborted || route !== s.route) return;
        s.publicClub = null;
        s.error = err.message;
      }
      s.loading = false;
      render();
      return;
    }

    if (s.user && tenant && !s.user.is_system_admin) {
      api
        .get(base('/notifications'), { signal })
        .then((res) => {
          if (!signal.aborted && tenant === s.clubId) {
            s.notifications = res.data || { items: [], unread_count: 0 };
            updateNotificationBadge();
          }
        })
        .catch(() => {});
    }

    if (route === 'discover') {
      const tasks = [
        api.get(
          `/discover/clubs?${new URLSearchParams({ q: s.discoveryQuery, page: s.discoveryPage })}`,
          { signal }
        ),
      ];
      if (tenant && canManageClub(currentClub())) {
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

    if (route === 'admin') {
      if (!s.user?.is_system_admin) {
        toast('Bạn không có quyền truy cập trang quản trị.', true);
        s.route = 'dashboard';
        location.hash = '#dashboard';
        s.loading = false;
        render();
        return;
      }
      const [statsRes, clubsRes, usersRes] = await Promise.all([
        api.get('/admin/stats', { signal }).catch((err) => {
          console.warn('/admin/stats error:', err);
          return { data: null };
        }),
        api.get('/admin/clubs', { signal }).catch((err) => {
          console.warn('/admin/clubs error:', err);
          return { data: [] };
        }),
        api.get('/admin/users', { signal }).catch((err) => {
          console.warn('/admin/users error:', err);
          return { data: [] };
        }),
      ]);
      if (signal.aborted || !s.user || route !== s.route) return;
      s.adminStats = statsRes.data;
      s.adminClubs = (clubsRes.data && clubsRes.data.length > 0) ? clubsRes.data : (s.clubs || []);
      s.adminUsers = usersRes.data || [];
      s.loading = false;
      render();
      return;
    }

    if (tenant && ['finance', 'dues'].includes(route) && !currentClub()?.can_view_finance) {
      toast(
        'Bạn không có quyền xem thông tin tài chính của câu lạc bộ. Vui lòng liên hệ Chủ nhiệm CLB để được cấp quyền.',
        true
      );
      s.route = 'dashboard';
      location.hash = '#dashboard';
      render();
      return;
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
        'attendance',
        'activities',
        'profile',
        'club',
      ].includes(route)
    ) {
      const tasks = [api.get(base('/teams'), { signal })];

      if (route === 'dashboard') {
        tasks.push(api.get(base('/dashboard'), { signal }));
      }
      if (route === 'lineups' && canManageRoster(currentClub())) {
        tasks.push(api.get(base('/lineups'), { signal }));
      }
      if (route === 'matches' && canManageRoster(currentClub())) {
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
      if (route === 'recruitment' && canManageRoster(currentClub())) {
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
          canManageClub(currentClub()) ||
          currentClub()?.can_manage_finance ||
          currentClub()?.can_manage_roster)
      ) {
        tasks.push(api.get(base('/board-members'), { signal }));
        tasks.push(api.get(base('/club-memberships'), { signal }));
        tasks.push(api.get(base('/invitations'), { signal }).catch(() => ({ data: [] })));
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
      if (route === 'attendance') {
        tasks.push(api.get(base('/attendance'), { signal }));
      }
      if (route === 'activities' && (isCoOwnerOrOwner(currentClub()) || currentClub()?.can_manage_activities || currentClub()?.can_view_activities)) {
        tasks.push(api.get(base('/activities'), { signal }));
      }
      if (route === 'profile') {
        tasks.push(api.get(base('/my-player'), { signal }));
      }
      if (route === 'club') {
        tasks.push(api.get(base('/invitations'), { signal }).catch(() => ({ data: [] })));
        tasks.push(api.get(base('/public-settings'), { signal }).catch(() => ({ data: null })));
      }
      if (
        route === 'dashboard' ||
        route === 'members' ||
        (route === 'team-roster' && /^\d+$/.test(s.teamRosterId))
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
        s.clubMemberships = results[2] ? unpackList(results[2]).rows : [];
        s.clubInvitations = results[3]?.data || [];
      }
      if (route === 'finance' && results[1]) s.finance = results[1];
      if (route === 'finance' && results[2]) {
        s.plannedExpenses = results[2].data;
      }
      if (route === 'dues') s.dues = results[1]?.data || [];
      if (route === 'attendance' && results[1]) {
        s.activities = { ...s.activities, trainings: results[1].data?.trainings || [] };
      }
      if (route === 'activities' && results[1]) {
        s.activities = results[1].data;
      }
      if (route === 'profile') {
        s.myPlayer = results[1]?.data || null;
        s.canClaimPlayer = Boolean(results[1]?.eligible);
      }
      if (route === 'dashboard') s.dashboard = results[1].data;
      if (route === 'club') {
        s.clubInvitations = results[1]?.data || [];
        s.publicSettings = results[2]?.data || null;
      }

      const list = [
        'lineups',
        'matches',
        'inventory',
        'polls',
        'recruitment',
        'club-members',
        'finance',
        'dues',
        'attendance',
        'activities',
        'profile',
        'club',
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

  if (a === 'toggle-sidebar') {
    const shell = document.querySelector('.shell');
    const collapsed = shell ? !shell.classList.contains('sidebar-collapsed') : !isSidebarCollapsed();
    if (shell) shell.classList.toggle('sidebar-collapsed', collapsed);
    try {
      localStorage.setItem('fcms-sidebar-collapsed', collapsed ? '1' : '0');
    } catch {}
    document.querySelectorAll('[data-action="toggle-sidebar"]').forEach((btn) => {
      const label = collapsed ? 'Hiện thanh công cụ' : 'Ẩn thanh công cụ';
      btn.setAttribute('aria-label', label);
      btn.setAttribute('title', label);
      btn.setAttribute('aria-expanded', String(!collapsed));
    });
    return;
  }

  if (a === 'theme') {
    const theme =
      document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
    document.documentElement.dataset.theme = theme;
    syncThemeMeta(theme);
    try {
      localStorage.setItem('fcms-theme', theme);
    } catch {}
    document.querySelectorAll('[data-action="theme"]').forEach((btn) => {
      btn.innerHTML = icon(theme === 'light' ? 'moon' : 'sun');
      btn.setAttribute('title', theme === 'light' ? 'Chuyển sang nền tối' : 'Chuyển sang nền sáng');
    });
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

  if (a === 'open-notifications') {
    if (s.clubId) {
      try {
        const latest = await api.get(base('/notifications'));
        s.notifications = latest.data || { items: [], unread_count: 0 };
        updateNotificationBadge();
      } catch {}
    }
    const items = s.notifications?.items || [];
    const unreadKeys = items.filter((x) => !x.read).map((x) => x.key);
    const host = document.createElement('dialog');
    host.setAttribute('aria-label', 'Thông báo tự động');
    host.innerHTML = `
      <div class="dialog-head">
        <div>
          <h2>Thông báo tự động CLB</h2>
          <p>Cập nhật tự động lịch tập, sinh nhật, nhắc quỹ, cảnh báo kho và hoạt động CLB.</p>
        </div>
        <button type="button" class="icon-button" data-close aria-label="Đóng">${icon('close')}</button>
      </div>
      <div class="dialog-body">
        ${
          unreadKeys.length
            ? `<div style="display:flex;justify-content:flex-end;margin-bottom:10px;">
                <button type="button" class="chip-button primary" data-mark-all-read>Đánh dấu tất cả đã đọc (${number(unreadKeys.length)})</button>
              </div>`
            : ''
        }
        ${
          items.length
            ? `<div class="notif-list">
                ${items
                  .map(
                    (n) => `
                  <a href="${e(n.href || '#dashboard')}" class="notif-item tone-${e(n.tone || 'info')} ${n.read ? 'is-read' : 'is-unread'}" data-notif-key="${e(n.key)}">
                    <div class="notif-item-main">
                      <strong>${!n.read ? '<span class="notif-dot"></span>' : ''}${e(n.title)}</strong>
                      <p>${e(n.body || '')}</p>
                    </div>
                    <small class="tabular-nums">${e(formatDate(n.date))}</small>
                  </a>`
                  )
                  .join('')}
              </div>`
            : '<p class="muted" style="text-align:center;padding:18px 0;">Hiện không có thông báo hay cảnh báo mới nào trong câu lạc bộ.</p>'
        }
      </div>
    `;
    document.body.append(host);
    host.querySelector('[data-close]').onclick = () => host.close();
    host.querySelector('[data-mark-all-read]')?.addEventListener('click', async (ev) => {
      ev.currentTarget.disabled = true;
      try {
        await api.post(base('/notifications/read'), { keys: unreadKeys });
        s.notifications = {
          items: items.map((x) => ({ ...x, read: true })),
          unread_count: 0,
        };
        updateNotificationBadge();
        host.close();
        toast('Đã đánh dấu tất cả thông báo là đã đọc.');
      } catch (err) {
        toast(err.message, true);
      }
    });
    host.querySelectorAll('[data-notif-key]').forEach((link) => {
      link.addEventListener('click', () => {
        const key = link.dataset.notifKey;
        const target = items.find((x) => x.key === key);
        if (target && !target.read && s.clubId) {
          target.read = true;
          s.notifications.unread_count = Math.max(
            0,
            Number(s.notifications.unread_count || 1) - 1
          );
          updateNotificationBadge();
          api.post(base('/notifications/read'), { keys: [key] }).catch(() => {});
        }
        host.close();
      });
    });
    host.addEventListener('close', () => host.remove(), { once: true });
    host.showModal();
    return;
  }

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

  if (a === 'copy-code') {
    const code = el.dataset.code;
    if (code) {
      await navigator.clipboard.writeText(code);
      toast(`Đã sao chép mã mời: ${code}`);
    }
    return;
  }

  if (a === 'revoke-invitation') {
    const id = el.dataset.id;
    if (confirm('Bạn có chắc chắn muốn hủy/xóa mã mời này không? Mã mời sẽ bị xóa vĩnh viễn khỏi hệ thống.')) {
      await api.delete(base(`/invitations/${id}`));
      toast('Đã xóa vĩnh viễn mã mời.');
      await loadView();
    }
    return;
  }

  if (a === 'remove-club-member') {
    const memberId = Number(el.dataset.id);
    const memberName = el.dataset.name || 'thành viên này';
    if (
      confirm(
        `Bạn có chắc chắn muốn xóa "${memberName}" khỏi câu lạc bộ? Tài khoản này sẽ bị thu hồi toàn bộ chức vụ, quyền hạn và xóa khỏi danh sách CLB & BCN.`
      )
    ) {
      await api.delete(base(`/club-memberships/${memberId}`));
      toast(`Đã xóa ${memberName} khỏi câu lạc bộ.`);
      await loadView();
    }
    return;
  }

  if (a === 'admin-tab') {
    s.adminTab = el.dataset.tab;
    history.replaceState(null, '', location.pathname + `#admin?tab=${s.adminTab}`);
    render();
    return;
  }

  if (a === 'admin-enter-club') {
    const clubId = Number(el.dataset.id);
    s.clubId = clubId;
    s.route = 'dashboard';
    history.replaceState(null, '', location.pathname + '#dashboard');
    await loadApp();
    toast('Đã chuyển sang không gian câu lạc bộ.');
    return;
  }

  if (a === 'admin-toggle-club') {
    const clubId = Number(el.dataset.id);
    const newStatus = el.dataset.status;
    const actionName = newStatus === 'archived' ? 'lưu trữ' : 'kích hoạt lại';
    if (confirm(`Bạn có chắc muốn ${actionName} câu lạc bộ này?`)) {
      await api.patch(`/admin/clubs/${clubId}/status`, { status: newStatus });
      toast(`Đã ${actionName} câu lạc bộ.`);
      await loadView();
    }
    return;
  }

  if (a === 'admin-toggle-user-admin') {
    const userId = el.dataset.id;
    const name = el.dataset.name;
    const newIsAdmin = el.dataset.admin === 'true';
    const msg = newIsAdmin
      ? `Cấp quyền Quản trị viên hệ thống (System Admin) cho "${name}"?`
      : `Thu hồi quyền Quản trị viên hệ thống của "${name}"?`;
    if (confirm(msg)) {
      await api.patch(`/admin/users/${userId}/admin`, { is_admin: newIsAdmin });
      toast(newIsAdmin ? `Đã cấp quyền Quản trị viên cho ${name}.` : `Đã hạ quyền của ${name}.`);
      await loadView();
    }
    return;
  }

  if (a === 'admin-toggle-user-active') {
    const userId = el.dataset.id;
    const name = el.dataset.name;
    const newIsActive = el.dataset.active === 'true';
    const msg = newIsActive
      ? `Mở khóa tài khoản "${name}"?`
      : `Khóa tài khoản "${name}"? Tài khoản này sẽ không thể đăng nhập.`;
    if (confirm(msg)) {
      await api.patch(`/admin/users/${userId}/active`, { is_active: newIsActive });
      toast(newIsActive ? `Đã kích hoạt tài khoản ${name}.` : `Đã khóa tài khoản ${name}.`);
      await loadView();
    }
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

// Đồng bộ ô nhập ngày dd/mm/yyyy với input[type="date"] gốc trên toàn bộ ứng dụng & modal
document.addEventListener('click', (event) => {
  const btn = event.target.closest('[data-date-picker-btn]');
  if (!btn) return;
  const wrap = btn.closest('.date-input-wrap');
  const nativeInput = wrap?.querySelector('input[type="date"]');
  if (!nativeInput) return;
  if (typeof nativeInput.showPicker === 'function') {
    try {
      nativeInput.showPicker();
      return;
    } catch {}
  }
  nativeInput.focus();
  nativeInput.click();
});

document.addEventListener('input', (event) => {
  const display = event.target.closest?.('[data-date-display]');
  if (!display) return;
  const wrap = display.closest('.date-input-wrap');
  const nativeInput = wrap?.querySelector('input[type="date"]');
  if (!nativeInput) return;

  const digits = display.value.replace(/\D/g, '').slice(0, 8);
  let formatted = digits;
  if (digits.length > 4) {
    formatted = `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
  } else if (digits.length > 2) {
    formatted = `${digits.slice(0, 2)}/${digits.slice(2)}`;
  }
  if (display.value !== formatted) display.value = formatted;

  if (!digits.length) {
    display.setCustomValidity('');
    if (nativeInput.value !== '') {
      nativeInput.value = '';
      nativeInput.dispatchEvent(new Event('input', { bubbles: true }));
      nativeInput.dispatchEvent(new Event('change', { bubbles: true }));
    }
    return;
  }

  if (digits.length === 8) {
    const iso = `${digits.slice(4, 8)}-${digits.slice(2, 4)}-${digits.slice(0, 2)}`;
    if (validDate(iso)) {
      display.setCustomValidity('');
      if (nativeInput.value !== iso) {
        nativeInput.value = iso;
        nativeInput.dispatchEvent(new Event('input', { bubbles: true }));
        nativeInput.dispatchEvent(new Event('change', { bubbles: true }));
      }
    } else {
      display.setCustomValidity('Ngày không hợp lệ (định dạng dd/mm/yyyy).');
    }
  } else {
    display.setCustomValidity('Vui lòng nhập đủ ngày theo định dạng dd/mm/yyyy.');
  }
});

document.addEventListener('change', (event) => {
  const nativeInput = event.target;
  if (!nativeInput?.matches?.('.date-input-wrap input[type="date"]')) return;
  const display = nativeInput.closest('.date-input-wrap')?.querySelector('[data-date-display]');
  if (!display) return;
  display.setCustomValidity('');
  display.value = formatDate(nativeInput.value);
});

root.addEventListener('change', (event) => {
  if (event.target.matches('[data-birthday-month]')) {
    s.birthdayMonth = event.target.value;
    s.birthdayPage = 1;
    render();
    root.querySelector('[data-birthday-month]')?.focus();
    return;
  }

  if (
    event.target.matches(
      '[data-training-date], [data-training-team], [data-training-sort]'
    )
  ) {
    const isDateChange = event.target.matches('[data-training-date]');
    if (isDateChange) s.trainingFilterDate = event.target.value;
    if (event.target.matches('[data-training-team]'))
      s.trainingFilterTeam = event.target.value;
    if (event.target.matches('[data-training-sort]'))
      s.trainingSort = event.target.value;
    render();
    if (isDateChange) {
      root.querySelector('.training-filter-item [data-date-display]')?.focus();
    }
    return;
  }

  if (event.target.matches('[data-board-members-sort]')) {
    s.boardSort = event.target.value;
    render();
    return;
  }

  if (event.target.matches('[data-memberships-sort]')) {
    s.membershipsSort = event.target.value;
    render();
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
    s.financePage = 1;
    s.financeAdjustmentPage = 1;
    s.duesSearch = '';
    s.duesTeam = '';
    s.duesStatus = '';
    s.inventoryPage = 1;
    s.inventorySearch = '';
    s.inventoryLowStock = false;
    s.inventoryArchived = false;
    s.pollsPage = 1;
    s.recruitmentPage = 1;
    s.recruitmentStatus = '';
    s.trainingFilterDate = '';
    s.trainingFilterTeam = '';
    s.trainingSort = 'asc';
    s.boardSort = 'title';
    s.membershipsSort = 'role';
    s.filters = { q: '', team_id: '', status: '', page: 1 };
    if (s.route === 'team-roster') {
      s.teamRosterId = '';
      s.route = 'teams';
      history.replaceState(null, '', location.pathname + '#teams');
    }
    loadView();
  }
});

root.addEventListener('submit', (event) => {
  const form = event.target.closest('[data-form]');
  if (!form) return;
  event.preventDefault();

  const kind = form.dataset.form;

  if (kind === 'public-recruitment-apply') {
    submit(form, kind, async (data) => {
      if (!data.full_name) {
        throw new Error('Vui lòng nhập họ và tên ứng viên.');
      }
      if (!data.phone && !data.email) {
        throw new Error('Vui lòng nhập số điện thoại hoặc email liên hệ.');
      }
      await api.post(
        `/public/clubs/${encodeURIComponent(data.club_id)}/apply`,
        {
          post_id: Number(data.post_id),
          full_name: data.full_name,
          date_of_birth: data.date_of_birth || null,
          phone: data.phone || null,
          email: data.email || null,
          notes: data.notes || null,
        },
        { silentUnauthorized: true }
      );
      form.reset();
      toast('Đã gửi hồ sơ ứng tuyển thành công! Ban nhân sự CLB sẽ liên hệ với bạn.');
    });
    return;
  }

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
      if (s.user?.is_system_admin) {
        s.route = 'admin';
        history.replaceState(null, '', location.pathname + '#admin');
      }
      await loadApp();
      toast('Chào mừng bạn đến với FCMS PRO!');
    }
    if (kind === 'profile') {
      s.user = (await api.patch('/auth/profile', data)).data;
      render();
      toast('Đã cập nhật tài khoản.');
    }
    if (kind === 'accept') {
      let token = String(data.token || '').trim();
      const match = token.match(/token=([^&#]+)/);
      if (match) token = decodeURIComponent(match[1]).trim();

      const response = await api.post('/invitations/accept', {
        token,
      });
      s.invite = '';
      s.clubId = response.data.id;
      s.route = 'dashboard';
      history.replaceState(null, '', location.pathname + '#dashboard');
      await loadApp();
      const clubName = response.data.club_name || 'Câu lạc bộ';
      const roleTitle = response.data.title || 'Thành viên';
      toast(`Đã tham gia ${clubName} với vai trò ${roleTitle}!`);
    }
  });
});

root.addEventListener('input', (event) => {
  if (event.target.hasAttribute('data-admin-search')) {
    s.adminQuery = event.target.value;
    render();
    const searchInput = root.querySelector('[data-admin-search]');
    if (searchInput) {
      searchInput.focus();
      searchInput.setSelectionRange(s.adminQuery.length, s.adminQuery.length);
    }
    return;
  }
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
    if (
      s.user?.is_system_admin &&
      (!location.hash || location.hash === '#dashboard' || location.hash === '#')
    ) {
      s.route = 'admin';
      history.replaceState(null, '', location.pathname + '#admin');
    }
    return loadApp();
  })
  .catch(() => {
    if (s.route === 'public-club') {
      loadView();
      return;
    }
    s.loading = false;
    render();
  });
