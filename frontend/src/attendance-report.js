import { dialog } from './components/ui.js';
import {
  escapeHtml as e,
  formatDate,
  unpackList,
  vietnamToday,
  compareVietnameseNames,
} from './utils.js';

export function summarizeAttendance(statuses) {
  const marked = statuses.filter((status) =>
    ['present', 'absent', 'excused'].includes(status)
  ).length;
  const present = statuses.filter((status) => status === 'present').length;
  const absent = statuses.filter((status) => status === 'absent').length;
  const excused = statuses.filter((status) => status === 'excused').length;
  const unmarked = statuses.filter(
    (status) => !status || status === 'unmarked'
  ).length;
  return {
    marked,
    present,
    percent: marked ? Math.round((present / marked) * 100) : null,
    absent,
    excused,
    unmarked,
  };
}

export function openAttendanceReport({ teams, trainings, api, base }) {
  const today = vietnamToday(),
    year = today.slice(0, 4),
    month = today.slice(5, 7);

  const sortOptions = [
    ['present_desc', 'Số ngày có mặt (Nhiều nhất)'],
    ['absent_desc', 'Số ngày vắng (Nhiều nhất)'],
    ['excused_desc', 'Số ngày phép (Nhiều nhất)'],
    ['percent_desc', 'Tỷ lệ có mặt (%) cao nhất'],
    ['name_asc', 'Tên A–Z'],
    ['name_desc', 'Tên Z–A'],
    ['present_asc', 'Số ngày có mặt (Ít nhất)'],
    ['absent_asc', 'Số ngày vắng (Ít nhất)'],
    ['excused_asc', 'Số ngày phép (Ít nhất)'],
    ['percent_asc', 'Tỷ lệ có mặt (%) thấp nhất'],
    ['notes', 'Theo ghi chú'],
  ];

  const fields = `
    <div class="member-picker">
      <div class="attendance-report-filters">
        <label class="report-team"> <span>Đội bóng</span>
          <select data-report-team>
            ${teams.map((t) => `<option value="${e(t.id)}">${e(t.name)}</option>`).join('')}
          </select>
        </label>
        <label class="report-period"> <span>Kỳ xem</span>
          <select data-report-period>
            <option value="month">Tháng</option>
            <option value="quarter">Quý</option>
            <option value="year">Năm</option>
          </select>
        </label>
        <label class="report-year"> <span>Năm</span>
          <input type="number" data-report-year min="1900" max="2100" value="${e(year)}">
        </label>
        <label data-report-month-label class="report-month"> <span>Tháng</span>
          <select data-report-month>
            ${Array.from({ length: 12 }, (_, i) => `<option value="${String(i + 1).padStart(2, '0')}" ${String(i + 1).padStart(2, '0') === month ? 'selected' : ''}>Tháng ${i + 1}</option>`).join('')}
          </select>
        </label>
        <label data-report-quarter-label class="report-quarter" hidden> <span>Quý</span>
          <select data-report-quarter>
            ${[1, 2, 3, 4].map((q) => `<option value="${q}" ${q === Math.ceil(Number(month) / 3) ? 'selected' : ''}>Quý ${q}</option>`).join('')}
          </select>
        </label>
        <label class="report-search"> <span>Tìm</span>
          <input type="search" data-report-search placeholder="Tìm tên hoặc ghi chú…">
        </label>
        <label class="report-sort"> <span>Sắp xếp</span>
          <select data-report-sort>
            ${sortOptions.map(([val, label]) => `<option value="${val}">${label}</option>`).join('')}
          </select>
        </label>
      </div>
      <div data-report-body></div>
    </div>
  `;

  const modal = dialog(
    'Tiến độ điểm danh',
    '✓ Có mặt · Vắng · Phép · — Chưa điểm danh. Bảng thống kê chi tiết số lượng ngày và tỷ lệ tham gia của từng thành viên.',
    fields,
    async () => true,
    'Đóng'
  );
  modal.classList.add('member-picker-dialog');
  modal.style.width = 'min(1200px, 96vw)';

  const teamSelect = modal.querySelector('[data-report-team]'),
    period = modal.querySelector('[data-report-period]'),
    body = modal.querySelector('[data-report-body]');

  let players = [],
    loadedTeam = '',
    serial = 0;

  const render = () => {
    const y = modal.querySelector('[data-report-year]').value,
      mode = period.value,
      m = modal.querySelector('[data-report-month]').value,
      q = Number(modal.querySelector('[data-report-quarter]').value);

    modal.querySelector('[data-report-month-label]').hidden = mode !== 'month';
    modal.querySelector('[data-report-quarter-label]').hidden = mode !== 'quarter';

    const sessions = trainings
      .filter(
        (t) =>
          String(t.team_id) === teamSelect.value &&
          t.approval_status === 'approved' &&
          t.training_status === 'scheduled' &&
          String(t.training_date).slice(0, 4) === y &&
          (mode === 'year' ||
            (mode === 'month'
              ? t.training_date.slice(5, 7) === m
              : Math.ceil(Number(t.training_date.slice(5, 7)) / 3) === q))
      )
      .sort(
        (a, b) =>
          String(a.training_date).localeCompare(String(b.training_date)) ||
          String(a.training_time).localeCompare(String(b.training_time)) ||
          a.id - b.id
      );

    const byId = new Map(
      players.map((p) => [
        String(p.id),
        { id: p.id, name: p.full_name, notes: p.notes || '' },
      ])
    );

    sessions.forEach((session) =>
      (session.attendance || []).forEach((p) => {
        if (!byId.has(String(p.player_id))) {
          byId.set(String(p.player_id), {
            id: p.player_id,
            name: p.name,
            notes: '',
          });
        }
      })
    );

    const rawRows = [...byId.values()].map((p) => {
      const values = sessions.map(
        (t) =>
          (t.attendance || []).find(
            (entry) => String(entry.player_id) === String(p.id)
          )?.status
      );
      const summary = summarizeAttendance(values);
      return { ...p, values, summary };
    });

    const query = modal
      .querySelector('[data-report-search]')
      .value.trim()
      .toLocaleLowerCase('vi');

    const filteredRows = rawRows.filter((p) =>
      `${p.name} ${p.notes}`.toLocaleLowerCase('vi').includes(query)
    );

    const sortVal = modal.querySelector('[data-report-sort]').value;
    filteredRows.sort((a, b) => {
      if (sortVal === 'present_desc') {
        return (
          b.summary.present - a.summary.present ||
          (b.summary.percent ?? -1) - (a.summary.percent ?? -1) ||
          compareVietnameseNames(a.name, b.name)
        );
      }
      if (sortVal === 'present_asc') {
        return (
          a.summary.present - b.summary.present ||
          (a.summary.percent ?? 999) - (b.summary.percent ?? 999) ||
          compareVietnameseNames(a.name, b.name)
        );
      }
      if (sortVal === 'absent_desc') {
        return (
          b.summary.absent - a.summary.absent ||
          compareVietnameseNames(a.name, b.name)
        );
      }
      if (sortVal === 'absent_asc') {
        return (
          a.summary.absent - b.summary.absent ||
          compareVietnameseNames(a.name, b.name)
        );
      }
      if (sortVal === 'excused_desc') {
        return (
          b.summary.excused - a.summary.excused ||
          compareVietnameseNames(a.name, b.name)
        );
      }
      if (sortVal === 'excused_asc') {
        return (
          a.summary.excused - b.summary.excused ||
          compareVietnameseNames(a.name, b.name)
        );
      }
      if (sortVal === 'percent_desc') {
        const pa = a.summary.percent ?? -1;
        const pb = b.summary.percent ?? -1;
        return (
          pb - pa ||
          b.summary.present - a.summary.present ||
          compareVietnameseNames(a.name, b.name)
        );
      }
      if (sortVal === 'percent_asc') {
        const pa = a.summary.percent ?? 999;
        const pb = b.summary.percent ?? 999;
        return (
          pa - pb ||
          a.summary.present - b.summary.present ||
          compareVietnameseNames(a.name, b.name)
        );
      }
      if (sortVal === 'notes') {
        return (
          (b.notes ? 1 : 0) - (a.notes ? 1 : 0) ||
          compareVietnameseNames(a.name, b.name)
        );
      }
      if (sortVal === 'desc' || sortVal === 'name_desc') {
        return -1 * compareVietnameseNames(a.name, b.name);
      }
      // default: name_asc (or 'asc' for backwards-compatibility)
      return compareVietnameseNames(a.name, b.name);
    });

    const statusBadge = (v) => {
      if (v === 'present')
        return '<span style="color:var(--green);font-weight:700;" title="Có mặt">✓</span>';
      if (v === 'absent')
        return '<span style="color:var(--red);font-weight:600;" title="Vắng">Vắng</span>';
      if (v === 'excused')
        return '<span style="color:var(--yellow, #ca8a04);font-weight:600;" title="Có phép">Phép</span>';
      return '<span style="color:var(--muted);">—</span>';
    };

    const totalPresent = filteredRows.reduce(
      (sum, r) => sum + r.summary.present,
      0
    );
    const totalAbsent = filteredRows.reduce((sum, r) => sum + r.summary.absent, 0);
    const totalExcused = filteredRows.reduce(
      (sum, r) => sum + r.summary.excused,
      0
    );
    const totalMarked = filteredRows.reduce((sum, r) => sum + r.summary.marked, 0);
    const overallPercent = totalMarked
      ? Math.round((totalPresent / totalMarked) * 100)
      : null;

    body.innerHTML = sessions.length
      ? `
      <div class="table-wrap" style="max-height:65dvh;overflow:auto;">
        <table>
          <thead>
            <tr>
              <th style="min-width:140px;position:sticky;left:0;background:var(--surface);z-index:2;">Thành viên</th>
              ${sessions
                .map(
                  (t) =>
                    `<th style="text-align:center;min-width:70px;">${e(formatDate(t.training_date))}<br><small style="color:var(--muted);">${e(t.training_time || '')}</small></th>`
                )
                .join('')}
              <th style="text-align:center;color:var(--green);min-width:65px;" title="Số lượng buổi có mặt">Có mặt</th>
              <th style="text-align:center;color:var(--red);min-width:60px;" title="Số lượng buổi vắng">Vắng</th>
              <th style="text-align:center;color:var(--yellow, #ca8a04);min-width:60px;" title="Số lượng buổi có phép">Phép</th>
              <th style="text-align:center;min-width:90px;" title="Tỷ lệ có mặt trên các buổi đã điểm danh">Tỷ lệ (%)</th>
            </tr>
          </thead>
          <tbody>
            ${filteredRows
              .map(
                (p) => `
              <tr>
                <td style="position:sticky;left:0;background:var(--surface);z-index:1;">
                  <strong>${e(p.name)}</strong>
                  ${p.notes ? `<small style="display:block;color:var(--muted);">${e(p.notes)}</small>` : ''}
                </td>
                ${p.values.map((v) => `<td style="text-align:center;">${statusBadge(v)}</td>`).join('')}
                <td style="text-align:center;font-weight:700;color:var(--green);">${p.summary.present}</td>
                <td style="text-align:center;font-weight:700;color:var(--red);">${p.summary.absent}</td>
                <td style="text-align:center;font-weight:700;color:var(--yellow, #ca8a04);">${p.summary.excused}</td>
                <td style="text-align:center;">
                  <strong>${p.summary.percent !== null ? `${p.summary.percent}%` : '—'}</strong>
                  <small style="display:block;color:var(--muted);">${p.summary.present}/${p.summary.marked}</small>
                </td>
              </tr>
            `
              )
              .join('')}
          </tbody>
          <tfoot>
            <tr style="font-weight:600;background:var(--bg-subtle, rgba(0,0,0,0.02));border-top:2px solid var(--border);">
              <td style="position:sticky;left:0;background:var(--surface);z-index:1;">Tổng cộng (${filteredRows.length} người)</td>
              ${sessions
                .map((t, idx) => {
                  const sessPresent = filteredRows.filter(
                    (r) => r.values[idx] === 'present'
                  ).length;
                  return `<td style="text-align:center;color:var(--green);">${sessPresent} ✓</td>`;
                })
                .join('')}
              <td style="text-align:center;color:var(--green);">${totalPresent}</td>
              <td style="text-align:center;color:var(--red);">${totalAbsent}</td>
              <td style="text-align:center;color:var(--yellow, #ca8a04);">${totalExcused}</td>
              <td style="text-align:center;">${overallPercent !== null ? `${overallPercent}%` : '—'}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    `
      : '<p class="panel-body">Không có buổi tập phù hợp trong khoảng đã chọn.</p>';
  };

  const loadTeam = async () => {
    const team = teamSelect.value,
      request = ++serial;
    if (!team) {
      body.textContent = 'Chưa có đội bóng.';
      return;
    }
    body.textContent = 'Đang tải thành viên...';
    const list = [];
    let page = 1,
      last = 1;
    try {
      do {
        const result = unpackList(
          await api.get(
            base(
              `/members?team_id=${encodeURIComponent(team)}&per_page=100&page=${page}`
            )
          )
        );
        list.push(...result.rows);
        last = result.meta.last_page || 1;
        page++;
      } while (page <= last);
      if (request !== serial || !modal.isConnected) return;
      players = list;
      loadedTeam = team;
      render();
    } catch (error) {
      if (request === serial) body.textContent = error.message;
    }
  };

  modal.querySelector('.member-picker').addEventListener('input', () => {
    if (loadedTeam === teamSelect.value) render();
  });
  modal.querySelector('.member-picker').addEventListener('change', (event) => {
    if (event.target === teamSelect) loadTeam();
    else if (loadedTeam === teamSelect.value) render();
  });

  loadTeam();
  return modal;
}
