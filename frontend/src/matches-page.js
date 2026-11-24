import { state as s, currentClub } from './state.js';
import { escapeHtml as e, number, canManageRoster, formatDate } from './utils.js';
import { button, empty, dateControl } from './components/ui.js';

const iso = (date) => date.toISOString().slice(0, 10);
const parse = (date) => { const [y, m, d] = date.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };
const monday = (date) => { const out = new Date(date); out.setUTCDate(out.getUTCDate() - (out.getUTCDay() + 6) % 7); return out; };
export function calendarRange(view, month, day) {
  const first = view === 'week' ? monday(parse(day)) : monday(parse(`${month}-01`));
  let last;
  if (view === 'week') { last = new Date(first); last.setUTCDate(last.getUTCDate() + 6); }
  else { const [year, m] = month.split('-').map(Number); last = new Date(Date.UTC(year, m, 0)); last.setUTCDate(last.getUTCDate() + (7 - last.getUTCDay()) % 7); }
  return { from: iso(first), to: iso(last) };
}

function calendarMarkup() {
  const range = calendarRange(s.matchesView, s.matchesMonth, s.matchesWeek), start = parse(range.from), end = parse(range.to), days = [];
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) days.push(iso(d));
  return `<div class="match-calendar-scroll"><div class="match-calendar">${['T2','T3','T4','T5','T6','T7','CN'].map((day) => `<div class="match-calendar-header">${day}</div>`).join('')}${days.map((day) => `<div class="match-calendar-day ${s.matchesView === 'month' && !day.startsWith(s.matchesMonth) ? 'outside' : ''}"><strong>${e(day.slice(8, 10))}</strong>${s.matchCalendar.filter((m) => m.match_date === day).map((m) => `<button class="match-calendar-event ${m.status === 'cancelled' ? 'cancelled' : ''}" data-action="edit-match" data-id="${m.id}">${e(m.start_time)} · ${e(m.opponent)}${m.status === 'completed' ? ` · ${e(m.our_score)}–${e(m.opponent_score)}` : ''}</button><button class="match-calendar-attendance" data-action="match-lineup" data-id="${m.id}">Đội hình</button><button class="match-calendar-attendance" data-action="match-attendance" data-id="${m.id}">Điểm danh</button>${m.status === 'completed' ? `<button class="match-calendar-attendance" data-action="match-player-stats" data-id="${m.id}">Thống kê</button>` : ''}`).join('')}</div>`).join('')}</div></div><p class="calendar-caption">${e(formatDate(range.from))} → ${e(formatDate(range.to))} · Chọn một trận để chỉnh sửa.</p>`;
}

export function matchesPage() {
  if (!canManageRoster(currentClub())) {
    return `<div class="page-top"><div><div class="eyebrow">BÓNG ĐÁ</div><h1>Lịch trận đấu</h1><p>Thông tin được bảo vệ theo quyền truy cập.</p></div></div><section class="panel">${empty('Quyền truy cập được bảo vệ', 'Bạn không có quyền xem lịch trận đấu.')}</section>`;
  }
  const { data = [], meta = {} } = s.matches;
  const labels = { friendly: 'Giao hữu', tournament: 'Giải đấu', practice: 'Tập luyện' }, statuses = { scheduled: 'Đã lên lịch', completed: 'Đã kết thúc', cancelled: 'Đã hủy' };
  const list = data.length ? `<div class="table-wrap"><table><thead><tr><th>Ngày giờ</th><th>Đội</th><th>Đối thủ</th><th>Loại trận</th><th>Sân</th><th class="text-center">Trạng thái</th><th class="text-center">Tỷ số</th><th>Ghi chú</th><th>Thao tác</th></tr></thead><tbody>${data.map((m) => `<tr><td class="tabular-nums">${e(formatDate(m.match_date))} · ${e(m.start_time)}${m.end_time ? `–${e(m.end_time)}` : ''}</td><td><strong>${e(m.team_name || 'Đội đã xóa')}</strong></td><td>${e(m.opponent)}</td><td>${e(labels[m.match_type] || m.match_type)}</td><td>${e(m.location || '—')}</td><td class="text-center"><span class="badge ${m.status === 'completed' ? 'active' : m.status === 'cancelled' ? 'injured' : ''}">${e(statuses[m.status] || m.status)}</span></td><td class="text-center tabular-nums font-bold">${m.status === 'completed' ? `${e(m.our_score)} – ${e(m.opponent_score)}` : '—'}</td><td class="truncate" style="max-width:180px;" title="${e(m.notes || '')}">${e(m.notes || '—')}</td><td><div class="team-actions"><button class="text-button" data-action="edit-match" data-id="${m.id}">Chỉnh sửa</button><button class="text-button" data-action="match-lineup" data-id="${m.id}">Đội hình</button><button class="text-button" data-action="match-attendance" data-id="${m.id}">Đăng ký / điểm danh</button>${m.status === 'completed' ? `<button class="text-button" data-action="match-player-stats" data-id="${m.id}">Thống kê</button>` : ''}</div></td></tr>`).join('')}</tbody></table></div><div class="table-footer"><span>${number(meta.total)} trận</span><div><button class="icon-button" data-action="matches-prev" aria-label="Trang trước" ${meta.current_page <= 1 ? 'disabled' : ''}>←</button> ${meta.current_page} / ${meta.last_page} <button class="icon-button" data-action="matches-next" aria-label="Trang sau" ${meta.current_page >= meta.last_page ? 'disabled' : ''}>→</button></div></div>` : empty('Chưa có trận đấu trong tháng', 'Tạo lịch trận hoặc chọn tháng khác.');
  return `<div class="page-top"><div><div class="eyebrow">BÓNG ĐÁ</div><h1>Lịch trận đấu</h1><p>Lịch và kết quả của CLB; dữ liệu của hai CLB được quản lý riêng.</p></div><div class="page-actions">${button('stats-summary', 'Thống kê cầu thủ', 'users', 'secondary')}${button('new-match', 'Tạo trận đấu')}</div></div><section class="panel"><form class="filters" data-form="matches-filter"><label>Hiển thị <select name="view"><option value="list" ${s.matchesView === 'list' ? 'selected' : ''}>Danh sách</option><option value="month" ${s.matchesView === 'month' ? 'selected' : ''}>Lịch tháng</option><option value="week" ${s.matchesView === 'week' ? 'selected' : ''}>Lịch tuần</option></select></label><label>Tháng <input type="month" name="month" value="${e(s.matchesMonth)}" required></label><label>Ngày trong tuần ${dateControl('week', s.matchesWeek, { required: true })}</label><button class="button secondary">Xem</button></form>${s.matchesView === 'list' ? list : calendarMarkup()}</section>`;
}
