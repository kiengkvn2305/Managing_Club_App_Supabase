import { state as s, currentClub } from '../state.js';
import {
  escapeHtml as e,
  number,
  statusLabel,
  canManageRoster,
} from '../utils.js';
import { icon, button, empty } from '../components/ui.js';
import { avatar, imageUrl } from '../images.js';

const badge = (status) =>
  `<span class="badge ${e(status)}">${e(statusLabel(status))}</span>`;

export function dashboardPage() {
  const c = currentClub();
  const d = s.dashboard;
  const allowed = canManageRoster(c);

  const stats = [
    ['Tổng thành viên', d.members_count, 'users'],
    ['Đang hoạt động', d.active_members_count, 'check'],
    ['Đội bóng', d.teams_count, 'layers'],
    ['Ban quản lý', d.managers_count, 'shield'],
  ];

  const checks = [
    ['Tạo không gian câu lạc bộ', true, 'club'],
    ['Thêm đội bóng đầu tiên', d.teams_count > 0, 'teams'],
    ['Xây dựng danh sách thành viên', d.members_count > 0, 'members'],
  ];

  return `
    <div class="page-top">
      <div>
        <div class="eyebrow">KHÔNG GIAN CÂU LẠC BỘ</div>
        <h1>Tổng quan câu lạc bộ</h1>
        <p>Một ngày mới, cùng ${e(c.name)} tiến về phía trước.</p>
      </div>
      <div class="page-actions">
        ${button('new-club', 'Tạo CLB', 'plus', 'secondary')}
      </div>
    </div>

    <section class="hero">
      <div>
        <span class="eyebrow">KHÔNG GIAN CỦA ĐỘI BÓNG</span>
        <h2>Chung một màu áo.<br>Cùng một hành trình.</h2>
        <p>Quản lý con người và đội hình của bạn,<br>để mỗi lần ra sân đều sẵn sàng hơn.</p>
        ${allowed ? button('new-member', 'Thêm thành viên') : ''}
      </div>
      <div class="pitch" aria-hidden="true"><i></i><b>F</b></div>
    </section>

    <div class="stats-grid">
      ${stats
        .map(
          ([label, value, glyph]) => `
        <section class="stat">
          <div><span>${label}</span><i>${icon(glyph)}</i></div>
          <strong>${number(value)}</strong>
          <small>Dữ liệu của câu lạc bộ hiện tại</small>
        </section>`
        )
        .join('')}
    </div>

    <div class="dashboard-grid">
      <section class="panel">
        <div class="panel-head">
          <div>
            <h2>Những thành viên mới nhất</h2>
            <p>Hồ sơ được thêm gần đây trong câu lạc bộ</p>
          </div>
          ${allowed ? '<a class="text-link" href="#members">Xem tất cả →</a>' : ''}
        </div>
        ${
          !allowed
            ? empty(
                'Quyền truy cập được bảo vệ',
                'Thông tin nhân sự do ban quản lý câu lạc bộ phụ trách.'
              )
            : s.members.length
              ? s.members
                  .map(
                    (m) => `
                <div class="member-row">
                  ${avatar(m.full_name, imageUrl('player', m.id, m.avatar_version, s.clubId))}
                  <div>
                    <strong>${e(m.full_name)}</strong>
                    <small>${e(m.team?.name || 'Chưa xếp đội')} · ${e(m.position || 'Chưa cập nhật vị trí')}</small>
                  </div>
                  ${badge(m.status)}
                  <span class="jersey">${m.jersey_number != null ? '#' + e(m.jersey_number) : '—'}</span>
                </div>`
                  )
                  .join('')
              : empty(
                  'Đội hình đang chờ bạn',
                  'Thêm thành viên đầu tiên để bắt đầu xây dựng hồ sơ đội bóng.',
                  'new-member',
                  'Thêm thành viên'
                )
        }
      </section>

      <section class="panel">
        <div class="panel-head">
          <div>
            <h2>Sẵn sàng cho chặng đường mới</h2>
            <p>Từng bước xây dựng câu lạc bộ</p>
          </div>
          ${icon('flag')}
        </div>
        <div class="panel-body">
          <p class="muted">Hoàn thiện nền tảng để quản lý câu lạc bộ thuận tiện hơn.</p>
          <div class="progress">
            <span style="width:${(checks.filter((x) => x[1]).length / 3) * 100}%"></span>
          </div>
          <div class="checklist">
            ${checks
              .map(
                ([label, done, route]) => `
              <a href="#${route}">
                <span class="${done ? 'done' : ''}">${done ? icon('check') : '○'}</span>${label}
              </a>`
              )
              .join('')}
          </div>
          <div class="notice">Một đội bóng vững mạnh bắt đầu từ những kết nối tốt.</div>
        </div>
      </section>
    </div>
  `;
}
