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

  return `
    <div class="page-top">
      <div>
        <div class="eyebrow">KHÔNG GIAN CÂU LẠC BỘ</div>
        <h1>Thành viên BCN</h1>
        <p>Danh sách ban chủ nhiệm được chọn từ thành viên CLB.</p>
      </div>
      <div class="page-actions">
        ${button('board-new', 'Thêm BCN')}
      </div>
    </div>

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
