import { state as s, currentClub } from './state.js';
import {
  escapeHtml as e,
  number,
  canManageRoster,
  canManageClub,
  formatDate,
  formatMonth,
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
import { attendancePage } from './views/attendance-page.js';
import { clubPage } from './views/club-page.js';
import { publicClubPage } from './views/public-club-page.js';
import { adminPage } from './views/admin-page.js';
import { profilePage, acceptPage } from './views/profile-page.js';
import { authPage } from './views/auth-page.js';

export { authPage, publicClubPage };

export const titles = {
  dashboard: 'Tổng quan',
  members: 'Thành viên',
  teams: 'Đội bóng',
  'team-roster': 'Thành viên đội bóng',
  finance: 'Sổ thu chi CLB',
  dues: 'Đóng quỹ',
  attendance: 'Điểm danh',
  activities: 'Hoạt động CLB',
  inventory: 'Kho trang bị',
  'club-members': 'Thành viên BCN',
  club: 'Câu lạc bộ',
  discover: 'Khám phá & Giao hữu',
  recruitment: 'Tuyển thành viên',
  polls: 'Biểu quyết CLB',
  matches: 'Trận đấu',
  lineups: 'Đội hình trận đấu',
  'public-club': 'Cổng thông tin CLB',
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
      'Tổ chức đội hình cho từng sân chơi và mục tiêu thi đấu.',
      canManageRoster(c) ? button('new-team', 'Tạo đội bóng') : ''
    ) +
    (s.teams.length
      ? `<div class="team-grid">${s.teams
          .map(
            (t) => `
          <section class="panel team-card">
            <div class="team-card-top">
              <div class="team-symbol">${icon('shield')}</div>
              <div class="team-card-badges">
                <span class="pill">SÂN ${e(t.format)} NGƯỜI</span>
                <span class="badge">${number(t.members_count)} cầu thủ</span>
              </div>
            </div>
            <h2>${e(t.name)}</h2>
            <p class="team-card-club">${e(c.name)}</p>
            <div class="team-specs">
              <div>
                <span>Đội trưởng</span>
                <strong>${t.captain_name ? `<b class="armband-tag">C</b> ${e(t.captain_name)}` : 'Chưa chọn'}</strong>
              </div>
              <div>
                <span>Ban quản lý</span>
                <strong>${e((t.managers || []).map((m) => m.name).join(', ') || 'Chưa chọn')}</strong>
              </div>
              ${
                c?.can_view_finance
                  ? `<div>
                      <span>Mức quỹ tháng</span>
                      <strong>${t.monthly_dues ? `${e(number(t.monthly_dues.amount))} đ · từ ${e(formatMonth(t.monthly_dues.effective_month))}` : 'Chưa thiết lập'}</strong>
                    </div>`
                  : ''
              }
            </div>
            <div class="team-actions team-card-footer">
              <button class="chip-button primary" data-action="team-members" data-id="${t.id}">Xem đội hình →</button>
              ${
                canManageRoster(c)
                  ? `<button class="chip-button" data-action="select-team-players" data-id="${t.id}">Chọn thành viên</button>
                     <button class="chip-button" data-action="team-captain" data-id="${t.id}">Chọn đội trưởng</button>
                     <button class="chip-button" data-action="rename-team" data-id="${t.id}">Chỉnh sửa</button>
                     <button class="chip-button danger" data-action="delete-team" data-id="${t.id}">Xóa đội</button>`
                  : ''
              }
              ${
                c?.can_manage_finance && !canManageRoster(c)
                  ? `<button class="chip-button" data-action="edit-dues-rate" data-id="${t.id}">Chỉnh sửa quỹ</button>`
                  : ''
              }
            </div>
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
                <small>${e(formatDate(item.match_date))} · ${e(item.formation || 'Chưa đặt sơ đồ')} · ${item.players.filter((p) => p.role === 'starter').length} đá chính · ${item.players.filter((p) => p.role === 'substitute').length} dự bị</small>
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
      'Nền tảng, Tài khoản & Quản trị',
      'ĐÃ HOÀN THIỆN',
      'Đăng ký, đăng nhập, xác minh email, đổi/khôi phục mật khẩu, giao diện sáng/tối, ảnh nền CLB, thanh công cụ ẩn/hiện và cổng Quản trị hệ thống.',
      '#profile',
      'Tài khoản',
    ],
    [
      'CLB, Đội bóng & Phân quyền BCN',
      'ĐÃ HOÀN THIỆN',
      'Quản lý nhiều CLB, đội bóng, chọn đội trưởng trực quan, kiểm tra trùng số áo, phân vùng quyền BCN (Chủ nhiệm, Phó chủ nhiệm, Thủ quỹ, Truyền thông, Đối ngoại), mã mời và Excel 500 dòng.',
      '#members',
      'Thành viên',
    ],
    [
      'Điểm danh & Hoạt động CLB',
      'ĐÃ HOÀN THIỆN',
      'Mục Điểm danh tách riêng với phân quyền độc lập, tự ghi vắng sau 10 phút và bảng tiến độ chuyên cần; Hoạt động CLB quản lý dịp lễ, sinh nhật và khen thưởng.',
      '#attendance',
      'Điểm danh',
    ],
    [
      'Tài chính & Đóng quỹ',
      'ĐÃ HOÀN THIỆN',
      'Sổ thu chi qua RPC giao dịch bảo mật, đảo bút toán đối ứng, khóa kỳ kế toán, biểu đồ cột đôi dòng tiền ròng, chi dự kiến hằng tháng, đóng quỹ, phí duy trì và xuất Excel.',
      '#finance',
      'Sổ thu chi',
    ],
    [
      'Kho trang bị & Kiểm soát sự cố',
      'ĐÃ HOÀN THIỆN',
      'Danh mục trang bị, nhập/xuất/kiểm kê kho, cảnh báo tồn thấp, cấp phát/thu hồi tài sản cho thành viên và báo cáo xử lý hỏng/mất thiết bị.',
      '#inventory',
      'Kho trang bị',
    ],
    [
      'Trang công khai, Tuyển quân & Thông báo tự động',
      'ĐÃ HOÀN THIỆN',
      'Cổng thông tin công khai CLB nâng cao không cần đăng nhập, nhận đơn ứng tuyển trực tuyến, kết nạp ứng viên, mời giao hữu và trung tâm thông báo tự động theo vai trò.',
      '#club',
      'Câu lạc bộ',
    ],
  ];

  return (
    heading(
      'Lộ trình phát triển',
      'Toàn bộ các phân hệ mục tiêu trong lộ trình phát triển đã được triển khai và đồng bộ hoàn chỉnh.'
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

  if (s.route === 'public-club') return publicClubPage();
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
    attendance: attendancePage,
    activities: activitiesPage,
    'club-members': boardPage,
    club: clubPage,
  };

  return (routes[s.route] || dashboardPage)();
}
