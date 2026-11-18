import { dialog, toast } from './components/ui.js';
import { escapeHtml as e } from './utils.js';

const responses = [['pending', 'Chưa phản hồi'], ['yes', 'Tham gia'], ['no', 'Không tham gia'], ['maybe', 'Chưa chắc']];
const attendance = [['unmarked', 'Chưa điểm danh'], ['present', 'Có mặt'], ['absent', 'Vắng'], ['late', 'Đi trễ'], ['excused', 'Có phép']];
const options = (list, current) => list.map(([value, label]) => `<option value="${e(value)}" ${value === current ? 'selected' : ''}>${e(label)}</option>`).join('');

export async function openMatchAttendance({ match, api, base }) {
  const url = base(`/matches/${match.id}/attendance`);
  let rows;
  try { rows = (await api.get(url)).data; }
  catch (error) { toast(error.message, true); return; }
  const cancelled = match.status === 'cancelled';
  const modal = dialog('Đăng ký và điểm danh trận đấu', `${e(match.team_name || 'Đội bóng')} · ${e(match.opponent)} · ${e(match.match_date)}${cancelled ? ' · Trận đã hủy, chỉ xem lịch sử' : ''}`, `<div style="grid-column:1/-1"><label for="match-player-search">Tìm thành viên</label><input id="match-player-search" type="search" placeholder="Tên, email hoặc ngày sinh"><div class="table-wrap"><table><thead><tr><th>Thành viên</th><th>Ngày sinh</th><th>Email</th><th>Vị trí / số áo</th><th>Đăng ký</th><th>Điểm danh</th><th></th></tr></thead><tbody>${rows.map((p) => `<tr data-player="${e(p.player_id)}"><td>${e(p.full_name)}${p.current_member ? '' : ' (đã rời đội)'}</td><td>${e(p.date_of_birth || '—')}</td><td>${e(p.email || '—')}</td><td>${e(p.position || '—')} / ${e(p.jersey_number ?? '—')}</td><td><select aria-label="Đăng ký ${e(p.full_name)}" data-rsvp ${cancelled ? 'disabled' : ''}>${options(responses, p.rsvp)}</select></td><td><select aria-label="Điểm danh ${e(p.full_name)}" data-attendance ${cancelled ? 'disabled' : ''}>${options(attendance, p.attendance)}</select></td><td><button type="button" class="button secondary" data-save ${cancelled ? 'disabled' : ''}>Lưu</button></td></tr>`).join('')}</tbody></table></div><p data-no-players ${rows.length ? 'hidden' : ''}>Không có thành viên phù hợp.</p></div>`, async () => true, 'Đóng');
  modal.style.width = 'min(1100px, 95vw)';
  modal.querySelector('#match-player-search').addEventListener('input', (event) => {
    const term = event.target.value.trim().toLocaleLowerCase('vi');
    let visible = 0;
    modal.querySelectorAll('tbody tr').forEach((row) => {
      row.hidden = !row.textContent.toLocaleLowerCase('vi').includes(term);
      if (!row.hidden) visible++;
    });
    modal.querySelector('[data-no-players]').hidden = visible > 0;
  });
  modal.querySelectorAll('[data-save]').forEach((button) => button.addEventListener('click', async () => {
    const row = button.closest('tr');
    const originalLabel = button.textContent;
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    button.textContent = 'Đang lưu…';
    try {
      await api.request(url, { method: 'PUT', body: { player_id: Number(row.dataset.player), rsvp: row.querySelector('[data-rsvp]').value, attendance: row.querySelector('[data-attendance]').value } });
      toast('Đã lưu đăng ký và điểm danh.');
    } catch (error) { toast(error.message, true); }
    finally { if (button.isConnected) { button.disabled = false; button.removeAttribute('aria-busy'); if (button.textContent === 'Đang lưu…') button.textContent = originalLabel; } }
  }));
  return modal;
}
