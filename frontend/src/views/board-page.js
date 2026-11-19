import { state as s, currentClub } from '../state.js';
import {
  escapeHtml as e,
  number,
  formatDate,
  canManageClub,
} from '../utils.js';
import { button, empty } from '../components/ui.js';

export function boardPage() {
  const c = currentClub();
  const canManage =
    c?.membership_role === 'owner' ||
    canManageClub(c?.membership_role) ||
    c?.can_manage_finance;

  if (!canManage) {
    return `
      <div class="page-top">
        <div>
          <div class="eyebrow">KHÔNG GIAN CÂU LẠC BỘ</div>
          <h1>Thành viên BCN</h1>
          <p>Thông tin ban chủ nhiệm được bảo vệ theo quyền quản lý.</p>
        </div>
      </div>
      <section class="panel">
        ${empty('Quyền truy cập được bảo vệ', 'Chỉ ban quản lý câu lạc bộ có quyền quản lý BCN.')}
      </section>
    `;
  }

  const board = s.boardMembers.length
    ? s.boardMembers
        .map(
          (m) => `
        <div class="member-row">
          <div>
            <strong>${e(m.full_name)}</strong>
            <small>${e(m.title)}${m.date_of_birth ? ` · ${e(formatDate(m.date_of_birth))}` : ''}${m.email ? ` · ${e(m.email)}` : ''}</small>
          </div>
          <div class="team-actions">
            <button class="text-button" data-action="board-edit" data-id="${m.id}">Sửa</button>
            <button class="text-button danger" data-action="board-remove" data-id="${m.id}">Bỏ khỏi BCN</button>
          </div>
        </div>`
        )
        .join('')
    : empty(
        'Chưa có thành viên BCN',
        'Chọn thành viên CLB để thêm vào ban chủ nhiệm.'
      );

  const rates = s.boardSharedRates.length
    ? s.boardSharedRates
        .map(
          (r) => `
        <div class="member-row">
          <div>
            <strong>${e(r.team_name)} · ${number(r.amount)} đ/tháng</strong>
            <small>Áp dụng từ ${e(r.effective_month.slice(5, 7))}/${e(r.effective_month.slice(0, 4))}</small>
          </div>
          <div class="team-actions">
            <button class="text-button danger" data-action="delete-board-shared-rate" data-id="${r.id}">Xóa</button>
          </div>
        </div>`
        )
        .join('')
    : empty(
        'Chưa có mức quỹ chung',
        'Thiết lập mức quỹ ưu đãi cho từng đội.'
      );

  const isOwner = c?.membership_role === 'owner' || c?.is_system_admin;

  const permissionSummary = (m) => {
    if (m.role === 'owner') return '<span class="badge" style="background:#ddf5e9;color:#126047;">Toàn quyền (Chủ sở hữu)</span>';
    const perms = m.permissions || {};
    const granted = [];
    if (perms.can_view_finance) granted.push('Xem thu chi');
    if (perms.can_manage_finance) granted.push('Ghi thu chi');
    if (perms.can_manage_roster) granted.push('Quản lý nhân sự');
    if (perms.can_manage_inventory) granted.push('Quản lý kho');
    if (perms.can_manage_activities) granted.push('Quản lý hoạt động');
    if (perms.can_manage_club) granted.push('Quản lý CLB');
    if (!granted.length) return '<span class="badge" style="background:var(--subtle);color:var(--muted);">Quyền mặc định</span>';
    return `<span class="badge">${e(granted.join(', '))}</span>`;
  };

  const membershipsList = s.clubMemberships?.length
    ? s.clubMemberships
        .map(
          (m) => `
        <div class="member-row" style="display:flex;align-items:center;justify-content:space-between;padding:12px;border-bottom:1px solid var(--line);gap:12px;">
          <div>
            <strong>${e(m.name || m.email || ('Thành viên #' + m.id))}</strong>
            <small style="display:block;color:var(--muted);">${e(m.email || '')}${m.title ? ` · Chức danh: ${e(m.title)}` : ''} · Vai trò: ${e(m.role)}</small>
            <div style="margin-top:4px;">${permissionSummary(m)}</div>
          </div>
          <div class="team-actions" style="display:flex;gap:6px;flex-wrap:wrap;">
            ${isOwner && m.role !== 'owner' ? `<button class="text-button" data-action="edit-permissions" data-id="${m.id}">Phân quyền</button>` : ''}
            ${isOwner ? `<button class="text-button" data-action="edit-title" data-id="${m.id}">Chức danh</button>` : ''}
            ${isOwner && m.role !== 'owner' ? `<button class="text-button danger" data-action="transfer-ownership" data-id="${m.user_id}" data-name="${e(m.name || m.email)}">Trao quyền Chủ nhiệm</button>` : ''}
          </div>
        </div>`
        )
        .join('')
    : empty('Chưa có tài khoản thành viên', 'Mời thành viên tham gia để phân quyền sử dụng.');

  return `
    <div class="page-top">
      <div>
        <div class="eyebrow">KHÔNG GIAN CÂU LẠC BỘ</div>
        <h1>Thành viên BCN & Phân quyền</h1>
        <p>Danh sách ban chủ nhiệm và quản lý quyền hạn của từng tài khoản thành viên trong CLB.</p>
      </div>
      <div class="page-actions">
        ${button('board-new', 'Thêm BCN')}
      </div>
    </div>

    <section class="panel">
      <div class="panel-head">
        <div>
          <h2>Tài khoản thành viên & Phân quyền chi tiết</h2>
          <p>Chủ nhiệm CLB có toàn quyền cấp hoặc giới hạn từng chức năng cho từng thành viên, hoặc trao lại quyền Chủ nhiệm cho người khác.</p>
        </div>
      </div>
      ${membershipsList}
    </section>

    <section class="panel">
      <div class="panel-head">
        <div>
          <h2>Ban chủ nhiệm</h2>
          <p>Chức danh dùng để ghi nhận nhân sự, không tự cấp quyền đăng nhập.</p>
        </div>
      </div>
      ${board}
    </section>

    <section class="panel">
      <div class="panel-head">
        <div>
          <h2>Ưu đãi quỹ chung cho BCN</h2>
          <p>Mỗi đội có một mức áp dụng cho toàn bộ thành viên BCN.</p>
        </div>
        ${button('board-shared-dues', 'Đặt mức quỹ')}
      </div>
      ${rates}
    </section>
  `;
}
