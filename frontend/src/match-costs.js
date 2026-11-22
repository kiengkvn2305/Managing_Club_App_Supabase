import { dialog, toast } from './components/ui.js';
import { escapeHtml as e, formatDate } from './utils.js';

const money = (amount) => `${Number(amount).toLocaleString('vi-VN')} đ`;
const costFields = [['stadium', 'Tiền sân'], ['referee', 'Trọng tài'], ['water', 'Nước'], ['equipment', 'Trang bị'], ['other', 'Chi khác'], ['sponsorship', 'Tài trợ bù trừ']];

export async function openMatchCosts({ match, api, base, canManage = false }) {
  const url = base(`/matches/${match.id}/cost-split`);
  let data;
  try { data = (await api.get(url)).data; } catch (error) { toast(error.message, true); return; }
  const { split, receivables, players } = data;
  if (split) {
    const fields = `<div style="grid-column:1/-1"><p>Đã xác nhận · Tổng phải thu: <strong>${money(split.total)}</strong>. Đây là khoản phải thu, chưa phải tiền đã thu.</p><div class="table-wrap"><table><thead><tr><th>Thành viên</th><th>Phải thu</th><th>Trạng thái</th></tr></thead><tbody>${receivables.map((p) => `<tr><td>${e(p.full_name)}</td><td>${money(p.amount)}</td><td>${p.exempt ? 'Miễn' : 'Chưa ghi nhận thanh toán'}</td></tr>`).join('')}</tbody></table></div><p>Chưa hỗ trợ điều chỉnh hay thanh toán khoản này.</p></div>`;
    const modal = dialog('Chi phí trận đấu', e(match.opponent), fields, async () => true, 'Đóng');
    modal.style.width = 'min(1050px, 95vw)'; return modal;
  }
  if (!canManage || match.status === 'cancelled') {
    toast(match.status === 'cancelled' ? 'Không thể chia phí trận đã hủy.' : 'Chưa có khoản chia cho trận này.', true); return;
  }
  if (!players.length) { toast('Đội chưa có thành viên để chia phí.', true); return; }
  const fields = `<div style="grid-column:1/-1"><p>Chỉ tạo khoản phải thu sau khi xác nhận, không tự ghi tiền thu hoặc chi.</p><div class="form-grid">${costFields.map(([name, label]) => `<div class="field"><label>${label} (đ)<input type="number" name="${name}" min="0" max="1000000000" step="1" value="0" required></label></div>`).join('')}<div class="field"><label>Cách chia<select name="method"><option value="equal">Chia đều</option><option value="weighted">Theo trọng số</option><option value="custom">Tự nhập</option></select></label></div></div><div class="table-wrap"><table><thead><tr><th>Chọn</th><th>Thành viên</th><th>Ngày sinh</th><th>Email</th><th>Miễn</th><th>Trọng số</th><th>Tự nhập (đ)</th></tr></thead><tbody>${players.map((p) => `<tr data-player="${e(p.player_id)}"><td><input type="checkbox" data-selected ${['present','late'].includes(p.attendance) ? 'checked' : ''} aria-label="Chọn ${e(p.full_name)}"></td><td>${e(p.full_name)}</td><td>${e(formatDate(p.date_of_birth) || '—')}</td><td>${e(p.email || '—')}</td><td><input type="checkbox" data-exempt aria-label="Miễn ${e(p.full_name)}"></td><td><input type="number" data-weight min="1" max="1000" value="1" aria-label="Trọng số ${e(p.full_name)}"></td><td><input type="number" data-amount min="0" max="5000000000" step="1" value="0" aria-label="Số tiền ${e(p.full_name)}"></td></tr>`).join('')}</tbody></table></div><div data-preview aria-live="polite"></div></div>`;
  let previewed = null;
  const modal = dialog('Chia chi phí trận đấu', `${e(match.opponent)} · ${e(formatDate(match.match_date))}`, fields, async (form) => {
    const payload = Object.fromEntries(costFields.map(([name]) => [name, form.elements[name].value]));
    payload.method = form.elements.method.value;
    payload.players = [...form.querySelectorAll('tr[data-player]')].filter((row) => row.querySelector('[data-selected]').checked).map((row) => ({ player_id: Number(row.dataset.player), exempt: row.querySelector('[data-exempt]').checked, weight: row.querySelector('[data-weight]').value, amount: row.querySelector('[data-amount]').value }));
    const button = form.querySelector('[type="submit"]'); button.disabled = true;
    try {
      if (previewed === JSON.stringify(payload)) {
        await api.post(url, payload); toast('Đã xác nhận khoản phải thu.'); return true;
      }
      const result = (await api.post(`${url}/preview`, payload)).data;
      const names = new Map(players.map((p) => [Number(p.player_id), p.full_name]));
      form.querySelector('[data-preview]').innerHTML = `<h3>Xem trước · Tổng ${money(result.total)}</h3><ul>${result.receivables.map((p) => `<li>${e(names.get(Number(p.player_id)) || '')}: ${money(p.amount)}${p.exempt ? ' (miễn)' : ''}</li>`).join('')}</ul><p>Kiểm tra rồi nhấn xác nhận. Thay đổi biểu mẫu sẽ yêu cầu xem trước lại.</p>`;
      previewed = JSON.stringify(payload); button.textContent = 'Xác nhận chia phí'; return false;
    } catch (error) { form.querySelector('[data-form-error]').textContent = error.message; previewed = null; button.textContent = 'Xem trước'; return false; }
    finally { if (button.isConnected) button.disabled = false; }
  }, 'Xem trước');
  modal.style.width = 'min(1200px, 95vw)';
  modal.querySelector('form').addEventListener('input', () => { previewed = null; modal.querySelector('[type="submit"]').textContent = 'Xem trước'; modal.querySelector('[data-preview]').textContent = ''; });
  return modal;
}
