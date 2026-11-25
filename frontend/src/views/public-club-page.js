import { state as s } from '../state.js';
import { escapeHtml as e, number, formatDate } from '../utils.js';
import { icon, empty, field } from '../components/ui.js';
import { avatar } from '../images.js';

export function publicClubPage() {
  const data = s.publicClub;
  if (s.loading) {
    return '<div class="panel loading" role="status"><div class="spinner"></div>Đang tải trang công khai câu lạc bộ…</div>';
  }

  if (!data?.club) {
    return `
      <div class="public-club-shell">
        <header class="public-club-nav">
          <a class="brand" href="#dashboard"><img src="/icons/crest.svg" alt="">FCMS <small>PRO</small></a>
          <div class="team-actions">
            <button type="button" class="icon-button theme-toggle" data-action="theme" aria-label="Đổi giao diện sáng tối">${icon('sun')}</button>
            <a class="button secondary" href="${s.user ? '#club' : '#dashboard'}">${s.user ? 'Quay lại CLB' : 'Đăng nhập'}</a>
          </div>
        </header>
        <section class="panel" style="max-width:760px;margin:40px auto;">
          ${empty(
            'Trang câu lạc bộ chưa mở công khai',
            e(s.error || 'Đường dẫn không tồn tại hoặc câu lạc bộ chưa xuất bản cổng thông tin công khai.')
          )}
        </section>
      </div>
    `;
  }

  const c = data.club;
  const content = c.content || {};
  const stats = data.stats || {};
  const teams = data.teams || [];
  const awards = data.awards || [];
  const openPosts = data.open_posts || [];
  const formatsLabel = (c.formats || ['7']).map((v) => `Sân ${v} người`).join(' · ');

  return `
    <div class="public-club-shell">
      <header class="public-club-nav">
        <a class="brand" href="${s.user ? '#dashboard' : '#public-club?slug=' + encodeURIComponent(c.slug || '')}">
          <img src="/icons/crest.svg" alt="">FCMS <small>CLUB PORTAL</small>
        </a>
        <div class="team-actions">
          ${c.is_preview ? '<span class="badge injured">Chế độ xem trước (Chưa xuất bản)</span>' : '<span class="badge active">Cổng thông tin chính thức</span>'}
          <button type="button" class="icon-button theme-toggle" data-action="theme" aria-label="Đổi giao diện sáng tối">${icon(globalThis.document?.documentElement?.dataset?.theme === 'light' ? 'moon' : 'sun')}</button>
          <a class="button secondary" href="${s.user ? '#club' : '#dashboard'}">${s.user ? 'Quản lý CLB' : 'Đăng nhập thành viên'}</a>
        </div>
      </header>

      <main class="public-club-main">
        <section class="hero public-club-hero">
          <div class="public-club-hero-head">
            ${avatar(c.name, null, 'public-club-crest')}
            <div>
              <div class="eyebrow" style="color:#8af5c8;">CÂU LẠC BỘ BÓNG ĐÁ</div>
              <h1>${e(c.name)}</h1>
              <p class="public-club-headline">${e(c.headline || c.description || 'Đoàn kết — Bản lĩnh — Thi đấu hết mình vì màu cờ sắc áo.')}</p>
              <div class="public-club-badges">
                <span class="pill">${e(formatsLabel)}</span>
                ${c.city ? `<span class="badge">${e(c.city)}</span>` : ''}
                ${c.home_ground ? `<span class="badge">Sân nhà: ${e(c.home_ground)}</span>` : ''}
                ${c.activity_start_date ? `<span class="badge">Hoạt động từ: ${e(formatDate(c.activity_start_date))}</span>` : ''}
              </div>
            </div>
          </div>
        </section>

        <div class="stats-grid">
          <section class="stat stat-income">
            <div><span>Đội hình trực thuộc</span><i>${icon('shield')}</i></div>
            <strong class="tabular-nums">${number(stats.teams_count || 0)}</strong>
          </section>
          <section class="stat">
            <div><span>Cầu thủ đang hoạt động</span><i>${icon('users')}</i></div>
            <strong class="tabular-nums">${number(stats.active_players_count || 0)}</strong>
          </section>
          <section class="stat">
            <div><span>Trận đấu đã ghi nhận</span><i>${icon('trophy')}</i></div>
            <strong class="tabular-nums">${number(stats.matches_count || 0)}</strong>
          </section>
          <section class="stat">
            <div><span>Đợt tuyển quân đang mở</span><i>${icon('flag')}</i></div>
            <strong class="tabular-nums">${number(openPosts.length)}</strong>
          </section>
        </div>

        <div class="dashboard-grid">
          <section class="panel">
            <div class="panel-head">
              <div>
                <h2>Giới thiệu & Lịch sinh hoạt</h2>
                <p>Thông tin chung dành cho đối tác giao hữu và ứng viên quan tâm.</p>
              </div>
            </div>
            <div class="panel-body">
              <p style="line-height:1.7;">${e(c.description || 'Câu lạc bộ duy trì tập luyện định kỳ, chú trọng tinh thần thể thao văn minh và gắn kết tập thể.')}</p>
              <dl class="details" style="margin-top:16px;">
                <div><dt>Lịch tập luyện / sinh hoạt</dt><dd>${e(content.schedule_text || 'Liên hệ Ban chủ nhiệm để cập nhật lịch sân hàng tuần.')}</dd></div>
                <div><dt>Sân nhà</dt><dd>${e(c.home_ground || 'Đang cập nhật')}</dd></div>
                <div><dt>Khu vực</dt><dd>${e(c.city || 'Đang cập nhật')}</dd></div>
                ${content.achievements ? `<div><dt>Dấu ấn & Thành tích</dt><dd>${e(content.achievements)}</dd></div>` : ''}
              </dl>
            </div>
          </section>

          <section class="panel">
            <div class="panel-head">
              <div>
                <h2>Liên hệ Giao hữu & Hợp tác</h2>
                <p>Kết nối trực tiếp với Ban đối ngoại / Ban chủ nhiệm CLB.</p>
              </div>
            </div>
            <div class="panel-body">
              <dl class="details">
                <div><dt>Điện thoại / Zalo</dt><dd>${e(content.contact_phone || 'Liên hệ qua cổng CLB')}</dd></div>
                <div><dt>Email liên hệ</dt><dd>${e(content.contact_email || 'Đang cập nhật')}</dd></div>
                <div>
                  <dt>Kênh truyền thông</dt>
                  <dd>
                    ${
                      content.social_url && /^https?:\/\//i.test(content.social_url)
                        ? `<a class="text-link" href="${e(content.social_url)}" target="_blank" rel="noopener noreferrer">${e(content.social_url)}</a>`
                        : e(content.social_url || 'Đang cập nhật')
                    }
                  </dd>
                </div>
              </dl>
              ${
                s.user
                  ? `<div style="margin-top:16px;"><a class="button secondary" href="#discover">Mời giao hữu trong ứng dụng →</a></div>`
                  : ''
              }
            </div>
          </section>
        </div>

        ${
          teams.length
            ? `<section class="panel">
                <div class="panel-head">
                  <div>
                    <h2>Các đội bóng trực thuộc</h2>
                    <p>Cơ cấu đội hình theo thể thức sân thi đấu.</p>
                  </div>
                </div>
                <div class="team-grid" style="padding:18px 24px;">
                  ${teams
                    .map(
                      (t) => `
                    <article class="panel team-card" style="margin:0;">
                      <div class="team-card-top">
                        <span class="pill">SÂN ${e(t.format)} NGƯỜI</span>
                        <span class="badge">${number(t.members_count || 0)} cầu thủ</span>
                      </div>
                      <h3>${e(t.name)}</h3>
                    </article>`
                    )
                    .join('')}
                </div>
              </section>`
            : ''
        }

        ${
          awards.length
            ? `<section class="panel">
                <div class="panel-head">
                  <div>
                    <h2>Bảng vàng Vinh danh & Giải thưởng</h2>
                    <p>Ghi nhận nỗ lực của các cá nhân và tập thể tiêu biểu.</p>
                  </div>
                </div>
                <div class="table-wrap">
                  <table>
                    <thead>
                      <tr><th>Năm</th><th>Danh hiệu</th><th>Gương mặt tiêu biểu</th></tr>
                    </thead>
                    <tbody>
                      ${awards
                        .map(
                          (a) => `
                        <tr>
                          <td class="tabular-nums"><strong>${e(a.award_year)}</strong></td>
                          <td>${e(a.title)}</td>
                          <td>${e(a.player_name)}</td>
                        </tr>`
                        )
                        .join('')}
                    </tbody>
                  </table>
                </div>
              </section>`
            : ''
        }

        <section class="panel" id="public-recruitment">
          <div class="panel-head">
            <div>
              <h2>Tuyển thành viên & Đăng ký thử chân</h2>
              <p>Gửi hồ sơ trực tuyến đến Ban nhân sự của ${e(c.name)}.</p>
            </div>
          </div>
          <div class="panel-body">
            ${
              openPosts.length
                ? `
              <div class="public-posts-list">
                ${openPosts
                  .map(
                    (post) => `
                  <article class="public-post-card">
                    <div>
                      <strong>${e(post.title)}</strong>
                      <small style="display:block;color:var(--muted);margin-top:4px;">
                        Vị trí: ${e(post.position || 'Mọi vị trí')} · Hạn nhận hồ sơ: ${e(post.deadline ? formatDate(post.deadline) : 'Không giới hạn')}
                      </small>
                      ${post.requirements ? `<p style="margin-top:6px;font-size:13px;">${e(post.requirements)}</p>` : ''}
                    </div>
                  </article>`
                  )
                  .join('')}
              </div>
              <form data-form="public-recruitment-apply" novalidate style="margin-top:18px;">
                <div class="form-error" data-form-error role="alert"></div>
                <input type="hidden" name="club_id" value="${e(c.id)}">
                <div class="form-grid">
                  <div class="field">
                    <label for="f-public-post">Chọn đợt tuyển quân *</label>
                    <select id="f-public-post" name="post_id" required>
                      ${openPosts.map((p) => `<option value="${e(p.id)}">${e(p.title)}${p.position ? ` (${e(p.position)})` : ''}</option>`).join('')}
                    </select>
                  </div>
                  ${field('full_name', 'Họ và tên ứng viên', '', 'text', true)}
                  ${field('date_of_birth', 'Ngày sinh', '', 'date')}
                  ${field('phone', 'Số điện thoại / Zalo liên hệ', '', 'text', true)}
                  ${field('email', 'Email', '', 'email')}
                  ${field('notes', 'Vị trí sở trường & giới thiệu ngắn', '', 'textarea')}
                </div>
                <div class="form-actions">
                  <button class="button" type="submit">Gửi đơn ứng tuyển</button>
                </div>
              </form>
            `
                : '<p class="muted">Hiện tại câu lạc bộ chưa mở đợt tuyển thành viên trực tuyến mới. Vui lòng theo dõi lại sau hoặc liên hệ trực tiếp qua thông tin đối ngoại phía trên.</p>'
            }
          </div>
        </section>
      </main>
    </div>
  `;
}
