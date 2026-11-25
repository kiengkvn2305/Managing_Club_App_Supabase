import { state as s, currentClub } from '../state.js';
import { escapeHtml as e, roleLabel, canManageClub, formatDate } from '../utils.js';
import { icon, button } from '../components/ui.js';
import { avatar, imageUrl } from '../images.js';

export function clubPage() {
  const c = currentClub();
  const canInvite =
    !c ||
    c.is_system_admin ||
    s.user?.is_system_admin ||
    c.membership_role === 'owner' ||
    ['owner', 'co_owner', 'general_manager', 'hr_manager'].includes(c.membership_role) ||
    canManageClub(c) ||
    Boolean(c.can_manage_roster);

  const actions =
    button('new-club', 'Tạo CLB mới', 'plus', 'secondary') +
    (canManageClub(c)
      ? button('edit-club', 'Chỉnh sửa', 'edit') +
        button('edit-club-avatar', 'Ảnh đại diện', 'edit', 'secondary') +
        button('edit-club-background', 'Ảnh nền', 'edit', 'secondary') +
        button('edit-public-settings', 'Trang công khai', 'globe', 'secondary')
      : '') +
    (c?.membership_role === 'owner' || c?.is_system_admin
      ? button('transfer-ownership', 'Chuyển quyền Chủ nhiệm', 'user', 'secondary') +
        button('delete-club', 'Xóa CLB', 'trash', 'secondary')
      : '') +
    (c && c.membership_role !== 'owner'
      ? button('leave-club', 'Rời câu lạc bộ', 'arrow', 'secondary')
      : '');

  return `
    <div class="page-top">
      <div>
        <div class="eyebrow">KHÔNG GIAN CÂU LẠC BỘ</div>
        <h1>Câu lạc bộ</h1>
        <p>Bản sắc riêng, một không gian kết nối chung.</p>
      </div>
      <div class="page-actions">${actions}</div>
    </div>

    ${
      c?.membership_role === 'owner'
        ? '<p class="owner-notice">Bạn là Chủ nhiệm CLB. Để rời CLB, hãy chuyển quyền Chủ nhiệm cho một thành viên khác trước.</p>'
        : ''
    }

    <div class="dashboard-grid">
      <section class="panel">
        <div class="profile-head">
          ${avatar(c.name, imageUrl('club', c.id, c.avatar_version, c.id))}
          <div>
            <h2>${e(c.name)}</h2>
            <p>${e(roleLabel(c.membership_role))} · ${c.status === 'archived' ? 'Đã lưu trữ' : 'Đang hoạt động'}</p>
          </div>
        </div>
        <dl class="details">
          ${[
            ['Thành phố', c.city],
            ['Sân nhà', c.home_ground],
            ['Ngày bắt đầu hoạt động CLB', formatDate(c.activity_start_date || c.created_at?.slice(0, 10))],
            [
              'Loại sân',
              (c.formats || [c.format]).map((v) => `Sân ${v}`).join(', '),
            ],
            ['Giới thiệu', c.description],
          ]
            .map(
              ([label, value]) =>
                `<div><dt>${label}</dt><dd>${e(value || 'Chưa cập nhật')}</dd></div>`
            )
            .join('')}
        </dl>
        <hr>
        <div class="club-portal-strip">
          <div>
            <strong>Cổng thông tin mở, Tuyển quân & Giao hữu</strong>
            <p class="muted" style="margin:4px 0 0;font-size:12.5px;">
              ${
                s.publicSettings?.is_published
                  ? `Đang xuất bản công khai tại đường dẫn <code>#public-club?slug=${e(s.publicSettings.public_slug || c.slug || c.id)}</code>`
                  : 'Trang công khai hiện ở chế độ nháp. Nhấn "Trang công khai" để cấu hình và xuất bản.'
              }
            </p>
          </div>
          <div class="team-actions">
            <a class="chip-button primary" href="#public-club?${s.publicSettings?.public_slug ? `slug=${encodeURIComponent(s.publicSettings.public_slug)}` : `id=${encodeURIComponent(c.id)}`}" style="text-decoration:none;">Xem trang công khai →</a>
            <button type="button" class="chip-button" data-action="copy-public-link" data-slug="${e(s.publicSettings?.public_slug || '')}" data-id="${e(c.id)}">Sao chép link</button>
            <a class="chip-button" href="#discover" style="text-decoration:none;">Khám phá & Giao hữu</a>
            ${c.can_manage_roster || canManageClub(c) ? `<a class="chip-button" href="#recruitment" style="text-decoration:none;">Tuyển thành viên</a>` : ''}
          </div>
        </div>
      </section>

      <section class="panel">
        <div class="panel-head">
          <div>
            <h2>Mã mời & Lời mời tham gia CLB</h2>
            <p class="muted">Tạo mã mời có sẵn chức vụ và phân quyền để kết nạp hoặc test quyền hạn.</p>
          </div>
          ${canInvite ? button('invite', 'Tạo mã mời mới', 'plus') : ''}
        </div>
        <div class="panel-body">
          ${(() => {
            const list = s.clubInvitations || [];
            if (!list.length) {
              return `
                <div class="empty-state" style="padding:1.5rem;text-align:center;color:var(--muted);">
                  <p>Chưa có mã mời nào được tạo cho CLB này.</p>
                  <p style="font-size:0.875rem;margin-bottom:1rem;">Tạo mã mời có sẵn chức vụ và quyền hạn để chia sẻ hoặc test ngay lập tức.</p>
                  ${canInvite ? button('invite', 'Tạo mã mời mới ngay', 'plus') : ''}
                </div>
              `;
            }
            return `
              <div class="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Mã mời</th>
                      <th>Email nhận</th>
                      <th>Chức vụ & Quyền</th>
                      <th class="tabular-nums">Hạn dùng</th>
                      <th class="text-center">Trạng thái</th>
                      <th class="text-right">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${list
                      .map((inv) => {
                        const code = inv.invite_code || inv.token || 'INV';
                        const permsCount = Object.values(inv.permissions || {}).filter(Boolean).length;
                        const isExpired =
                          inv.status === 'expired' ||
                          (inv.expires_at && new Date(inv.expires_at) < new Date());
                        const isActive = inv.status === 'pending' && !isExpired;
                        const statusMap = {
                          pending: isExpired
                            ? '<span class="badge muted">Hết hạn</span>'
                            : '<span class="badge active">Đang chờ</span>',
                          accepted: '<span class="badge">Đã tham gia</span>',
                          expired: '<span class="badge muted">Hết hạn</span>',
                          revoked: '<span class="badge injured">Đã hủy</span>',
                        };
                        const statusBadge =
                          isExpired && inv.status === 'pending'
                            ? '<span class="badge muted">Hết hạn</span>'
                            : (statusMap[inv.status] || `<span class="badge">${e(inv.status)}</span>`);
                        return `
                          <tr>
                            <td>
                              <strong style="font-family:monospace;letter-spacing:1px;font-size:1rem;color:var(--primary);">${e(code)}</strong>
                            </td>
                            <td>
                              ${inv.email ? `<span>${e(inv.email)}</span>` : '<span class="badge secondary" style="font-size:0.75rem;">Dùng chung (Test)</span>'}
                            </td>
                            <td>
                              <strong>${e(inv.title || 'Thành viên')}</strong>
                              ${permsCount ? `<br><small class="muted">${permsCount} quyền tùy chỉnh</small>` : ''}
                            </td>
                            <td class="tabular-nums">
                              ${e(formatDate(String(inv.expires_at || '').slice(0, 10)))}
                            </td>
                            <td class="text-center">
                              ${statusBadge}
                            </td>
                            <td class="text-right">
                              <div style="display:inline-flex;gap:0.35rem;justify-content:flex-end;">
                                ${
                                  isActive
                                    ? `<button type="button" class="text-button" data-action="copy-code" data-code="${e(code)}" title="Sao chép mã">
                                  Chép mã
                                </button>`
                                    : ''
                                }
                                ${
                                  canManageClub(c)
                                    ? `<button type="button" class="text-button danger" data-action="revoke-invitation" data-id="${inv.id}" title="${isActive ? 'Hủy và xóa vĩnh viễn mã này' : 'Xóa mã khỏi hệ thống'}">Xóa</button>`
                                    : ''
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
            `;
          })()}
          <hr>
          <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:0.5rem;">
            <p class="muted" style="margin:0;">Bạn có mã mời từ câu lạc bộ khác?</p>
            <a class="button secondary" href="#accept" style="text-decoration:none;">Nhập mã tham gia →</a>
          </div>
        </div>
      </section>
    </div>
  `;
}
