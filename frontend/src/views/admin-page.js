import { state as s } from '../state.js';
import { escapeHtml as e, number, formatDate } from '../utils.js';
import { icon, button, empty } from '../components/ui.js';
import { avatar, imageUrl } from '../images.js';

export function adminPage() {
  if (!s.user?.is_system_admin) {
    return `
      <div class="page-top">
        <div>
          <div class="eyebrow">BẢO MẬT HỆ THỐNG</div>
          <h1>Truy cập bị từ chối</h1>
          <p>Trang này chỉ dành riêng cho Quản trị viên hệ thống (System Administrator).</p>
        </div>
      </div>
      <section class="panel">
        ${empty('Quyền truy cập bị từ chối', 'Bạn không có quyền quản trị phần mềm.', 'dashboard', 'Về trang chủ')}
      </section>
    `;
  }

  const stats = s.adminStats || {
    total_clubs: 0,
    active_clubs: 0,
    archived_clubs: 0,
    total_users: 0,
    active_users: 0,
    admin_users: 0,
    total_players: 0,
    total_transactions: 0,
    total_income: 0,
    total_expense: 0,
  };

  const clubs = s.adminClubs || [];
  const users = s.adminUsers || [];
  const activeTab = s.adminTab || 'overview';
  const query = (s.adminQuery || '').toLowerCase().trim();

  const filteredClubs = query
    ? clubs.filter(
        (c) =>
          c.name?.toLowerCase().includes(query) ||
          c.city?.toLowerCase().includes(query) ||
          c.owner_name?.toLowerCase().includes(query) ||
          c.owner_email?.toLowerCase().includes(query)
      )
    : clubs;

  const filteredUsers = query
    ? users.filter(
        (u) =>
          u.name?.toLowerCase().includes(query) ||
          u.email?.toLowerCase().includes(query)
      )
    : users;

  return `
    <div class="page-top">
      <div>
        <div class="eyebrow" style="color:var(--primary);display:flex;align-items:center;gap:0.35rem;">
          ${icon('shield')} TRANG QUẢN TRỊ TOÀN PHẦN MỀM (SYSTEM ADMIN)
        </div>
        <h1>Tổng Quản Trị Hệ Thống FCMS PRO</h1>
        <p>Bảng điều khiển tối cao: Giám sát toàn bộ Câu lạc bộ, Tài khoản người dùng và Phân quyền phần mềm.</p>
      </div>
      <div class="page-actions">
        ${
          s.clubs?.length
            ? `<a href="#dashboard" class="button secondary" style="text-decoration:none;display:inline-flex;align-items:center;gap:0.5rem;">
                ${icon('layers')}<span>Vào Không gian CLB</span>
              </a>`
            : ''
        }
      </div>
    </div>

    <!-- Overview Stats Cards -->
    <div class="dashboard-grid" style="grid-template-columns:repeat(auto-fit, minmax(240px, 1fr));gap:1rem;margin-bottom:1.5rem;">
      <article class="panel stat-card" style="padding:1.25rem;">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;">
          <div>
            <small style="color:var(--muted);text-transform:uppercase;font-size:0.75rem;letter-spacing:0.5px;">CÂU LẠC BỘ TOÀN HỆ THỐNG</small>
            <div style="font-size:2rem;font-weight:700;margin:0.25rem 0;color:var(--text);">${stats.total_clubs}</div>
            <p style="margin:0;font-size:0.875rem;color:var(--muted);">
              <span style="color:var(--success,#28a745);">● ${stats.active_clubs} hoạt động</span> · <span>${stats.archived_clubs} lưu trữ</span>
            </p>
          </div>
          <div style="padding:0.6rem;background:var(--accent-surface,#f0f7ff);border-radius:10px;color:var(--primary);">
            ${icon('shield')}
          </div>
        </div>
      </article>

      <article class="panel stat-card" style="padding:1.25rem;">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;">
          <div>
            <small style="color:var(--muted);text-transform:uppercase;font-size:0.75rem;letter-spacing:0.5px;">NGƯỜI DÙNG & TÀI KHOẢN</small>
            <div style="font-size:2rem;font-weight:700;margin:0.25rem 0;color:var(--text);">${stats.total_users}</div>
            <p style="margin:0;font-size:0.875rem;color:var(--muted);">
              <span>${stats.active_users} kích hoạt</span> · <span style="color:var(--primary,#0066cc);">👑 ${stats.admin_users} Quản trị viên</span>
            </p>
          </div>
          <div style="padding:0.6rem;background:var(--accent-surface,#f0f7ff);border-radius:10px;color:var(--primary);">
            ${icon('users')}
          </div>
        </div>
      </article>

      <article class="panel stat-card" style="padding:1.25rem;">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;">
          <div>
            <small style="color:var(--muted);text-transform:uppercase;font-size:0.75rem;letter-spacing:0.5px;">HỒ SƠ THÀNH VIÊN / CẦU THỦ</small>
            <div style="font-size:2rem;font-weight:700;margin:0.25rem 0;color:var(--text);">${stats.total_players}</div>
            <p style="margin:0;font-size:0.875rem;color:var(--muted);">
              Cầu thủ & thành viên trong các câu lạc bộ
            </p>
          </div>
          <div style="padding:0.6rem;background:var(--accent-surface,#f0f7ff);border-radius:10px;color:var(--primary);">
            ${icon('user')}
          </div>
        </div>
      </article>

      <article class="panel stat-card" style="padding:1.25rem;">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;">
          <div>
            <small style="color:var(--muted);text-transform:uppercase;font-size:0.75rem;letter-spacing:0.5px;">GIAO DỊCH TÀI CHÍNH</small>
            <div style="font-size:2rem;font-weight:700;margin:0.25rem 0;color:var(--text);">${stats.total_transactions}</div>
            <p style="margin:0;font-size:0.875rem;color:var(--muted);">
              Thu: <strong style="color:var(--success,#28a745);">${number(stats.total_income)} đ</strong>
            </p>
          </div>
          <div style="padding:0.6rem;background:var(--accent-surface,#f0f7ff);border-radius:10px;color:var(--primary);">
            ${icon('layers')}
          </div>
        </div>
      </article>
    </div>

    <!-- Navigation Tabs -->
    <div style="display:flex;gap:0.5rem;margin-bottom:1.5rem;border-bottom:1px solid var(--border);padding-bottom:0.75rem;overflow-x:auto;">
      <button type="button" class="tab-button ${activeTab === 'overview' ? 'active' : ''}" data-action="admin-tab" data-tab="overview" style="padding:0.5rem 1rem;font-weight:600;border-radius:6px;cursor:pointer;border:none;background:${activeTab === 'overview' ? 'var(--primary)' : 'transparent'};color:${activeTab === 'overview' ? '#fff' : 'var(--text)'};">
        ${icon('grid')} Tổng quan hệ thống
      </button>
      <button type="button" class="tab-button ${activeTab === 'clubs' ? 'active' : ''}" data-action="admin-tab" data-tab="clubs" style="padding:0.5rem 1rem;font-weight:600;border-radius:6px;cursor:pointer;border:none;background:${activeTab === 'clubs' ? 'var(--primary)' : 'transparent'};color:${activeTab === 'clubs' ? '#fff' : 'var(--text)'};">
        ${icon('shield')} Quản lý Câu lạc bộ (${clubs.length})
      </button>
      <button type="button" class="tab-button ${activeTab === 'users' ? 'active' : ''}" data-action="admin-tab" data-tab="users" style="padding:0.5rem 1rem;font-weight:600;border-radius:6px;cursor:pointer;border:none;background:${activeTab === 'users' ? 'var(--primary)' : 'transparent'};color:${activeTab === 'users' ? '#fff' : 'var(--text)'};">
        ${icon('users')} Quản lý Người dùng & Phân quyền (${users.length})
      </button>
    </div>

    <!-- TAB 1: OVERVIEW -->
    ${
      activeTab === 'overview'
        ? `
        <div class="dashboard-grid">
          <section class="panel">
            <div class="panel-head">
              <h2>Câu lạc bộ mới thành lập gần đây</h2>
              <button type="button" class="text-button" data-action="admin-tab" data-tab="clubs">Xem tất cả (${clubs.length}) →</button>
            </div>
            <div class="panel-body">
              ${
                clubs.slice(0, 5).length
                  ? `
                <div class="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Tên CLB</th>
                        <th>Chủ nhiệm</th>
                        <th>Khu vực</th>
                        <th>Thành viên</th>
                        <th class="text-center">Trạng thái</th>
                        <th class="text-right">Thao tác</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${clubs
                        .slice(0, 5)
                        .map(
                          (c) => `
                        <tr>
                          <td><strong>${e(c.name)}</strong></td>
                          <td>${e(c.owner_name || 'Chưa có')} <small class="muted">(${e(c.owner_email || '—')})</small></td>
                          <td>${e(c.city || '—')}</td>
                          <td><strong>${c.member_count || 0}</strong> thành viên</td>
                          <td class="text-center">
                            <span class="badge ${c.status === 'active' ? 'active' : 'injured'}">${c.status === 'active' ? 'Đang hoạt động' : 'Lưu trữ'}</span>
                          </td>
                          <td class="text-right">
                            <button type="button" class="button secondary" data-action="admin-enter-club" data-id="${c.id}" style="padding:0.35rem 0.75rem;font-size:0.85rem;">
                              Vào quản lý
                            </button>
                          </td>
                        </tr>
                      `
                        )
                        .join('')}
                    </tbody>
                  </table>
                </div>
              `
                  : empty('Chưa có CLB nào', 'Hệ thống chưa ghi nhận CLB nào.')
              }
            </div>
          </section>

          <section class="panel">
            <div class="panel-head">
              <h2>Tài khoản người dùng mới nhất</h2>
              <button type="button" class="text-button" data-action="admin-tab" data-tab="users">Xem tất cả (${users.length}) →</button>
            </div>
            <div class="panel-body">
              ${
                users.slice(0, 5).length
                  ? `
                <div class="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Họ tên</th>
                        <th>Email</th>
                        <th>Vai trò</th>
                        <th class="text-center">Trạng thái</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${users
                        .slice(0, 5)
                        .map(
                          (u) => `
                        <tr>
                          <td><strong>${e(u.name || 'Người dùng')}</strong></td>
                          <td>${e(u.email)}</td>
                          <td>
                            ${u.is_system_admin ? '<span class="badge" style="background:#ffd700;color:#000;font-weight:700;">👑 Quản trị viên</span>' : '<span class="badge secondary">Người dùng</span>'}
                          </td>
                          <td class="text-center">
                            <span class="badge ${u.is_active ? 'active' : 'injured'}">${u.is_active ? 'Hoạt động' : 'Đã khóa'}</span>
                          </td>
                        </tr>
                      `
                        )
                        .join('')}
                    </tbody>
                  </table>
                </div>
              `
                  : empty('Chưa có người dùng', 'Hệ thống chưa có người dùng nào.')
              }
            </div>
          </section>
        </div>
      `
        : ''
    }

    <!-- TAB 2: CLUBS MANAGEMENT -->
    ${
      activeTab === 'clubs'
        ? `
        <section class="panel">
          <div class="panel-head">
            <div>
              <h2>Danh sách Câu lạc bộ toàn hệ thống (${filteredClubs.length})</h2>
              <p class="muted">Quản trị toàn bộ các CLB, truy cập vào CLB bất kỳ hoặc điều chỉnh trạng thái hoạt động.</p>
            </div>
          </div>
          <div class="panel-body">
            <div style="margin-bottom:1rem;">
              <input type="search" data-admin-search placeholder="Tìm theo tên CLB, thành phố, chủ nhiệm..." value="${e(query)}" style="max-width:400px;width:100%;">
            </div>
            ${
              filteredClubs.length
                ? `
              <div class="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Tên câu lạc bộ</th>
                      <th>Chủ nhiệm sáng lập</th>
                      <th>Khu vực & Sân</th>
                      <th>Loại sân</th>
                      <th class="tabular-nums">Ngày hoạt động</th>
                      <th>Thành viên</th>
                      <th class="text-center">Trạng thái</th>
                      <th class="text-right">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${filteredClubs
                      .map((c) => {
                        const formatsText = (c.formats || [c.format || '7'])
                          .map((f) => `Sân ${f}`)
                          .join(', ');
                        const startDate = c.activity_start_date
                          ? formatDate(c.activity_start_date)
                          : c.created_at
                            ? formatDate(c.created_at.slice(0, 10))
                            : '—';
                        return `
                          <tr>
                            <td>
                              <div style="display:flex;align-items:center;gap:0.75rem;">
                                ${avatar(c.name, imageUrl('club', c.id, c.avatar_version, c.id))}
                                <div>
                                  <strong>${e(c.name)}</strong>
                                  ${c.description ? `<br><small class="muted truncate" style="max-width:200px;" title="${e(c.description)}">${e(c.description)}</small>` : ''}
                                </div>
                              </div>
                            </td>
                            <td>
                              <strong>${e(c.owner_name || 'Chưa gán')}</strong>
                              <br><small class="muted">${e(c.owner_email || '—')}</small>
                            </td>
                            <td>
                              ${e(c.city || '—')}
                              ${c.home_ground ? `<br><small class="muted">${e(c.home_ground)}</small>` : ''}
                            </td>
                            <td><small>${e(formatsText)}</small></td>
                            <td class="tabular-nums">${e(startDate)}</td>
                            <td>
                              <strong>${c.member_count || 0}</strong> thành viên
                              <br><small class="muted">${c.player_count || 0} cầu thủ</small>
                            </td>
                            <td class="text-center">
                              <span class="badge ${c.status === 'active' ? 'active' : 'injured'}">
                                ${c.status === 'active' ? 'Đang hoạt động' : 'Lưu trữ'}
                              </span>
                            </td>
                            <td class="text-right">
                              <div style="display:inline-flex;gap:0.4rem;justify-content:flex-end;">
                                <button type="button" class="button secondary" data-action="admin-enter-club" data-id="${c.id}" title="Vào quản trị CLB này">
                                  Vào CLB
                                </button>
                                ${
                                  c.status === 'active'
                                    ? `<button type="button" class="text-button danger" data-action="admin-toggle-club" data-id="${c.id}" data-status="archived" title="Lưu trữ CLB">Lưu trữ</button>`
                                    : `<button type="button" class="text-button" data-action="admin-toggle-club" data-id="${c.id}" data-status="active" title="Kích hoạt lại CLB">Mở lại</button>`
                                }
                              </div>
                            </td>
                          </tr>
                        `;
                      })
                      .join('')}
                  </tbody>
                </table>
              </div>
            `
                : empty('Không tìm thấy CLB', 'Không có CLB nào khớp với từ khóa tìm kiếm.')
            }
          </div>
        </section>
      `
        : ''
    }

    <!-- TAB 3: USERS & ADMIN ROLES MANAGEMENT -->
    ${
      activeTab === 'users'
        ? `
        <section class="panel">
          <div class="panel-head">
            <div>
              <h2>Quản lý Người dùng & Quyền Quản trị (${filteredUsers.length})</h2>
              <p class="muted">Cấp quyền Quản trị viên hệ thống (System Admin), kiểm soát trạng thái kích hoạt tài khoản.</p>
            </div>
          </div>
          <div class="panel-body">
            <div style="margin-bottom:1rem;">
              <input type="search" data-admin-search placeholder="Tìm theo họ tên hoặc email người dùng..." value="${e(query)}" style="max-width:400px;width:100%;">
            </div>
            ${
              filteredUsers.length
                ? `
              <div class="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Họ và tên</th>
                      <th>Email</th>
                      <th class="tabular-nums">Ngày đăng ký</th>
                      <th>Số CLB tham gia</th>
                      <th>Quyền Quản trị viên</th>
                      <th class="text-center">Trạng thái</th>
                      <th class="text-right">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${filteredUsers
                      .map((u) => {
                        const isSelf = u.id === s.user?.id;
                        const regDate = u.created_at ? formatDate(u.created_at.slice(0, 10)) : '—';
                        return `
                          <tr>
                            <td>
                              <div style="display:flex;align-items:center;gap:0.75rem;">
                                ${avatar(u.name || 'U', imageUrl('account', u.id, u.avatar_path))}
                                <div>
                                  <strong>${e(u.name || 'Người dùng')}</strong>
                                  ${isSelf ? '<span class="badge" style="font-size:0.7rem;margin-left:0.35rem;">Bạn</span>' : ''}
                                </div>
                              </div>
                            </td>
                            <td><code>${e(u.email)}</code></td>
                            <td class="tabular-nums">${e(regDate)}</td>
                            <td><strong>${u.club_count || 0}</strong> CLB</td>
                            <td>
                              ${
                                u.is_system_admin
                                  ? '<span class="badge" style="background:#ffd700;color:#000;font-weight:700;">👑 Quản trị viên tối cao</span>'
                                  : '<span class="badge secondary">Người dùng thông thường</span>'
                              }
                            </td>
                            <td class="text-center">
                              <span class="badge ${u.is_active ? 'active' : 'injured'}">
                                ${u.is_active ? 'Hoạt động' : 'Đã khóa'}
                              </span>
                            </td>
                            <td class="text-right">
                              <div style="display:inline-flex;gap:0.4rem;justify-content:flex-end;">
                                ${
                                  !isSelf
                                    ? `
                                    <button type="button" class="text-button" data-action="admin-toggle-user-admin" data-id="${u.id}" data-name="${e(u.name || u.email)}" data-admin="${u.is_system_admin ? 'false' : 'true'}" title="${u.is_system_admin ? 'Hạ quyền xuống người dùng thường' : 'Cấp quyền Quản trị viên hệ thống'}">
                                      ${u.is_system_admin ? 'Hạ quyền Admin' : 'Cấp quyền Admin'}
                                    </button>
                                    <button type="button" class="text-button ${u.is_active ? 'danger' : ''}" data-action="admin-toggle-user-active" data-id="${u.id}" data-name="${e(u.name || u.email)}" data-active="${u.is_active ? 'false' : 'true'}" title="${u.is_active ? 'Khóa tài khoản này' : 'Mở khóa tài khoản'}">
                                      ${u.is_active ? 'Khóa tài khoản' : 'Mở khóa'}
                                    </button>
                                  `
                                    : '<span class="muted" style="font-size:0.85rem;">Tài khoản hiện tại</span>'
                                }
                              </div>
                            </td>
                          </tr>
                        `;
                      })
                      .join('')}
                  </tbody>
                </table>
              </div>
            `
                : empty('Không tìm thấy người dùng', 'Không có tài khoản nào khớp với từ khóa tìm kiếm.')
            }
          </div>
        </section>
      `
        : ''
    }
  `;
}
