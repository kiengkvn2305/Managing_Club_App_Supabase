import { dialog, toast } from './components/ui.js';
import { escapeHtml as e, formatDate } from './utils.js';

const input = (key, value, max, step = '1') => `<input type="number" min="0" max="${max}" step="${step}" data-stat="${key}" value="${e(value ?? '')}" aria-label="${e(key)}" style="min-width:65px;width:75px">`;

export async function openPlayerMatchStats({ match, api, base }) {
  const url = base(`/matches/${match.id}/player-stats`);
  let rows;
  try { rows = (await api.get(url)).data; }
  catch (error) { toast(error.message, true); return; }
  const editable = match.status === 'completed';
  const modal = dialog('Thống kê cầu thủ', `${e(match.team_name || 'Đội bóng')} · ${e(match.opponent)} · ${e(formatDate(match.match_date))}`, `<div style="grid-column:1/-1"><p>Chỉ lưu cầu thủ đã thi đấu. Để trống “Thủng lưới” nếu không ghi thống kê thủ môn; nhập 0 nếu giữ sạch lưới.</p><label for="stats-player-search">Tìm thành viên</label><input id="stats-player-search" type="search" placeholder="Tên, email hoặc ngày sinh"><div class="table-wrap"><table><thead><tr><th>Thành viên</th><th>Ngày sinh / email</th><th>Bàn</th><th>Kiến tạo</th><th>Thẻ vàng</th><th>Thẻ đỏ</th><th>Thủng lưới</th><th>Điểm 0–10</th><th></th></tr></thead><tbody>${rows.map((p) => `<tr data-player="${e(p.player_id)}"><td>${e(p.full_name)}${p.current_team_player ? '' : ' (đã rời đội)'}</td><td>${e(formatDate(p.date_of_birth) || '—')}<br>${e(p.email || '—')}</td><td>${input('goals', p.goals ?? 0, 999)}</td><td>${input('assists', p.assists ?? 0, 999)}</td><td>${input('yellow_cards', p.yellow_cards ?? 0, 2)}</td><td>${input('red_cards', p.red_cards ?? 0, 1)}</td><td>${input('goals_conceded', p.goals_conceded, 999)}</td><td>${input('rating', p.rating, 10, '0.1')}</td><td><button type="button" class="button secondary" data-save ${editable ? '' : 'disabled'}>${p.stat_id ? 'Cập nhật' : 'Ghi thi đấu'}</button><small data-status>${p.stat_id ? 'Đã ghi' : 'Chưa ghi'}</small></td></tr>`).join('')}</tbody></table></div><p data-no-players ${rows.length ? 'hidden' : ''}>Không có thành viên phù hợp.</p></div>`, async () => true, 'Đóng');
  modal.style.width = 'min(1300px, 96vw)';
  modal.querySelector('#stats-player-search').addEventListener('input', (event) => {
    const term = event.target.value.trim().toLocaleLowerCase('vi');
    let visible = 0;
    modal.querySelectorAll('tbody tr').forEach((row) => { row.hidden = !row.textContent.toLocaleLowerCase('vi').includes(term); if (!row.hidden) visible++; });
    modal.querySelector('[data-no-players]').hidden = visible > 0;
  });
  modal.querySelectorAll('[data-save]').forEach((button) => {
    const row = button.closest('tr');
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'text-button';
    remove.textContent = 'Xóa thống kê';
    remove.hidden = row.querySelector('[data-status]').textContent !== 'Đã ghi';
    button.after(remove);
    remove.addEventListener('click', async () => {
      if (!confirm('Xóa thống kê trận của thành viên này?')) return;
      remove.disabled = true;
      try {
        await api.delete(base(`/matches/${match.id}/player-stats/${row.dataset.player}`));
        row.querySelector('[data-status]').textContent = 'Chưa ghi';
        button.textContent = 'Ghi thi đấu';
        remove.hidden = true;
        toast('Đã xóa thống kê.');
      } catch (error) { toast(error.message, true); }
      finally { if (remove.isConnected) remove.disabled = false; }
    });
    button.addEventListener('click', async () => {
    const row = button.closest('tr');
    const body = { player_id: Number(row.dataset.player) };
    for (const element of row.querySelectorAll('[data-stat]')) body[element.dataset.stat] = element.value === '' ? null : Number(element.value);
    const originalLabel = button.textContent;
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    button.textContent = 'Đang lưu…';
    try {
      await api.request(url, { method: 'PUT', body });
      row.querySelector('[data-status]').textContent = 'Đã ghi';
      button.textContent = 'Cập nhật';
      remove.hidden = false;
      toast('Đã lưu thống kê cầu thủ.');
    } catch (error) { toast(error.message, true); }
    finally { if (button.isConnected) { button.disabled = false; button.removeAttribute('aria-busy'); if (button.textContent === 'Đang lưu…') button.textContent = originalLabel; } }
    });
  });
  return modal;
}

