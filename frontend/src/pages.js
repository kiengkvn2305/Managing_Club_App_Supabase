import { state as s, currentClub } from './state.js';
import {
  escapeHtml as e,
  number,
  canManageRoster,
  canManageClub,
} from './utils.js';
import { icon, button, empty } from './components/ui.js';
import { clubDirectoryPage, teamRosterPage } from './roster-pages.js';
import { duesPage } from './dues-page.js';
import { financePage } from './finance-page.js';
import { discoveryPage } from './discovery-page.js';
import { matchesPage } from './matches-page.js';
import { inventoryPage } from './inventory-page.js';
import { pollsPage } from './polls-page.js';
import { recruitmentPage } from './recruitment-page.js';
import { dashboardPage } from './views/dashboard-page.js';
import { boardPage } from './views/board-page.js';
import { activitiesPage } from './views/activities-page.js';
import { clubPage } from './views/club-page.js';
import { adminPage } from './views/admin-page.js';
import { profilePage, acceptPage } from './views/profile-page.js';
import { authPage } from './views/auth-page.js';

export { authPage };

export const titles = {
  dashboard: 'Tổng quan',
  members: 'Thành viên',
  teams: 'Đội bóng',
  'team-roster': 'Thành viên đội bóng',
  finance: 'Sổ thu chi CLB',
  dues: 'Đóng quỹ',
  activities: 'Hoạt động CLB',
  inventory: 'Kho trang bị',
  'club-members': 'Thành viên BCN',
  club: 'Câu lạc bộ',
  profile: 'Tài khoản',
  accept: 'Nhận lời mời',
  roadmap: 'Lộ trình',
  admin: 'Quản trị hệ thống',
};

const heading = (title, text, actions = '') => `
  <div class="page-top">
    <div>
      <div class="eyebrow">KHÔNG GIAN CÂU LẠC BỘ</div>
      <h1>${title}</h1>
      <p>${text}</p>
    </div>
    <div class="page-actions">${actions}</div>
  </div>
`;

function teams() {
  const c = currentClub();
  return (
    heading(
      'Đội bóng',
      'Tổ chức đội hình cho từng sân chơi và mục tiêu.',
      canManageRoster(c) ? button('new-team', 'Tạo đội bóng') : ''
    ) +
    (s.teams.length
      ? `<div class="team-grid">${s.teams
          .map(
            (t) => `
          <section class="panel team-card">
            <div class="team-symbol">${icon('shield')}</div>
            <span class="pill">SÂN ${e(t.format)} NGƯỜI</span>
            <h2>${e(t.name)}</h2>
            <p>${e(c.name)} - ${number(t.members_count)} thành viên</p>
            ${
              c?.can_view_finance
                ? `<p>Quỹ gần nhất: ${t.monthly_dues ? `${e(number(t.monthly_dues.amount))} đ/tháng · từ ${e(t.monthly_dues.effective_month.slice(0, 7))}` : 'Chưa thiết lập'}</p>`
                : ''
            }
            ${
              canManageRoster(c)
                ? `<p>Đội trưởng: ${e(t.captain_name || 'Chưa chọn')}<br>Quản lý: ${e((t.managers || []).map((m) => m.name).join(', ') || 'Chưa chọn')}</p>
                   <div class="team-actions">
                     <button class="text-button" data-action="team-members" data-id="${t.id}">Xem thành viên →</button>
                     <button class="text-button" data-action="rename-team" data-id="${t.id}">Chỉnh sửa</button>
                     <button class="text-button danger" data-action="delete-team" data-id="${t.id}">Xóa đội</button>
                   </div>`
                : ''
            }
            ${
              c?.can_manage_finance && !canManageRoster(c)
                ? `<button class="text-button" data-action="edit-dues-rate" data-id="${t.id}">Chỉnh sửa quỹ</button>`
                : ''
            }
          </section>`
          )
          .join('')}</div>`
      : `<section class="panel">${empty('Một đội hình mới đang chờ', 'Tạo đội sân 5, 7 hoặc 11 người để sắp xếp các thành viên.')}</section>`)
  );
}

function lineups() {
  if (!canManageRoster(currentClub())) {
    return (
      heading(
        'Đội hình trận đấu',
        'Thông tin được bảo vệ theo quyền truy cập.'
      ) +
      `<section class="panel">${empty('Quyền truy cập được bảo vệ', 'Bạn không có quyền quản lý đội hình trận đấu.')}</section>`
    );
  }
  return (
    heading(
      'Đội hình trận đấu',
      'Tạo đội hình cho từng trận và sắp xếp cầu thủ trên sân.',
      button('new-lineup', 'Tạo đội hình')
    ) +
    `<section class="panel">
      <div class="panel-head"><h2>Các trận đã lưu</h2></div>
      ${
        s.lineups.length
          ? s.lineups
              .map(
                (item) => `
            <div class="member-row">
              <div>
                <strong>${e(s.teams.find((team) => String(team.id) === String(item.team_id))?.name || 'Đội bóng')} — ${e(item.opponent)}</strong>
                <small>${e(item.match_date)} · ${e(item.formation || 'Chưa đặt sơ đồ')} · ${item.players.filter((p) => p.role === 'starter').length} đá chính · ${item.players.filter((p) => p.role === 'substitute').length} dự bị</small>
              </div>
              <button class="text-button" data-action="edit-lineup" data-id="${item.id}">Chỉnh sửa</button>
            </div>`
              )
              .join('')
          : empty(
              'Chưa có đội hình',
              'Tạo đội hình cho trận đấu đầu tiên.',
              'new-lineup',
              'Tạo đội hình'
            )
      }
    </section>`
  );
}

