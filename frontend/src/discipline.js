import { dialog, field, select, showErrors, toast } from './components/ui.js';
import { escapeHtml as e, formatDate, formatVietnamDateTime } from './utils.js';
import { disciplineStatus } from './discipline-page.js';

function submitOnce(form, operation) {
  const submit = form.querySelector('[type="submit"]');
  if (submit.disabled) return Promise.resolve(false);
  submit.disabled = true;
  return operation().then(() => true).catch((error) => { showErrors(form, error.errors || {}, error.message); return false; }).finally(() => { if (submit.isConnected) submit.disabled = false; });
}

export function openDisciplineCase({ item, players, api, base, reload }) {
  const choices = players.map((p) => [String(p.id), [p.full_name, formatDate(p.date_of_birth), p.email].filter(Boolean).join(' · ')]);
  const fields = select('player_id', 'Thành viên', choices, String(item?.player_id || '')) + field('incident_date', 'Ngày xảy ra', item?.incident_date || '', 'date', true) + field('title', 'Tên sự việc', item?.title || '', 'text', true) + field('description', 'Nội dung sự việc', item?.description || '', 'textarea', true) + select('status', 'Trạng thái', Object.entries(disciplineStatus), item?.status || 'open') + field('decision', 'Quyết định xử lý', item?.decision || '', 'textarea') + field('fine_amount', 'Mức phạt tham khảo (đồng)', item?.fine_amount ?? '', 'number') + (item ? field('reason', 'Lý do điều chỉnh', '', 'textarea', true) : '');
  return dialog(item ? 'Chỉnh sửa sự việc' : 'Ghi nhận sự việc', 'Chỉ người có quyền nhân sự được xem. Mức phạt không tự tạo công nợ hoặc khoản thu.', fields, (form) => submitOnce(form, async () => {
    const data = Object.fromEntries(new FormData(form));
    data.fine_amount = data.fine_amount === '' ? null : data.fine_amount;
    if (item) await api.patch(base(`/discipline/${item.id}`), data); else await api.post(base('/discipline'), data);
    await reload(); toast('Đã lưu sự việc.');
  }));
}

export async function showDisciplineHistory({ item, api, base }) {
  let page = 1;
  const render = async () => {
    const result = await api.get(base(`/discipline/${item.id}/history?page=${page}`));
    const host = document.createElement('dialog'); host.setAttribute('aria-label', 'Lịch sử xử lý kỷ luật');
    const entries = result.data.map((row) => `<tr><td>${e(formatVietnamDateTime(row.created_at))}</td><td>${e(row.actor_name)}</td><td>${row.action === 'created' ? 'Ghi nhận' : 'Điều chỉnh'}</td><td>${e(row.reason || '—')}</td><td>${e(row.snapshot?.title || '')}</td><td>${e(row.snapshot?.description || '')}</td><td>${e(disciplineStatus[row.snapshot?.status] || row.snapshot?.status || '')}</td><td>${e(row.snapshot?.decision || '—')}</td><td>${e(row.snapshot?.fine_amount ?? '—')}</td></tr>`).join('');
    host.innerHTML = `<div class="dialog-head"><div><h2>Lịch sử · ${e(item.title)}</h2><p>Mỗi lần cập nhật lưu lại nội dung và người thực hiện.</p></div><button type="button" class="icon-button" data-close aria-label="Đóng">×</button></div><div class="dialog-body"><div class="table-wrap"><table><thead><tr><th>Thời gian</th><th>Người thực hiện</th><th>Thao tác</th><th>Lý do</th><th>Sự việc</th><th>Nội dung</th><th>Trạng thái</th><th>Quyết định</th><th>Phạt tham khảo</th></tr></thead><tbody>${entries}</tbody></table></div><div class="table-footer"><button class="icon-button" data-prev aria-label="Trang trước" ${page <= 1 ? 'disabled' : ''}>←</button> ${page} / ${result.last_page} <button class="icon-button" data-next aria-label="Trang sau" ${page >= result.last_page ? 'disabled' : ''}>→</button></div></div>`;
    document.body.append(host); host.querySelector('[data-close]').onclick = () => host.close();
    const refresh = async () => { host.close(); await render(); };
    host.querySelector('[data-prev]').onclick = () => { page--; refresh(); }; host.querySelector('[data-next]').onclick = () => { page++; refresh(); };
    host.addEventListener('close', () => host.remove(), { once: true }); host.showModal();
  };
  try { await render(); } catch (error) { toast(error.message, true); }
}
