import { state as s, currentClub } from '../state.js';
import {
  escapeHtml as e,
  formatDate,
  canManageAttendance,
} from '../utils.js';
import { button, empty } from '../components/ui.js';

export function attendancePage() {
  const club = currentClub();
  const canManage = canManageAttendance(club);
  const trainings = s.activities?.trainings || [];

  const sortDir = s.trainingSort === 'desc' ? -1 : 1;
  const filteredTrainings = trainings
    .filter((t) => {
      if (s.trainingFilterDate && t.training_date !== s.trainingFilterDate) {
        return false;
      }
      if (
        s.trainingFilterTeam &&
        String(t.team_id) !== String(s.trainingFilterTeam)
      ) {
        return false;
      }
      return true;
    })
    .sort((a, b) => {
      const dateCmp = String(a.training_date || '').localeCompare(
        String(b.training_date || '')
      );
      if (dateCmp !== 0) return sortDir * dateCmp;
      const timeCmp = String(a.training_time || '').localeCompare(
        String(b.training_time || '')
      );
      if (timeCmp !== 0) return sortDir * timeCmp;
      return sortDir * (a.id - b.id);
    });

  const dateCounts = new Map();
  trainings.forEach((t) => {
    if (t.training_date) {
      dateCounts.set(t.training_date, (dateCounts.get(t.training_date) || 0) + 1);
    }
  });
  const availableDates = [...dateCounts.keys()].sort();

  const controls = (t) =>
    canManage
      ? `<span class="action-chips">${
          t.team_id && t.training_status === 'scheduled' && t.approval_status === 'approved'
            ? `<button class="chip-button primary" data-action="attendance" data-id="${t.id}">Điểm danh</button>`
            : ''
        }${
          t.approval_status === 'pending'
            ? `<button class="chip-button" data-action="approve-activity" data-id="trainings:${t.id}">Duyệt</button>`
            : ''
        }<button class="chip-button" data-action="edit-activity" data-id="trainings:${t.id}">Sửa</button><button class="chip-button danger" data-action="delete-activity" data-id="trainings:${t.id}">Xóa</button></span>`
      : `<span class="badge inactive">Chỉ xem</span>`;

  return `
    <div class="page-top">
      <div>
        <div class="eyebrow">ĐIỂM DANH & CHUYÊN CẦN</div>
        <h1>Điểm danh buổi tập</h1>
        <p>${canManage ? 'Tạo lịch tập, bấm điểm danh từng buổi và theo dõi tiến độ chuyên cần.' : 'Xem lịch tập và thống kê chuyên cần của các đội bóng (chỉ Chủ nhiệm, Phó chủ nhiệm hoặc người được cấp quyền mới được điểm danh).'}</p>
      </div>
      <div class="page-actions">
        ${button('attendance-report', 'Tiến độ điểm danh', 'check', 'secondary')}
        ${canManage ? button('new-training', 'Tạo lịch tập') : ''}
      </div>
    </div>

    <section class="panel">
      <div class="training-filter-bar">
        <div class="training-filter-controls">
          <label class="training-filter-item">
            <span class="training-filter-label">Chọn ngày tập</span>
            <input type="date" data-training-date value="${e(s.trainingFilterDate || '')}" aria-label="Chọn ngày lọc lịch tập">
          </label>
          <label class="training-filter-item">
            <span class="training-filter-label">Đội bóng</span>
            <select data-training-team aria-label="Lọc theo đội bóng">
              <option value="">Tất cả đội bóng</option>
              ${(s.teams || []).map((t) => `<option value="${e(t.id)}" ${String(s.trainingFilterTeam || '') === String(t.id) ? 'selected' : ''}>${e(t.name)}</option>`).join('')}
            </select>
          </label>
          <label class="training-filter-item">
            <span class="training-filter-label">Thứ tự ngày tháng</span>
            <select data-training-sort aria-label="Sắp xếp theo thứ tự ngày tháng">
              <option value="asc" ${s.trainingSort !== 'desc' ? 'selected' : ''}>Ngày tăng dần (Cũ → Mới)</option>
              <option value="desc" ${s.trainingSort === 'desc' ? 'selected' : ''}>Ngày giảm dần (Mới → Cũ)</option>
            </select>
          </label>
          <div class="training-quick-buttons">
            <button type="button" class="button secondary small" data-action="training-today" title="Xem lịch tập hôm nay">Hôm nay</button>
            ${s.trainingFilterDate || s.trainingFilterTeam ? `<button type="button" class="button secondary small" data-action="training-all" title="Xóa bộ lọc xem tất cả">Xem tất cả</button>` : ''}
          </div>
        </div>

        ${
          availableDates.length > 1
            ? `
          <div class="training-date-pills">
            <span class="training-pills-label">Ngày có lịch:</span>
            <button type="button" class="training-date-pill ${!s.trainingFilterDate ? 'active' : ''}" data-action="training-select-date" data-date="">Tất cả (${trainings.length})</button>
            ${availableDates
              .map(
                (d) =>
                  `<button type="button" class="training-date-pill ${s.trainingFilterDate === d ? 'active' : ''}" data-action="training-select-date" data-date="${e(d)}">${formatDate(d)} (${dateCounts.get(d)})</button>`
              )
              .join('')}
          </div>
        `
            : ''
        }

        <div class="training-filter-status">
          <span class="training-count-badge">
            <strong>${filteredTrainings.length}</strong> lịch tập
          </span>
          <span class="training-count-info">
            ${
              s.trainingFilterDate
                ? `ngày <strong>${formatDate(s.trainingFilterDate)}</strong>${s.trainingFilterTeam ? ` · ${e((s.teams || []).find((t) => String(t.id) === String(s.trainingFilterTeam))?.name || 'Đội đã chọn')}` : ''} (trên tổng số ${trainings.length} buổi tập)`
                : `(hiển thị toàn bộ ${trainings.length} buổi tập theo thứ tự ngày tháng)`
            }
          </span>
        </div>
      </div>

      ${
        filteredTrainings.length
          ? filteredTrainings
              .map(
                (t) => `
          <div class="member-row">
            <div>
              <strong>${e(t.team_name)} · ${e(formatDate(t.training_date))} ${e(t.training_time)}</strong>
              <small>${e(t.location)} · ${e({ scheduled: 'Theo kế hoạch', cancelled: 'Không tập', postponed: 'Hoãn' }[t.training_status] || 'Theo kế hoạch')} · Đã điểm danh ${(t.attendance || []).length}${t.training_status === 'scheduled' ? ' · Tự ghi vắng sau 10 phút' : ''}${t.approval_status === 'pending' ? ' · Chờ chủ nhiệm duyệt' : ''}</small>
            </div>
            ${controls(t)}
          </div>`
              )
              .join('')
          : empty(
              s.trainingFilterDate
                ? `Không có lịch tập nào vào ngày ${formatDate(s.trainingFilterDate)}`
                : 'Chưa có lịch tập',
              s.trainingFilterDate
                ? 'Chọn ngày khác từ thanh lọc hoặc nhấn "Xem tất cả" để xem toàn bộ danh sách.'
                : canManage
                  ? 'Tạo lịch tập cho đội bóng để bắt đầu điểm danh.'
                  : 'Chưa có lịch tập nào được tạo.'
            )
      }
    </section>
  `;
}