function roadmap() {
  const sections = [
    [
      'Nền tảng & tài khoản',
      'ĐANG HOÀN THIỆN',
      'Đã có đăng nhập, xác minh email, ảnh đại diện và đổi/khôi phục mật khẩu. Gửi email thực cần cấu hình; quản lý phiên và chuyển quyền sở hữu vẫn cần phát triển.',
      '#profile',
      'Tài khoản',
    ],
    [
      'CLB & thành viên',
      'ĐÃ CÓ MỘT PHẦN',
      'Đã có nhiều CLB, đội bóng, thành viên, chọn ảnh, danh sách và nhập/xuất Excel. Liên kết tài khoản với hồ sơ và quản lý vai trò nâng cao còn thiếu.',
      '#members',
      'Thành viên',
    ],
    [
      'Tài chính & quỹ',
      'ĐÃ CÓ MỘT PHẦN',
      'Đã có sổ thu chi, chi dự kiến hằng tháng, biểu đồ, đóng quỹ, công nợ và điều chỉnh. Phê duyệt tài chính, khóa kỳ và đối soát nâng cao còn thiếu.',
      '#finance',
      'Sổ thu chi',
    ],
    [
      'Kho trang bị',
      'ĐÃ CÓ MỘT PHẦN',
      'Đã có danh mục, nhập/xuất, kiểm kê từng vật tư, cấp phát/thu hồi và lịch sử. Báo cáo và xử lý hỏng/mất còn thiếu.',
      '#inventory',
      'Kho trang bị',
    ],
    [
      'Tính năng mở rộng',
      'CHƯA TRIỂN KHAI',
      'Tài trợ, website CLB đầy đủ và tự động hóa vẫn nằm trong lộ trình.',
      '#roadmap',
      'Xem lộ trình',
    ],
  ];

  return (
    heading(
      'Lộ trình phát triển',
      'Theo dõi tính năng đã có và những phần còn đang xây dựng.'
    ) +
    `<div class="team-grid">
      ${sections
        .map(
          ([title, status, text, link, label]) => `
        <section class="panel roadmap-card">
          <span class="pill">${e(status)}</span>
          <h2>${e(title)}</h2>
          <p>${e(text)}</p>
          ${link !== '#roadmap' ? `<a class="text-link" href="${link}">${e(label)} →</a>` : ''}
        </section>`
        )
        .join('')}
    </div>`
  );
}

export function page() {
  if (s.loading) {
    return '<div class="panel loading" role="status"><div class="spinner"></div>Đang tải dữ liệu câu lạc bộ…</div>';
  }

  if (s.error) {
    return `${heading(titles[s.route] || 'Tổng quan', 'Dữ liệu cần được tải lại.')}<div class="panel">${empty('Chưa tải được dữ liệu', e(s.error), 'retry', 'Thử lại')}</div>`;
  }

  if (s.route === 'profile') return profilePage();
  if (s.route === 'accept') return acceptPage();
  if (s.route === 'roadmap') return roadmap();
  if (s.route === 'discover') return discoveryPage();
  if (s.route === 'admin') return adminPage();

  if (!currentClub()) {
    return (
      heading(
        'Câu lạc bộ bắt đầu từ bạn',
        'Tạo không gian đầu tiên và cùng nhau xây dựng đội bóng.'
      ) +
      `<section class="panel">
        ${empty('Chào mừng đến với FCMS PRO', 'Tạo câu lạc bộ của bạn hoặc nhận lời mời từ ban quản lý.', 'new-club', 'Tạo câu lạc bộ')}
        <p class="center"><a class="text-link" href="#accept">Đã có mã mời? Tham gia câu lạc bộ →</a></p>
      </section>`
    );
  }

  const routes = {
    dashboard: dashboardPage,
    members: clubDirectoryPage,
    'team-roster': teamRosterPage,
    teams,
    lineups,
    matches: matchesPage,
    inventory: () =>
      currentClub()?.can_view_inventory
        ? inventoryPage({
            inventory: s.inventory,
            canManage: currentClub()?.can_manage_inventory,
            search: s.inventorySearch,
            lowStock: s.inventoryLowStock,
            archived: s.inventoryArchived,
          })
        : heading('Kho trang bị', 'Thông tin được bảo vệ theo quyền truy cập.') +
          `<section class="panel">${empty('Quyền truy cập được bảo vệ', 'Bạn không có quyền xem kho trang bị.')}</section>`,
    polls: () =>
      pollsPage({
        polls: s.polls,
        canCreate:
          canManageClub(currentClub()) &&
          currentClub()?.status === 'active',
        canVote: currentClub()?.status === 'active',
      }),
    recruitment: () =>
      canManageRoster(currentClub())
        ? recruitmentPage({
            recruitment: s.recruitment,
            canManage: currentClub()?.status === 'active',
            status: s.recruitmentStatus,
          })
        : heading('Tuyển dụng', 'Thông tin được bảo vệ theo quyền truy cập.') +
          `<section class="panel">${empty('Quyền truy cập được bảo vệ', 'Bạn không có quyền xem tuyển dụng.')}</section>`,
    finance: financePage,
    dues: duesPage,
    activities: activitiesPage,
    'club-members': boardPage,
    club: clubPage,
  };

  return (routes[s.route] || dashboardPage)();
}
