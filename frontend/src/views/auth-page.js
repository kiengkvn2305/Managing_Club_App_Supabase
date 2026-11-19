import { state as s } from '../state.js';
import { icon, field } from '../components/ui.js';

export function authPage() {
  const register = s.authMode === 'register';

  return `
    <div class="auth-layout">
      <section class="auth-story">
        <div class="brand">
          <img src="/icons/crest.svg" alt="">FCMS <small>PRO</small>
        </div>
        <div>
          <span class="eyebrow">MỘT CÂU LẠC BỘ. MỘT TINH THẦN.</span>
          <h1>Quản lý gọn gàng.<br>Ra sân <em>hết mình.</em></h1>
          <p>Từ đội hình đến từng thành viên, xây dựng một câu lạc bộ có tổ chức và sẵn sàng cho những mục tiêu lớn hơn.</p>
          <div class="pitch" aria-hidden="true"><i></i><b>F</b></div>
        </div>
        <small>FCMS PRO · DÀNH CHO NHỮNG NGƯỜI YÊU BÓNG ĐÁ</small>
      </section>

      <main id="main-content" class="auth-content" tabindex="-1">
        <button class="icon-button theme-control" data-action="theme" aria-label="Đổi giao diện sáng tối">
          ${icon('moon')}
        </button>

        <div class="auth-card">
          <div class="brand mobile-brand">
            <img src="/icons/crest.svg" alt="">FCMS <small>PRO</small>
          </div>
          ${s.invite ? '<div class="notice">Đăng nhập bằng email được mời để tham gia câu lạc bộ.</div>' : ''}
          <h2>${register ? 'Bắt đầu hành trình mới' : 'Chào mừng trở lại'}</h2>
          <p>${register ? 'Tạo tài khoản để xây dựng câu lạc bộ của bạn.' : 'Đăng nhập để kết nối với đội bóng của bạn.'}</p>

          <form data-form="${register ? 'register' : 'login'}" novalidate>
            <div class="form-error" data-form-error role="alert"></div>
            ${register ? field('name', 'Họ và tên', '', 'text', true) : ''}
            ${field('email', 'Địa chỉ email', '', 'email', true)}
            ${field('password', 'Mật khẩu', '', 'password', true)}
            ${register ? field('password_confirmation', 'Xác nhận mật khẩu', '', 'password', true) : ''}
            <button type="submit" class="button wide">
              ${register ? 'Tạo tài khoản' : 'Đăng nhập'}${icon('arrow')}
            </button>
          </form>

          ${
            !register
              ? '<p class="auth-footer"><button type="button" class="text-button" data-action="forgot-password">Quên mật khẩu?</button></p>'
              : ''
          }
          <p class="auth-footer">
            ${register ? 'Đã có tài khoản?' : 'Mới đến với FCMS PRO?'}
            <button class="text-button" data-action="auth-mode">
              ${register ? 'Đăng nhập' : 'Tạo tài khoản'}
            </button>
          </p>
          <small class="auth-security">${icon('shield')} Phiên đăng nhập an toàn</small>
        </div>
      </main>
    </div>
  `;
}
