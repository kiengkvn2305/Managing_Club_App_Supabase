import { formatDate } from './utils.js';
import { dialog, field, select, showErrors, toast } from './components/ui.js';
import { escapeHtml as e, unpackList, compareVietnameseNames } from './utils.js';
import { avatar, imageUrl } from './images.js';

async function allPlayers(api, base, teamId = '') {
  const result = []; let page = 1, last = 1;
  do {
    const query = new URLSearchParams({ page, per_page: 100, ...(teamId ? { team_id: teamId } : {}) });
    const list = unpackList(await api.get(base(`/members?${query}`)));
    result.push(...list.rows); last = list.meta.last_page || 1; page++;
  } while (page <= last);
  return result;
}
function saveDialog(title, description, fields, save) {
  return dialog(title, description, fields, async (form) => {
    const button = form.querySelector('[type="submit"]'); if (button.disabled) return false;
    button.disabled = true;
    try { await save(form); return true; }
    catch (error) { showErrors(form, error.errors || {}, error.message); return false; }
    finally { if (button.isConnected) button.disabled = false; }
  });
}
export async function activityAction(action, id, { state: s, api, base, reload }) {
  const post = async (path, data) => { await api.post(base(path), data); await reload(); toast('Đã lưu.'); };
  if (['edit-activity', 'delete-activity', 'approve-activity'].includes(action)) {
    const [kind, key] = id.split(':'), list = s.activities[kind], item = list?.find((x) => String(x.id) === key);
    if (!item) return;
    const path = `/activities/${kind}/${key}`;
    if (action === 'approve-activity') { await api.patch(base(`${path}/approve`), {}); await reload(); toast('Đã duyệt hoạt động.'); return; }
    if (action === 'delete-activity') return saveDialog('Xóa hoạt động?', 'Hoạt động này sẽ bị xóa.', '', async () => { await api.delete(base(path)); await reload(); toast('Đã xóa hoạt động.'); });
    let fields;
    if (kind === 'celebrations') fields = field('title', 'Tên dịp lễ', item.title, 'text', true) + field('event_date', 'Ngày', item.event_date, 'date', true) + field('message', 'Lời chúc', item.message || '', 'textarea');
    if (kind === 'trainings') fields = (item.team_id ? select('team_id', 'Đội bóng', s.teams.map((t) => [t.id, t.name]), item.team_id) : '') + field('training_date', 'Ngày tập', item.training_date, 'date', true) + field('training_time', 'Giờ tập', item.training_time, 'time', true) + field('location', 'Địa điểm', item.location, 'text', true) + select('training_status', 'Trạng thái', [['scheduled', 'Theo kế hoạch'], ['cancelled', 'Không tập'], ['postponed', 'Hoãn']], item.training_status) + field('notes', 'Ghi chú', item.notes || '', 'textarea');
    if (kind === 'awards') fields = (item.player_id ? select('player_id', 'Thành viên', (s.activities.players || []).map((p) => [p.id, p.full_name]), item.player_id) : '') + field('award_year', 'Năm', item.award_year, 'number', true).replace('min="0" max="999"', 'min="1900" max="2100"') + field('title', 'Danh hiệu', item.title, 'text', true) + field('gift', 'Phần quà', item.gift || '') + field('notes', 'Ghi chú', item.notes || '', 'textarea');
    return saveDialog('Chỉnh sửa hoạt động', 'Cập nhật thông tin hoạt động.', fields, async (form) => { await api.patch(base(path), Object.fromEntries(new FormData(form))); await reload(); toast('Đã cập nhật hoạt động.'); });
  }
  if (action === 'new-celebration') return saveDialog('Thêm dịp lễ', 'Lưu ngày và lời chúc để CLB theo dõi.', field('title', 'Tên dịp lễ', '', 'text', true) + field('event_date', 'Ngày', '', 'date', true) + field('message', 'Lời chúc', '', 'textarea'), async (form) => {
    await post('/activities/celebrations', { title: form.elements.title.value.trim(), event_date: form.elements.event_date.value, message: form.elements.message.value.trim() || null });
  });
  if (action === 'new-training') {
    if (!s.teams.length) { toast('Hãy tạo đội bóng trước.', true); return; }
    return saveDialog('Tạo lịch tập', 'Chọn đội bóng, ngày giờ và địa điểm.', select('team_id', 'Đội bóng', s.teams.map((t) => [t.id, t.name])) + field('training_date', 'Ngày tập', '', 'date', true) + field('training_time', 'Giờ tập', '', 'time', true) + field('location', 'Địa điểm', '', 'text', true) + field('notes', 'Ghi chú', '', 'textarea'), async (form) => {
      await post('/activities/trainings', { team_id: Number(form.elements.team_id.value), training_date: form.elements.training_date.value, training_time: form.elements.training_time.value, location: form.elements.location.value.trim(), notes: form.elements.notes.value.trim() || null });
    });
  }
  if (action === 'new-award') {
    const players = s.activities.players || [];
    if (!players.length) { toast('Hãy tạo thành viên CLB trước.', true); return; }
    return saveDialog('Khen thưởng cá nhân', 'Lưu danh hiệu và phần quà theo năm.', select('player_id', 'Thành viên', players.map((p) => [p.id, p.full_name])) + field('award_year', 'Năm', new Date().getFullYear(), 'number', true).replace('min="0" max="999"', 'min="1900" max="2100"') + field('title', 'Danh hiệu', '', 'text', true) + field('gift', 'Phần quà', '') + field('notes', 'Ghi chú', '', 'textarea'), async (form) => {
      await post('/activities/awards', { player_id: Number(form.elements.player_id.value), award_year: form.elements.award_year.value, title: form.elements.title.value.trim(), gift: form.elements.gift.value.trim() || null, notes: form.elements.notes.value.trim() || null });
    });
  }
  if (action === 'attendance') {
    const training = s.activities.trainings.find((x) => String(x.id) === id);
    if (!training?.team_id) { toast('Đội bóng không còn hoạt động.', true); return; }
    const players = await allPlayers(api, base, training.team_id);
    const previous = new Map((training.attendance || []).map((x) => [String(x.player_id), x.status]));
    const position = (p) => (p.teams || []).find((t) => String(t.id) === String(training.team_id))?.position || '';
    const positions = [...new Set(players.map(position).filter(Boolean))].sort();

    // Partition on initial open: previously marked members at top!
    const markedPlayers = players.filter((p) => previous.has(String(p.id)) && previous.get(String(p.id)));
    const unmarkedPlayers = players.filter((p) => !previous.has(String(p.id)) || !previous.get(String(p.id)));
    markedPlayers.sort((a, b) => compareVietnameseNames(a.full_name, b.full_name));
    unmarkedPlayers.sort((a, b) => compareVietnameseNames(a.full_name, b.full_name));
    const orderedPlayers = [...markedPlayers, ...unmarkedPlayers];

    const fields = `<div class="member-picker"><div class="filters"><label>Tìm tên / ghi chú <input type="search" data-att-name placeholder="Nhập tên hoặc ghi chú"></label><label>Năm sinh <input type="number" data-att-year min="1900" max="2100" placeholder="Năm"></label><label>Chân thuận <select data-att-foot><option value="">Tất cả</option><option value="left">Trái</option><option value="right">Phải</option><option value="both">Hai chân</option></select></label><label>Vị trí <select data-att-position><option value="">Tất cả</option>${positions.map((p) => `<option value="${e(p)}">${e(p)}</option>`).join('')}</select></label><label>Sắp xếp <select data-att-sort><option value="asc">Tên A–Z</option><option value="desc">Tên Z–A</option><option value="notes">Theo ghi chú</option><option value="foot">Theo chân thuận</option><option value="year">Theo năm sinh</option><option value="position">Theo vị trí</option></select></label></div><div class="member-picker-list attendance-list">${orderedPlayers.map((p) => { const team = (p.teams || []).find((t) => String(t.id) === String(training.team_id)); const info = [p.date_of_birth ? `Ngày sinh: ${formatDate(p.date_of_birth)}` : '', p.preferred_foot ? (p.preferred_foot === 'right' ? 'Chân phải' : p.preferred_foot === 'left' ? 'Chân trái' : 'Hai chân') : '', p.email, p.phone, team?.position, team?.jersey_number != null ? `#${team.jersey_number}` : '', p.notes ? `Ghi chú: ${p.notes}` : ''].filter(Boolean).join(' · '); return `<label data-attendance-row data-name="${e(p.full_name.toLocaleLowerCase('vi'))}" data-notes="${e(p.notes || '')}" data-year="${e((p.date_of_birth || '').slice(0, 4))}" data-foot="${e(p.preferred_foot || '')}" data-position="${e(position(p))}"><span class="attendance-person">${avatar(p.full_name, imageUrl('player', p.id, p.avatar_version, s.clubId))}<span><strong>${e(p.full_name)}</strong><small>${e(info || 'Chưa có thông tin bổ sung')}</small></span></span><select data-player="${p.id}" aria-label="Điểm danh ${e(p.full_name)} ${e(info)}"><option value="">Chưa điểm danh</option>${[['present', 'Có mặt'], ['absent', 'Vắng'], ['excused', 'Có phép']].map(([v, label]) => `<option value="${v}" ${previous.get(String(p.id)) === v ? 'selected' : ''}>${label}</option>`).join('')}</select></label>`; }).join('') || '<p>Đội chưa có thành viên.</p>'}</div></div>`;
    const modal = saveDialog('Điểm danh', `${e(training.team_name)} · ${e(formatDate(training.training_date))}`, fields, async (form) => {
      const selected = [...form.querySelectorAll('[data-player]')].filter((x) => x.value).map((x) => ({ player_id: Number(x.dataset.player), status: x.value }));
      await api.patch(base(`/activities/trainings/${training.id}/attendance`), { players: selected }); await reload(); toast('Đã lưu điểm danh.');
    });
    modal.classList.add('member-picker-dialog');
    modal.querySelectorAll('[data-attendance-row]').forEach((row) => { const player = players.find((p) => String(p.id) === row.querySelector('[data-player]').dataset.player); row.dataset.fullName = player.full_name; row.dataset.name = `${player.full_name} ${player.notes || ''}`.toLocaleLowerCase('vi'); });
    const filter = () => {
      const name = modal.querySelector('[data-att-name]').value.trim().toLocaleLowerCase('vi');
      const year = modal.querySelector('[data-att-year]').value;
      const foot = modal.querySelector('[data-att-foot]').value;
      const pos = modal.querySelector('[data-att-position]').value;
      const sortVal = modal.querySelector('[data-att-sort]').value;
      const list = modal.querySelector('.attendance-list');
      const items = [...list.querySelectorAll('[data-attendance-row]')];
      items.forEach((row) => {
        row.hidden = !row.dataset.name.includes(name) || (year && row.dataset.year !== year) || (foot && row.dataset.foot !== foot) || (pos && row.dataset.position !== pos);
      });
      items.sort((a, b) => {
        if (sortVal === 'asc') return compareVietnameseNames(a.dataset.fullName, b.dataset.fullName);
        if (sortVal === 'desc') return -1 * compareVietnameseNames(a.dataset.fullName, b.dataset.fullName);
        if (sortVal === 'notes') return (b.dataset.notes ? 1 : 0) - (a.dataset.notes ? 1 : 0) || compareVietnameseNames(a.dataset.fullName, b.dataset.fullName);
        if (sortVal === 'foot') return (a.dataset.foot || '').localeCompare(b.dataset.foot || '') || compareVietnameseNames(a.dataset.fullName, b.dataset.fullName);
        if (sortVal === 'year') return (a.dataset.year || '').localeCompare(b.dataset.year || '') || compareVietnameseNames(a.dataset.fullName, b.dataset.fullName);
        if (sortVal === 'position') return (a.dataset.position || '').localeCompare(b.dataset.position || '') || compareVietnameseNames(a.dataset.fullName, b.dataset.fullName);
        return 0;
      });
      items.forEach((row) => list.append(row));
    };
    modal.querySelector('.filters').addEventListener('input', filter);
    modal.querySelector('.filters').addEventListener('change', filter);
    filter();
    return modal;
  }
}
