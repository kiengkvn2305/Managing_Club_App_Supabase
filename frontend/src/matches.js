import { dialog, field, select, showErrors, toast } from './components/ui.js';
import { escapeHtml as e, unpackList, formatDate } from './utils.js';

export async function openMatch({ match, state: s, api, base, reload }) {
  if (!s.teams.length) { toast('Hãy tạo đội bóng trước.', true); return; }
  let invitations = [];
  if (s.clubs.find((c) => String(c.id) === String(s.clubId))?.membership_role && ['owner', 'co_owner', 'general_manager'].includes(s.clubs.find((c) => String(c.id) === String(s.clubId)).membership_role)) {
    let page = 1, last = 1;
    do { const result = unpackList(await api.get(base(`/friendlies?page=${page}`))); invitations.push(...result.rows.filter((x) => x.status === 'accepted')); last = result.meta.last_page || 1; page++; } while (page <= last);
  }
  const date = match?.match_date || `${s.matchesMonth}-01`;
  const choices = invitations.map((x) => [x.id, `${String(x.source_club_id) === String(s.clubId) ? x.target_name : x.source_name} · ${formatDate(x.match_date)}`]);
  const fields = select('team_id', 'Đội bóng', s.teams.map((t) => [t.id, t.name]), match?.team_id) +
    (choices.length ? select('friendly_invitation_id', 'Lời mời giao hữu đã chấp nhận (không bắt buộc)', [['', 'Không liên kết'], ...choices], match?.friendly_invitation_id || '') : (match?.friendly_invitation_id ? `<input type="hidden" name="friendly_invitation_id" value="${e(match.friendly_invitation_id)}">` : '')) +
    field('opponent', 'Đối thủ', match?.opponent || '', 'text', true) + field('match_date', 'Ngày', date, 'date', true) + field('start_time', 'Giờ bắt đầu', match?.start_time || '', 'time', true) + field('end_time', 'Giờ kết thúc', match?.end_time || '', 'time') + field('location', 'Địa điểm', match?.location || '') +
    select('match_type', 'Loại trận', [['friendly','Giao hữu'],['tournament','Giải đấu'],['practice','Tập luyện']], match?.match_type || 'friendly') + select('status', 'Trạng thái', [['scheduled','Đã lên lịch'],['completed','Đã kết thúc'],['cancelled','Đã hủy']], match?.status || 'scheduled') +
    field('our_score', 'Tỷ số đội mình', match?.our_score ?? '', 'number') + field('opponent_score', 'Tỷ số đối thủ', match?.opponent_score ?? '', 'number') + field('notes', 'Ghi chú', match?.notes || '', 'textarea');
  const modal = dialog(match ? 'Chỉnh sửa trận đấu' : 'Tạo trận đấu', 'Chọn lời mời đã được chấp nhận nếu muốn liên kết; mỗi CLB quản lý lịch riêng.', fields, async (form) => {
    const submit = form.querySelector('[type="submit"]'); if (submit.disabled) return false; submit.disabled = true;
    try {
      const data = Object.fromEntries(new FormData(form)); for (const key of ['friendly_invitation_id','end_time','location','our_score','opponent_score','notes']) if (!data[key]) data[key] = null;
      if (match) await api.patch(base(`/matches/${match.id}`), data); else await api.post(base('/matches'), data);
      s.matchesMonth = data.match_date.slice(0, 7); s.matchesWeek = data.match_date; s.matchesPage = 1;
      await reload(); toast('Đã lưu trận đấu.'); return true;
    } catch (error) { showErrors(form, error.errors || {}, error.message); return false; }
    finally { if (submit.isConnected) submit.disabled = false; }
  });
  modal.querySelector('[name="friendly_invitation_id"]')?.addEventListener('change', (event) => {
    const invite = invitations.find((x) => String(x.id) === event.target.value); if (!invite) return;
    const form = event.target.form; form.elements.opponent.value = String(invite.source_club_id) === String(s.clubId) ? invite.target_name : invite.source_name;
    form.elements.match_date.value = invite.match_date; if (invite.match_time) form.elements.start_time.value = invite.match_time; if (invite.location) form.elements.location.value = invite.location;
    form.elements.match_type.value = 'friendly';
  });
  return modal;
}
