import { state as s, currentClub } from '../state.js';
import { escapeHtml as e, roleLabel, canManageClub } from '../utils.js';
import { icon, button } from '../components/ui.js';
import { avatar, imageUrl } from '../images.js';

export function clubPage() {
  const c = currentClub();
  const canInvite = [
    'owner',
    'co_owner',
    'general_manager',
    'hr_manager',
  ].includes(c.membership_role);

  const actions =
    button('new-club', 'Tạo CLB mới', 'plus', 'secondary') +
    (canManageClub(c.membership_role)
      ? button('edit-club', 'Chỉnh sửa', 'edit') +
        button('edit-club-avatar', 'Ảnh đại diện', 'edit', 'secondary') +
        button('edit-club-background', 'Ảnh nền', 'edit', 'secondary') +
        button('edit-public-settings', 'Trang công khai', 'globe', 'secondary')
      : '') +
    (c.membership_role === 'owner'
      ? button('delete-club', 'Xóa CLB', 'trash', 'secondary')
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
      </section>

      <section class="panel">
        <div class="panel-head">
          <h2>Cùng xây dựng câu lạc bộ</h2>
          ${icon('mail')}
        </div>
        <div class="panel-body">
          <p class="muted">Mời đúng email của người nhận. Liên kết được chia sẻ trực tiếp và chỉ sử dụng một lần.</p>
          ${canInvite ? button('invite', 'Mời tham gia', 'mail') : ''}
          <hr>
          <p class="muted">Bạn có lời mời từ câu lạc bộ khác?</p>
          <a class="text-link" href="#accept">Nhập mã tham gia →</a>
        </div>
      </section>
    </div>
  `;
}
