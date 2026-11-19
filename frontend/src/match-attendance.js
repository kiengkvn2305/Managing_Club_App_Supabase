import { dialog, toast } from './components/ui.js';
import { escapeHtml as e, compareVietnameseNames } from './utils.js';

const responses = [['pending', 'Chưa phản hồi'], ['yes', 'Tham gia'], ['no', 'Không tham gia'], ['maybe', 'Chưa chắc']];
const attendance = [['unmarked', 'Chưa điểm danh'], ['present', 'Có mặt'], ['absent', 'Vắng'], ['late', 'Đi trễ'], ['excused', 'Có phép']];
const options = (list, current) => list.map(([value, label]) => `<option value="${e(value)}" ${value === current ? 'selected' : ''}>${e(label)}</option>`).join('');

export async function openMatchAttendance({ match, api, base }) {
  const url = base(`/matches/${match.id}/attendance`);
  let rows;
  try { rows = (await api.get(url)).data; }
  catch (error) { toast(error.message, true); return; }
  const cancelled = match.status === 'cancelled';

  // Partition on initial open: previously marked or responded players at top!
  const hasStatus = (p) => (p.rsvp && p.rsvp !== 'pending') || (p.attendance && p.attendance !== 'unmarked');
  const markedRows = rows.filter(hasStatus);
  const unmarkedRows = rows.filter((p) => !hasStatus(p));
  markedRows.sort((a, b) => compareVietnameseNames(a.full_name, b.full_name));
  unmarkedRows.sort((a, b) => compareVietnameseNames(a.full_name, b.full_name));
  const orderedRows = [...markedRows, ...unmarkedRows];

  const sortControls = `
    <div style="display:grid;grid-template-columns:1fr auto;gap:8px;align-items:center;margin-bottom:8px;">
      <input id="match-player-search" type="search" placeholder="Tìm tên, email, ghi chú hoặc ngày sinh..." style="margin:0;">
      <select id="match-player-sort" style="margin:0;">
        <option value="name_asc">Tên A–Z</option>
        <option value="name_desc">Tên Z–A</option>
        <option value="jersey">Số áo</option>
        <option value="position">Vị trí</option>
        <option value="dob">Ngày sinh</option>
      </select>
    </div>
  `;

  const modal = dialog('Đăng ký và điểm danh trận đấu', `${e(match.team_name || 'Đội bóng')} · ${e(match.opponent)} · ${e(match.match_date)}${cancelled ? ' · Trận đã hủy, chỉ xem lịch sử' : ''}`, `<div style="grid-column:1/-1">${sortControls}<div class="table-wrap"><table><thead><tr><th>Thành viên</th><th>Ngày sinh</th><th>Email</th><th>Vị trí / số áo</th><th>Đăng ký</th><th>Điểm danh</th><th></th></tr></thead><tbody>${orderedRows.map((p) => `<tr data-player="${e(p.player_id)}" data-full-name="${e(p.full_name)}" data-jersey="${e(p.jersey_number ?? 9999)}" data-pos="${e(p.position || '')}" data-dob="${e(p.date_of_birth || '')}"><td>${e(p.full_name)}${p.current_member ? '' : ' (đã rời đội)'}</td><td>${e(p.date_of_birth || '—')}</td><td>${e(p.email || '—')}</td><td>${e(p.position || '—')} / ${e(p.jersey_number ?? '—')}</td><td><select aria-label="Đăng ký ${e(p.full_name)}" data-rsvp ${cancelled ? 'disabled' : ''}>${options(responses, p.rsvp)}</select></td><td><select aria-label="Điểm danh ${e(p.full_name)}" data-attendance ${cancelled ? 'disabled' : ''}>${options(attendance, p.attendance)}</select></td><td><button type="button" class="button secondary" data-save ${cancelled ? 'disabled' : ''}>Lưu</button></td></tr>`).join('')}</tbody></table></div><p data-no-players ${orderedRows.length ? 'hidden' : ''}>Không có thành viên phù hợp.</p></div>`, async () => true, 'Đóng');
  modal.style.width = 'min(1100px, 95vw)';

  const searchInput = modal.querySelector('#match-player-search');
  const sortSelect = modal.querySelector('#match-player-sort');
  const tbody = modal.querySelector('tbody');

  const filterAndSort = (shouldSort = false) => {
    const term = searchInput.value.trim().toLocaleLowerCase('vi');
    const sortVal = sortSelect.value;
    const tableRows = [...tbody.querySelectorAll('tr')];

    let visible = 0;
    tableRows.forEach((row) => {
      const matchSearch = !term || row.textContent.toLocaleLowerCase('vi').includes(term);
      row.hidden = !matchSearch;
      if (matchSearch) visible++;
    });
    modal.querySelector('[data-no-players]').hidden = visible > 0;

    if (shouldSort) {
      tableRows.sort((a, b) => {
        if (sortVal === 'name_asc') return compareVietnameseNames(a.dataset.fullName, b.dataset.fullName);
        if (sortVal === 'name_desc') return -1 * compareVietnameseNames(a.dataset.fullName, b.dataset.fullName);
        if (sortVal === 'jersey') return Number(a.dataset.jersey) - Number(b.dataset.jersey);
        if (sortVal === 'position') return a.dataset.pos.localeCompare(b.dataset.pos, 'vi');
        if (sortVal === 'dob') return a.dataset.dob.localeCompare(b.dataset.dob);
        return 0;
      });
      tableRows.forEach((r) => tbody.append(r));
    }
  };

  searchInput.addEventListener('input', () => filterAndSort(false));
  sortSelect.addEventListener('change', () => filterAndSort(true));

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
