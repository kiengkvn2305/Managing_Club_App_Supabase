import { state as s, currentClub } from '../state.js';
import { escapeHtml as e } from '../utils.js';
import { button, field } from '../components/ui.js';
import { avatar, imageUrl } from '../images.js';

export function verification() {
  return `
    <div class="notice">
      <p>Xác minh quyền sở hữu email trước khi nhận lời mời. Bạn có thể yêu cầu gửi lại liên kết hoặc tải lại sau khi xác minh.</p>
      <div class="inline-actions">
        ${button('verify', 'Gửi liên kết xác minh', 'mail', 'secondary')}
        ${button('refresh-user', 'Đã xác minh, tải lại', 'check', 'secondary')}
      </div>
    </div>
  `;
}

export function profilePage() {
  return `
    <div class="page-top">
      <div>
        <div class="eyebrow">KHÔNG GIAN CÂU LẠC BỘ</div>
        <h1>Tài khoản của bạn</h1>
        <p>Thông tin cá nhân và phiên đăng nhập.</p>
      </div>
    </div>

    <section class="panel profile-panel">
      <div class="profile-head">
        ${avatar(s.user.name, imageUrl('account', s.user.id, s.user.avatar_version))}
        <div>
          <h2>${e(s.user.name)}</h2>
          <p>${e(s.user.email)} · ${s.user.email_verified_at ? 'Đã xác minh' : 'Chưa xác minh email'}</p>
        </div>
      </div>
      <div class="panel-body">
        <div class="page-actions">
          ${button('edit-account-avatar', 'Đổi ảnh đại diện', 'edit', 'secondary')}
          ${button('change-password', 'Đổi mật khẩu', 'shield', 'secondary')}
          ${
            s.myPlayer
              ? button(
                  'edit-my-player-avatar',
                  'Đổi ảnh hồ sơ CLB',
                  'edit',
                  'secondary'
                ) +
                button(
                  'unlink-player',
                  'Bỏ liên kết hồ sơ CLB',
                  'edit',
                  'secondary'
                )
              : s.canClaimPlayer
                ? button(
                    'claim-player',
                    'Liên kết hồ sơ CLB',
                    'users',
                    'secondary'
                  )
                : ''
          }
        </div>
        ${
          s.myPlayer
            ? `<p class="muted">Hồ sơ CLB đã liên kết: ${e(s.myPlayer.full_name)}</p>`
            : currentClub()
              ? `<p class="muted">Có thể liên kết hồ sơ có email trùng với email đã xác minh của bạn trong CLB hiện tại.</p>`
              : ''
        }
        ${!s.user.email_verified_at ? verification() : ''}
        <form data-form="profile" novalidate>
          <div class="form-error" data-form-error role="alert"></div>
          <div class="form-grid">
            ${field('name', 'Họ và tên', s.user.name, 'text', true)}
            ${field('email', 'Email', s.user.email, 'email', true)}
            ${field('current_password', 'Mật khẩu hiện tại (khi đổi email)', '', 'password')}
          </div>
          <div class="form-actions">
            ${button('logout', 'Đăng xuất', 'arrow', 'secondary')}
            <button class="button" type="submit">Lưu thay đổi</button>
          </div>
        </form>
      </div>
    </section>
  `;
}

export function acceptPage() {
  return `
    <div class="page-top">
      <div>
        <div class="eyebrow">KHÔNG GIAN CÂU LẠC BỘ</div>
        <h1>Kết nối cùng câu lạc bộ</h1>
        <p>Một lời mời, một hành trình mới.</p>
      </div>
    </div>
    <section class="panel profile-panel">
      <div class="panel-body">
        ${!s.user.email_verified_at ? verification() : ''}
        <p class="muted">Đang sử dụng email: <strong>${e(s.user.email)}</strong></p>
        <form data-form="accept" novalidate>
          <div class="form-error" data-form-error role="alert"></div>
          ${field('token', 'Mã lời mời', s.invite, 'text', true)}
          <div class="form-actions">
            <button class="button" type="submit" ${!s.user.email_verified_at ? 'disabled' : ''}>
              Chấp nhận lời mời
            </button>
          </div>
        </form>
      </div>
    </section>
  `;
}
