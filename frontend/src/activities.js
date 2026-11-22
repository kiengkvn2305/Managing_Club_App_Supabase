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

export function openAwardDialog({
  title = 'Khen thưởng cá nhân',
  description = 'Ghi nhận thành tích, danh hiệu và phần quà trao tặng cho thành viên CLB.',
  initialAward = {},
  players = [],
  onSubmit,
}) {
  const selectedPlayerId = initialAward.player_id ? String(initialAward.player_id) : '';
  const initialPlayer = players.find((p) => String(p.id) === selectedPlayerId);
  const selectedPlayerName = initialPlayer ? initialPlayer.full_name : (initialAward.player_name || '');
  const awardYear = initialAward.award_year || new Date().getFullYear();
  const awardTitle = initialAward.title || '';
  const gift = initialAward.gift || '';
  const notes = initialAward.notes || '';

  // Partition: pre-selected recipient at the top
  const selectedPlayers = players.filter((p) => String(p.id) === selectedPlayerId);
  const unselectedPlayers = players.filter((p) => String(p.id) !== selectedPlayerId);
  selectedPlayers.sort((a, b) => compareVietnameseNames(a.full_name, b.full_name));
  unselectedPlayers.sort((a, b) => compareVietnameseNames(a.full_name, b.full_name));
  const orderedPlayers = [...selectedPlayers, ...unselectedPlayers];

  const searchBlobOf = (p) =>
    [
      p.full_name,
      p.date_of_birth,
      p.date_of_birth ? formatDate(p.date_of_birth) : '',
      p.notes,
      p.email,
      p.phone,
    ]
      .filter(Boolean)
      .join(' ')
      .toLocaleLowerCase('vi');

  const renderRow = (p) => {
    const isChecked = String(p.id) === selectedPlayerId;
    const dobFormatted = p.date_of_birth ? formatDate(p.date_of_birth) : '';
    return `
      <label data-award-player-row
        data-id="${e(p.id)}"
        data-full-name="${e(p.full_name)}"
        data-dob="${e(p.date_of_birth || '')}"
        data-notes="${e(p.notes || '')}"
        data-search="${e(searchBlobOf(p))}"
        style="display:grid;grid-template-columns:28px minmax(140px, 1.2fr) minmax(115px, 0.9fr) minmax(140px, 1.4fr);gap:10px;align-items:center;padding:10px 12px;border-bottom:1px solid var(--border);cursor:pointer;background:${isChecked ? 'var(--primary-subtle, rgba(16, 185, 129, 0.08))' : 'var(--surface)'};transition:background 0.15s;"
      >
        <input type="radio" name="selected_player_id" value="${e(p.id)}" ${isChecked ? 'checked' : ''} style="margin:0;cursor:pointer;width:18px;height:18px;">
        <div style="min-width:0;">
          <strong style="color:var(--text);font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:block;">${e(p.full_name)}</strong>
          ${p.email || p.phone ? `<small style="color:var(--muted);font-size:11px;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${e([p.email, p.phone].filter(Boolean).join(' · '))}</small>` : ''}
        </div>
        <div style="font-size:12.5px;color:var(--muted);font-variant-numeric:tabular-nums;white-space:nowrap;">
          ${dobFormatted ? `📅 ${e(dobFormatted)}` : '<span style="color:var(--muted);opacity:0.5;">Chưa có NS</span>'}
        </div>
        <div style="min-width:0;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
          ${p.notes ? `<span style="background:var(--bg-subtle, rgba(0,0,0,0.06));padding:2px 8px;border-radius:4px;border:1px solid var(--border);color:var(--text);display:inline-block;max-width:100%;overflow:hidden;text-overflow:ellipsis;" title="${e(p.notes)}">📝 ${e(p.notes)}</span>` : '<span style="color:var(--muted);opacity:0.5;">—</span>'}
        </div>
      </label>
    `;
  };

  const fields = `
    <div style="grid-column:1/-1;">
      <div style="display:grid;grid-template-columns:130px 1fr;gap:12px;margin-bottom:12px;">
        <label style="margin:0;">
          <span style="display:block;font-weight:600;font-size:13px;margin-bottom:4px;">Năm khen thưởng *</span>
          <input type="number" name="award_year" min="1900" max="2100" value="${e(awardYear)}" required style="margin:0;width:100%;">
        </label>
        <label style="margin:0;">
          <span style="display:block;font-weight:600;font-size:13px;margin-bottom:4px;">Danh hiệu / Thành tích *</span>
          <input type="text" name="title" value="${e(awardTitle)}" placeholder="VD: Cầu thủ xuất sắc nhất năm, Vua phá lưới..." required style="margin:0;width:100%;">
        </label>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px;">
        <label style="margin:0;">
          <span style="display:block;font-weight:600;font-size:13px;margin-bottom:4px;">Phần quà (tiền / hiện vật)</span>
          <input type="text" name="gift" value="${e(gift)}" placeholder="VD: 500.000đ, Cúp lưu niệm, Giày thi đấu..." style="margin:0;width:100%;">
        </label>
        <label style="margin:0;">
          <span style="display:block;font-weight:600;font-size:13px;margin-bottom:4px;">Ghi chú trao thưởng</span>
          <input type="text" name="notes" value="${e(notes)}" placeholder="Nhập lý do trao thưởng hoặc ghi chú thêm..." style="margin:0;width:100%;">
        </label>
      </div>

      <div style="margin-bottom:8px;padding-top:10px;border-top:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:6px;">
        <div>
          <strong style="font-size:14px;color:var(--text);">Chọn thành viên nhận thưởng *</strong>
          <span style="font-size:12px;color:var(--muted);display:block;">Tìm theo tên, ngày sinh hoặc ghi chú để chọn chính xác thành viên.</span>
        </div>
        <span data-award-selected-badge style="font-size:12.5px;font-weight:600;color:${selectedPlayerName ? 'var(--green)' : 'var(--muted)'};">${selectedPlayerName ? `✓ Đã chọn: ${e(selectedPlayerName)}` : 'Chưa chọn thành viên'}</span>
      </div>

      <div class="filters" style="display:grid;grid-template-columns:1fr auto;gap:8px;margin-bottom:8px;">
        <input type="search" data-award-player-search placeholder="Tìm theo họ tên, ngày sinh (dd/mm/yyyy), ghi chú…" aria-label="Tìm thành viên" style="margin:0;width:100%;">
        <select data-award-player-sort aria-label="Sắp xếp" style="margin:0;">
          <option value="name_asc">Tên A–Z</option>
          <option value="name_desc">Tên Z–A</option>
          <option value="dob_asc">Ngày sinh (Lớn trước)</option>
          <option value="dob_desc">Ngày sinh (Nhỏ trước)</option>
          <option value="notes">Theo ghi chú</option>
        </select>
      </div>

      <div style="display:grid;grid-template-columns:28px minmax(140px, 1.2fr) minmax(115px, 0.9fr) minmax(140px, 1.4fr);gap:10px;padding:8px 12px;font-size:12px;font-weight:600;color:var(--muted);background:var(--bg-subtle, rgba(0,0,0,0.03));border:1px solid var(--border);border-bottom:none;border-radius:6px 6px 0 0;">
        <span></span>
        <span>Họ và tên</span>
        <span>Ngày sinh</span>
        <span>Ghi chú thành viên</span>
      </div>

      <div data-award-player-list style="max-height:36dvh;overflow-y:auto;border:1px solid var(--border);border-radius:0 0 6px 6px;background:var(--surface);">
        ${orderedPlayers.map(renderRow).join('')}
      </div>
      <p data-award-player-empty hidden style="text-align:center;color:var(--muted);padding:16px;">Không tìm thấy thành viên phù hợp với từ khóa.</p>
    </div>
  `;

  const modal = saveDialog(
    title,
    description,
    fields,
    async (form) => {
      const selectedRadio = form.querySelector('input[name="selected_player_id"]:checked');
      if (!selectedRadio || !selectedRadio.value) {
        throw new Error('Vui lòng click chọn thành viên nhận thưởng từ danh sách.');
      }
      const awardYear = Number(form.elements.award_year.value);
      const awardTitle = form.elements.title.value.trim();
      const giftVal = form.elements.gift.value.trim() || null;
      const notesVal = form.elements.notes.value.trim() || null;

      if (!awardYear || awardYear < 1900 || awardYear > 2100) {
        throw new Error('Vui lòng nhập năm khen thưởng hợp lệ (1900 - 2100).');
      }
      if (!awardTitle) {
        throw new Error('Vui lòng nhập danh hiệu / thành tích khen thưởng.');
      }

      return await onSubmit({
        player_id: Number(selectedRadio.value),
        award_year: awardYear,
        title: awardTitle,
        gift: giftVal,
        notes: notesVal,
      });
    }
  );

  modal.classList.add('member-picker-dialog');
  modal.style.width = 'min(920px, 96vw)';

  const searchInput = modal.querySelector('[data-award-player-search]');
  const sortSelect = modal.querySelector('[data-award-player-sort]');
  const listEl = modal.querySelector('[data-award-player-list]');
  const emptyEl = modal.querySelector('[data-award-player-empty]');
  const badgeEl = modal.querySelector('[data-award-selected-badge]');

  // Live badge update and highlight when radio is clicked
  listEl.addEventListener('change', (e) => {
    const radio = e.target.closest('input[name="selected_player_id"]');
    if (radio && radio.checked) {
      const row = radio.closest('[data-award-player-row]');
      const name = row?.dataset?.fullName || 'thành viên';
      if (badgeEl) {
        badgeEl.textContent = `✓ Đã chọn: ${name}`;
        badgeEl.style.color = 'var(--green)';
      }
      listEl.querySelectorAll('[data-award-player-row]').forEach((r) => {
        r.style.background = r === row ? 'var(--primary-subtle, rgba(16, 185, 129, 0.08))' : 'var(--surface)';
      });
    }
  });

  const applyFilterAndSort = (shouldSort = false) => {
    const query = (searchInput.value || '').trim().toLocaleLowerCase('vi');
    const sortVal = sortSelect.value;
    const rows = [...listEl.querySelectorAll('[data-award-player-row]')];

    let visibleCount = 0;
    rows.forEach((row) => {
      const match = !query || row.dataset.search.includes(query);
      row.hidden = !match;
      if (match) visibleCount++;
    });
    if (emptyEl) emptyEl.hidden = visibleCount > 0;

    if (shouldSort) {
      rows.sort((a, b) => {
        if (sortVal === 'name_asc') return compareVietnameseNames(a.dataset.fullName, b.dataset.fullName);
        if (sortVal === 'name_desc') return -1 * compareVietnameseNames(a.dataset.fullName, b.dataset.fullName);
        if (sortVal === 'dob_asc') return (a.dataset.dob || '9999').localeCompare(b.dataset.dob || '9999') || compareVietnameseNames(a.dataset.fullName, b.dataset.fullName);
        if (sortVal === 'dob_desc') return (b.dataset.dob || '0000').localeCompare(a.dataset.dob || '0000') || compareVietnameseNames(a.dataset.fullName, b.dataset.fullName);
        if (sortVal === 'notes') return (b.dataset.notes ? 1 : 0) - (a.dataset.notes ? 1 : 0) || compareVietnameseNames(a.dataset.fullName, b.dataset.fullName);
        return 0;
      });
      rows.forEach((r) => listEl.append(r));
    }
  };

  searchInput.addEventListener('input', () => applyFilterAndSort(false));
  sortSelect.addEventListener('change', () => applyFilterAndSort(true));

  return modal;
}
export async function activityAction(action, id, { state: s, api, base, reload }) {
  const post = async (path, data) => { await api.post(base(path), data); await reload(); toast('Đã lưu.'); };
  const trainingTimeHelp = '<p class="training-time-hint">Chọn ngày từ lịch và giờ từ bộ chọn của thiết bị. Mốc này luôn được tính theo giờ Việt Nam (UTC+7); sau 10 phút hệ thống tự đánh dấu Vắng các thành viên chưa điểm danh.</p>';
  if (['edit-activity', 'delete-activity', 'approve-activity'].includes(action)) {
    const [kind, key] = id.split(':'), list = s.activities[kind], item = list?.find((x) => String(x.id) === key);
    if (!item) return;
    const path = `/activities/${kind}/${key}`;
    if (action === 'approve-activity') { await api.patch(base(`${path}/approve`), {}); await reload(); toast('Đã duyệt hoạt động.'); return; }
    if (action === 'delete-activity') return saveDialog('Xóa hoạt động?', 'Hoạt động này sẽ bị xóa.', '', async () => { await api.delete(base(path)); await reload(); toast('Đã xóa hoạt động.'); });
    let fields;
    if (kind === 'celebrations') fields = field('title', 'Tên dịp lễ', item.title, 'text', true) + field('event_date', 'Ngày', item.event_date, 'date', true) + field('message', 'Lời chúc', item.message || '', 'textarea');
    if (kind === 'trainings') fields = (item.team_id ? select('team_id', 'Đội bóng', s.teams.map((t) => [t.id, t.name]), item.team_id) : '') + field('training_date', 'Chọn ngày tập', item.training_date, 'date', true) + field('training_time', 'Chọn giờ tập (UTC+7)', item.training_time, 'time', true) + trainingTimeHelp + field('location', 'Địa điểm', item.location, 'text', true) + select('training_status', 'Trạng thái', [['scheduled', 'Theo kế hoạch'], ['cancelled', 'Không tập'], ['postponed', 'Hoãn']], item.training_status) + field('notes', 'Ghi chú', item.notes || '', 'textarea');
    if (kind === 'awards') {
      let players = (s.activities.players && s.activities.players.length) ? s.activities.players : (s.members || []);
      if (!players.length) {
        players = await allPlayers(api, base);
        s.activities.players = players;
      }
      return openAwardDialog({
        title: 'Chỉnh sửa khen thưởng',
        description: 'Cập nhật danh hiệu, phần quà và thành viên nhận thưởng.',
        initialAward: item,
        players,
        onSubmit: async (data) => {
          await api.patch(base(path), data);
          await reload();
          toast('Đã cập nhật hoạt động.');
        },
      });
    }
    return saveDialog('Chỉnh sửa hoạt động', 'Cập nhật thông tin hoạt động.', fields, async (form) => {
      await api.patch(base(path), Object.fromEntries(new FormData(form)));
      await reload();
      toast('Đã cập nhật hoạt động.');
    });
  }
  if (action === 'new-celebration') return saveDialog('Thêm dịp lễ', 'Lưu ngày và lời chúc để CLB theo dõi.', field('title', 'Tên dịp lễ', '', 'text', true) + field('event_date', 'Ngày', '', 'date', true) + field('message', 'Lời chúc', '', 'textarea'), async (form) => {
    await post('/activities/celebrations', { title: form.elements.title.value.trim(), event_date: form.elements.event_date.value, message: form.elements.message.value.trim() || null });
  });
  if (action === 'new-training') {
    if (!s.teams.length) { toast('Hãy tạo đội bóng trước.', true); return; }
    return saveDialog('Tạo lịch tập', 'Chọn đội bóng, ngày giờ và địa điểm.', select('team_id', 'Đội bóng', s.teams.map((t) => [t.id, t.name])) + field('training_date', 'Chọn ngày tập', '', 'date', true) + field('training_time', 'Chọn giờ tập (UTC+7)', '', 'time', true) + trainingTimeHelp + field('location', 'Địa điểm', '', 'text', true) + field('notes', 'Ghi chú', '', 'textarea'), async (form) => {
      await post('/activities/trainings', { team_id: Number(form.elements.team_id.value), training_date: form.elements.training_date.value, training_time: form.elements.training_time.value, location: form.elements.location.value.trim(), notes: form.elements.notes.value.trim() || null });
    });
  }
  if (action === 'new-award') {
    let players = (s.activities.players && s.activities.players.length) ? s.activities.players : (s.members || []);
    if (!players.length) {
      players = await allPlayers(api, base);
      s.activities.players = players;
    }
    if (!players.length) {
      toast('Câu lạc bộ chưa có thành viên nào. Hãy thêm thành viên trước.', true);
      return;
    }
    return openAwardDialog({
      title: 'Khen thưởng cá nhân',
      description: 'Lưu danh hiệu và phần quà theo năm cho thành viên CLB.',
      initialAward: { award_year: new Date().getFullYear() },
      players,
      onSubmit: async (data) => {
        await post('/activities/awards', data);
      },
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

    const fields = `<div class="member-picker"><div class="filters"><label>Tìm tên / ghi chú <input type="search" data-att-name placeholder="Nhập tên hoặc ghi chú"></label><label>Năm sinh <input type="number" data-att-year min="1900" max="2100" placeholder="Năm"></label><label>Chân thuận <select data-att-foot><option value="">Tất cả</option><option value="left">Trái</option><option value="right">Phải</option><option value="both">Hai chân</option></select></label><label>Vị trí <select data-att-position><option value="">Tất cả</option>${positions.map((p) => `<option value="${e(p)}">${e(p)}</option>`).join('')}</select></label><label>Sắp xếp <select data-att-sort><option value="asc">Tên A–Z</option><option value="desc">Tên Z–A</option><option value="status_present">Có mặt lên đầu</option><option value="status_absent">Vắng lên đầu</option><option value="status_excused">Có phép lên đầu</option><option value="status_unmarked">Chưa điểm danh lên đầu</option><option value="notes">Theo ghi chú</option><option value="foot">Theo chân thuận</option><option value="year">Theo năm sinh</option><option value="position">Theo vị trí</option></select></label></div><div class="member-picker-list attendance-list">${orderedPlayers.map((p) => { const team = (p.teams || []).find((t) => String(t.id) === String(training.team_id)); const info = [p.date_of_birth ? `Ngày sinh: ${formatDate(p.date_of_birth)}` : '', p.preferred_foot ? (p.preferred_foot === 'right' ? 'Chân phải' : p.preferred_foot === 'left' ? 'Chân trái' : 'Hai chân') : '', p.email, p.phone, team?.position, team?.jersey_number != null ? `#${team.jersey_number}` : '', p.notes ? `Ghi chú: ${p.notes}` : ''].filter(Boolean).join(' · '); return `<label data-attendance-row data-name="${e(p.full_name.toLocaleLowerCase('vi'))}" data-notes="${e(p.notes || '')}" data-year="${e((p.date_of_birth || '').slice(0, 4))}" data-foot="${e(p.preferred_foot || '')}" data-position="${e(position(p))}"><span class="attendance-person">${avatar(p.full_name, imageUrl('player', p.id, p.avatar_version, s.clubId))}<span><strong>${e(p.full_name)}</strong><small>${e(info || 'Chưa có thông tin bổ sung')}</small></span></span><select data-player="${p.id}" aria-label="Điểm danh ${e(p.full_name)} ${e(info)}"><option value="">Chưa điểm danh</option>${[['present', 'Có mặt'], ['absent', 'Vắng'], ['excused', 'Có phép']].map(([v, label]) => `<option value="${v}" ${previous.get(String(p.id)) === v ? 'selected' : ''}>${label}</option>`).join('')}</select></label>`; }).join('') || '<p>Đội chưa có thành viên.</p>'}</div></div>`;
    const modal = saveDialog('Điểm danh', `${e(training.team_name)} · ${e(formatDate(training.training_date))}`, fields, async (form) => {
      const selected = [...form.querySelectorAll('[data-player]')].filter((x) => x.value).map((x) => ({ player_id: Number(x.dataset.player), status: x.value }));
      await api.patch(base(`/activities/trainings/${training.id}/attendance`), { players: selected, expected_updated_at: training.updated_at }); await reload(); toast('Đã lưu điểm danh.');
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
        if (sortVal === 'status_present') {
          const va = a.querySelector('[data-player]')?.value === 'present' ? 1 : 0;
          const vb = b.querySelector('[data-player]')?.value === 'present' ? 1 : 0;
          return vb - va || compareVietnameseNames(a.dataset.fullName, b.dataset.fullName);
        }
        if (sortVal === 'status_absent') {
          const va = a.querySelector('[data-player]')?.value === 'absent' ? 1 : 0;
          const vb = b.querySelector('[data-player]')?.value === 'absent' ? 1 : 0;
          return vb - va || compareVietnameseNames(a.dataset.fullName, b.dataset.fullName);
        }
        if (sortVal === 'status_excused') {
          const va = a.querySelector('[data-player]')?.value === 'excused' ? 1 : 0;
          const vb = b.querySelector('[data-player]')?.value === 'excused' ? 1 : 0;
          return vb - va || compareVietnameseNames(a.dataset.fullName, b.dataset.fullName);
        }
        if (sortVal === 'status_unmarked') {
          const va = !a.querySelector('[data-player]')?.value ? 1 : 0;
          const vb = !b.querySelector('[data-player]')?.value ? 1 : 0;
          return vb - va || compareVietnameseNames(a.dataset.fullName, b.dataset.fullName);
        }
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
