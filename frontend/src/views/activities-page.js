import { state as s, currentClub } from '../state.js';
import {
  escapeHtml as e,
  formatDate,
  vietnamToday,
  canManageRoster,
} from '../utils.js';
import { button, empty } from '../components/ui.js';

export function activitiesPage() {
  if (!currentClub()?.can_manage_activities) {
    return `
      <div class="page-top">
        <div>
          <div class="eyebrow">KHÔNG GIAN CÂU LẠC BỘ</div>
          <h1>Hoạt động CLB</h1>
          <p>Thông tin được bảo vệ theo quyền truy cập.</p>
        </div>
      </div>
      <section class="panel">
        ${empty('Quyền truy cập được bảo vệ', 'Bạn không có quyền quản lý hoạt động CLB.')}
      </section>
    `;
  }

  const {
    celebrations = [],
    birthdays = [],
    trainings = [],
    awards = [],
  } = s.activities;
  const owner = currentClub().membership_role === 'owner';
  const birthdayMonth = s.birthdayMonth || vietnamToday().slice(5, 7);
  const monthlyBirthdays = birthdays
    .filter((p) => p.date_of_birth?.slice(5, 7) === birthdayMonth)
    .sort(
      (a, b) =>
        a.date_of_birth.slice(8, 10).localeCompare(b.date_of_birth.slice(8, 10)) ||
        a.name.localeCompare(b.name, 'vi')
    );
  const birthdayPages = Math.max(1, Math.ceil(monthlyBirthdays.length / 3));
  s.birthdayPage = Math.max(1, Math.min(s.birthdayPage || 1, birthdayPages));
  const birthdayRows = monthlyBirthdays.slice(
    (s.birthdayPage - 1) * 3,
    s.birthdayPage * 3
  );

  const birthdaySelector = `
    <label class="birthday-month-label">Chọn tháng
      <select data-birthday-month aria-label="Chọn tháng sinh nhật">
        ${Array.from({ length: 12 }, (_, i) => {
          const value = String(i + 1).padStart(2, '0');
          return `<option value="${value}" ${value === birthdayMonth ? 'selected' : ''}>Tháng ${i + 1}</option>`;
        }).join('')}
      </select>
    </label>
  `;

  const canManage =
    owner ||
    currentClub()?.is_system_admin ||
    currentClub()?.can_manage_activities;

  const controls = (kind, x) =>
    canManage
      ? `<span class="team-actions">${x.approval_status === 'pending' ? `<button class="text-button" data-action="approve-activity" data-id="${kind}:${x.id}">Duyệt</button>` : ''}<button class="text-button" data-action="edit-activity" data-id="${kind}:${x.id}">Sửa</button><button class="text-button danger" data-action="delete-activity" data-id="${kind}:${x.id}">Xóa</button></span>`
      : '';

  const row = (title, text, action = '', pending = false) => `
    <div class="member-row">
      <div>
        <strong>${ctxSafe(title)}</strong>
        <small>${ctxSafe(text)}${pending ? ' · Chờ chủ nhiệm duyệt' : ''}</small>
      </div>
      ${action}
    </div>
  `;

  function ctxSafe(val) {
    return e(val || '');
  }

  return `
    <div class="page-top">
      <div>
        <div class="eyebrow">KHÔNG GIAN CÂU LẠC BỘ</div>
        <h1>Hoạt động CLB</h1>
        <p>Dịp lễ, sinh nhật, lịch tập, điểm danh và khen thưởng.</p>
      </div>
    </div>

    <div class="dashboard-grid">
      <section class="panel">
        <div class="panel-head">
          <h2>Dịp lễ & lời chúc</h2>
          ${button('new-celebration', 'Thêm dịp lễ')}
        </div>
        ${
          celebrations.length
            ? celebrations
                .map((x) =>
                  row(
                    x.title,
                    `${formatDate(x.event_date)}${x.message ? ` · ${x.message}` : ''}`,
                    controls('celebrations', x),
                    x.approval_status === 'pending'
                  )
                )
                .join('')
            : empty('Chưa có dịp lễ', 'Thêm dịp đặc biệt và lời chúc.')
        }
      </section>

      <section class="panel">
        <div class="panel-head">
          <h2>Sinh nhật thành viên</h2>
          ${birthdaySelector}
        </div>
        ${
          birthdayRows.length
            ? birthdayRows
                .map((p) =>
                  row(
                    p.name,
                    `${formatDate(p.date_of_birth)}`,
                    owner
                      ? `<button class="text-button" data-action="edit-birthday" data-id="${p.id}">Sửa hồ sơ</button>`
                      : ''
                  )
                )
                .join('') +
              (birthdayPages > 1
                ? `<div class="table-footer"><span>${monthlyBirthdays.length} sinh nhật tháng ${Number(birthdayMonth)}</span><div><button class="icon-button" data-action="birthday-prev" aria-label="Trang trước" ${s.birthdayPage <= 1 ? 'disabled' : ''}>←</button> ${s.birthdayPage} / ${birthdayPages} <button class="icon-button" data-action="birthday-next" aria-label="Trang sau" ${s.birthdayPage >= birthdayPages ? 'disabled' : ''}>→</button></div></div>`
                : '')
            : empty(
                `Không có sinh nhật tháng ${Number(birthdayMonth)}`,
                'Danh sách sinh nhật được lấy từ hồ sơ thành viên.'
              )
        }
      </section>

      <section class="panel">
        <div class="panel-head">
          <h2>Lịch tập & điểm danh</h2>
          <div class="team-actions">
            ${canManageRoster(currentClub()) ? button('attendance-report', 'Tiến độ điểm danh', 'check', 'secondary') : ''}
            ${button('new-training', 'Tạo lịch tập')}
          </div>
        </div>
        ${
          trainings.length
            ? trainings
                .map((t) =>
                  row(
                    `${t.team_name} · ${formatDate(t.training_date)} ${t.training_time}`,
                    `${t.location} · ${{ scheduled: 'Theo kế hoạch', cancelled: 'Không tập', postponed: 'Hoãn' }[t.training_status] || 'Theo kế hoạch'} · Đã điểm danh ${(t.attendance || []).length}`,
                    `${canManageRoster(currentClub()) && t.team_id && t.training_status === 'scheduled' && t.approval_status === 'approved' ? `<button class="text-button" data-action="attendance" data-id="${t.id}">Điểm danh</button>` : ''}${controls('trainings', t)}`,
                    t.approval_status === 'pending'
                  )
                )
                .join('')
            : empty('Chưa có lịch tập', 'Tạo lịch tập cho đội bóng.')
        }
      </section>

      <section class="panel">
        <div class="panel-head">
          <div>
            <h2>Khen thưởng & phần quà</h2>
            <p>Ghi nhận danh hiệu cá nhân, thành tích và phần quà khen thưởng.</p>
          </div>
          ${canManage ? button('new-award', 'Thêm khen thưởng') : ''}
        </div>
        ${
          awards.length
            ? awards
                .map((a) =>
                  row(
                    `${a.award_year} · ${a.player_name}`,
                    `${a.title}${a.gift ? ` · 🎁 Quà: ${a.gift}` : ''}${a.notes ? ` · 📝 ${a.notes}` : ''}`,
                    controls('awards', a),
                    a.approval_status === 'pending'
                  )
                )
                .join('')
            : empty('Chưa có khen thưởng', 'Ghi nhận cá nhân xuất sắc và phần quà khen thưởng.')
        }
      </section>
    </div>
  `;
}