export function playerStatsMarkup(data) {
  const { players = [], teams = [], club = {} } = data;
  return `<p>Chỉ tính các bản ghi cầu thủ đã thi đấu trong trận hoàn thành. Số trận CLB/đội là số trận có ít nhất một bản ghi, không phải tổng số trận đã hoàn thành.</p><p>CLB: ${e(club.matches ?? 0)} trận có thống kê · ${e(club.player_appearances ?? 0)} lượt thi đấu · ${e(club.goals ?? 0)} bàn · ${e(club.assists ?? 0)} kiến tạo</p><h3>Theo đội</h3><div class="table-wrap"><table><thead><tr><th>Đội</th><th>Trận có thống kê</th><th>Lượt thi đấu</th><th>Bàn</th><th>Kiến tạo</th></tr></thead><tbody>${teams.map((t) => `<tr><td>${e(t.team_name)}</td><td>${e(t.matches)}</td><td>${e(t.player_appearances)}</td><td>${e(t.goals)}</td><td>${e(t.assists)}</td></tr>`).join('')}</tbody></table></div><h3>Xếp hạng cầu thủ theo bàn thắng</h3>${players.length ? `<div class="table-wrap"><table><thead><tr><th>Thành viên</th><th>Ngày sinh</th><th>Email</th><th>Trận</th><th>Bàn</th><th>Kiến tạo</th><th>Vàng</th><th>Đỏ</th><th>Giữ sạch / trận thủ môn</th><th>Thủng lưới</th><th>Điểm TB</th></tr></thead><tbody>${players.map((p) => `<tr><td>${e(p.full_name)}</td><td>${e(formatDate(p.date_of_birth) || '—')}</td><td>${e(p.email || '—')}</td><td>${e(p.matches_played)}</td><td>${e(p.goals)}</td><td>${e(p.assists)}</td><td>${e(p.yellow_cards)}</td><td>${e(p.red_cards)}</td><td>${e(p.clean_sheets)} / ${e(p.goalkeeper_matches)}</td><td>${p.goalkeeper_matches ? e(p.goals_conceded) : '—'}</td><td>${p.average_rating === null ? '—' : e(p.average_rating)}</td></tr>`).join('')}</tbody></table></div>` : '<p>Chưa có thống kê trong khoảng thời gian đã chọn.</p>'}`;
}

export async function openPlayerStatsSummary({ api, base, teams = [] }) {
  const year = new Date().getFullYear();
  const modal = dialog('Thống kê cầu thủ', 'Lọc theo đội và khoảng thời gian, chẳng hạn mùa giải.', `<div style="grid-column:1/-1"><div class="filters"><label>Từ ngày <input type="date" data-from value="${year}-01-01"></label><label>Đến ngày <input type="date" data-to value="${year}-12-31"></label><label>Đội <select data-team><option value="">Tất cả đội</option>${teams.map((t) => `<option value="${e(t.id)}">${e(t.name)}</option>`).join('')}</select></label><button type="button" class="button secondary" data-load>Xem</button></div><div data-results aria-live="polite"></div></div>`, async () => true, 'Đóng');
  modal.style.width = 'min(1200px, 96vw)';
  const load = async () => {
    const params = new URLSearchParams({ from: modal.querySelector('[data-from]').value, to: modal.querySelector('[data-to]').value });
    const team = modal.querySelector('[data-team]').value;
    if (team) params.set('team_id', team);
    try { modal.querySelector('[data-results]').innerHTML = playerStatsMarkup((await api.get(base(`/player-stats?${params}`))).data); }
    catch (error) { toast(error.message, true); }
  };
  modal.querySelector('[data-load]').addEventListener('click', load);
  await load();
  return modal;
}
