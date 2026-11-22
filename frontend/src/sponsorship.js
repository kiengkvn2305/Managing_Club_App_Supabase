import { dialog, field, select, showErrors, toast } from './components/ui.js';
import { escapeHtml as e, number, formatDate } from './utils.js';
const money = (value) => `${number(value)} đ`;

function submitOnce(form, operation) {
  const submit = form.querySelector('[type="submit"]');
  if (submit.disabled) return Promise.resolve(false);
  submit.disabled = true;
  return operation().then(() => true).catch((error) => { showErrors(form, error.errors || {}, error.message); return false; }).finally(() => { if (submit.isConnected) submit.disabled = false; });
}

export function openSponsor({ sponsor, api, base, refresh }) {
  const fields = field('name', 'Tên đơn vị', sponsor?.name || '', 'text', true) + field('contact_name', 'Người liên hệ', sponsor?.contact_name || '') + field('email', 'Email', sponsor?.email || '', 'email') + field('phone', 'Điện thoại', sponsor?.phone || '') + field('notes', 'Ghi chú', sponsor?.notes || '', 'textarea');
  return dialog(sponsor ? 'Sửa đơn vị tài trợ' : 'Thêm đơn vị tài trợ', 'Thông tin nội bộ của CLB.', fields, (form) => submitOnce(form, async () => {
    const data = Object.fromEntries(new FormData(form));
    if (sponsor) await api.patch(base(`/sponsors/${sponsor.id}`), data); else await api.post(base('/sponsors'), data);
    await refresh(); toast('Đã lưu đơn vị tài trợ.');
  }));
}

export async function showSponsors({ api, base, reload }) {
  let page = 1;
  const render = async () => {
    const result = await api.get(base(`/sponsors?page=${page}`));
    const host = document.createElement('dialog'); host.setAttribute('aria-label', 'Đơn vị tài trợ');
    host.innerHTML = `<div class="dialog-head"><h2>Đơn vị tài trợ</h2><button type="button" class="icon-button" data-close aria-label="Đóng">×</button></div><div class="dialog-body"><button type="button" class="button" data-add>Thêm đơn vị</button><div class="table-wrap"><table><thead><tr><th>Tên</th><th>Liên hệ</th><th>Email</th><th>Điện thoại</th><th>Ghi chú</th><th>Thao tác</th></tr></thead><tbody>${result.data.map((s) => `<tr><td>${e(s.name)}</td><td>${e(s.contact_name || '—')}</td><td>${e(s.email || '—')}</td><td>${e(s.phone || '—')}</td><td>${e(s.notes || '—')}</td><td><button type="button" class="text-button" data-edit="${s.id}">Sửa</button> <button type="button" class="text-button" data-delete="${s.id}">Xóa</button></td></tr>`).join('')}</tbody></table></div><div class="table-footer"><button class="icon-button" data-prev aria-label="Trang trước" ${page <= 1 ? 'disabled' : ''}>←</button> ${page} / ${result.last_page} <button class="icon-button" data-next aria-label="Trang sau" ${page >= result.last_page ? 'disabled' : ''}>→</button></div></div>`;
    document.body.append(host); host.querySelector('[data-close]').onclick = () => host.close();
    const refresh = async () => { host.close(); await reload(); await render(); };
    host.querySelector('[data-add]').onclick = () => openSponsor({ api, base, refresh });
    host.querySelectorAll('[data-edit]').forEach((b) => b.onclick = () => openSponsor({ sponsor: result.data.find((s) => String(s.id) === b.dataset.edit), api, base, refresh }));
    host.querySelectorAll('[data-delete]').forEach((b) => b.onclick = async () => { if (!confirm('Xóa đơn vị này?')) return; try { await api.delete(base(`/sponsors/${b.dataset.delete}`)); await refresh(); toast('Đã xóa đơn vị.'); } catch (error) { toast(error.message, true); } });
    host.querySelector('[data-prev]').onclick = () => { page--; refresh(); }; host.querySelector('[data-next]').onclick = () => { page++; refresh(); };
    host.addEventListener('close', () => host.remove(), { once: true }); host.showModal();
  };
  try { await render(); } catch (error) { toast(error.message, true); }
}

export async function openSponsorship({ agreement, api, base, reload }) {
  try {
    let page = 1, sponsors = [], result;
    do { result = await api.get(base(`/sponsors?page=${page++}`)); sponsors = sponsors.concat(result.data); } while (page <= result.last_page);
    if (!sponsors.length) { toast('Hãy thêm đơn vị tài trợ trước.', true); return; }
    const fields = select('sponsor_id', 'Đơn vị tài trợ', sponsors.map((s) => [String(s.id), s.name]), String(agreement?.sponsor_id || sponsors[0].id)) + field('title', 'Tên thỏa thuận', agreement?.title || '', 'text', true) + select('type', 'Hình thức', [['cash', 'Tiền'], ['equipment', 'Hiện vật']], agreement?.type || 'cash') + field('value', 'Giá trị cam kết (VNĐ)', agreement?.value ?? '', 'number', true) + field('starts_on', 'Bắt đầu', agreement?.starts_on || '', 'date', true) + field('ends_on', 'Kết thúc', agreement?.ends_on || '', 'date', true) + field('benefits', 'Quyền lợi nhà tài trợ', agreement?.benefits || '', 'textarea') + field('notes', 'Ghi chú', agreement?.notes || '', 'textarea');
    const modal = dialog(agreement ? 'Sửa thỏa thuận' : 'Thêm thỏa thuận', 'Cam kết không tự tạo khoản thu hay nhập kho.', fields, (form) => submitOnce(form, async () => {
      const data = Object.fromEntries(new FormData(form));
      if (agreement) await api.patch(base(`/sponsorships/${agreement.id}`), data); else await api.post(base('/sponsorships'), data);
      await reload(); toast('Đã lưu thỏa thuận.');
    }));
    modal.querySelector('[name="value"]').step = '0.01'; modal.querySelector('[name="value"]').min = '0';
  } catch (error) { toast(error.message, true); }
}

export async function showSponsorshipReceipts({ agreement, api, base, reload, canManage }) {
  let page = 1;
  const render = async () => {
    const result = await api.get(base(`/sponsorships/${agreement.id}/receipts?page=${page}`));
    const host = document.createElement('dialog'); host.setAttribute('aria-label', 'Thực nhận tài trợ');
    host.innerHTML = `<div class="dialog-head"><div><h2>${e(agreement.title)}</h2><p>Giá trị thực nhận được nhập thủ công; chưa ghi vào sổ thu chi hoặc kho.</p><p>Quyền lợi: ${e(agreement.benefits || '—')} · Ghi chú: ${e(agreement.notes || '—')}</p></div><button type="button" class="icon-button" data-close aria-label="Đóng">×</button></div><div class="dialog-body">${canManage ? '<button type="button" class="button" data-add>Ghi nhận thực nhận</button>' : ''}<div class="table-wrap"><table><thead><tr><th>Ngày</th><th>Giá trị</th><th>Ghi chú</th></tr></thead><tbody>${result.data.map((r) => `<tr><td>${e(formatDate(r.received_on))}</td><td>${money(r.value)}</td><td>${e(r.notes || '—')}</td></tr>`).join('')}</tbody></table></div><div class="table-footer"><button class="icon-button" data-prev aria-label="Trang trước" ${page <= 1 ? 'disabled' : ''}>←</button> ${page} / ${result.last_page} <button class="icon-button" data-next aria-label="Trang sau" ${page >= result.last_page ? 'disabled' : ''}>→</button></div></div>`;
    document.body.append(host); host.querySelector('[data-close]').onclick = () => host.close();
    const refresh = async () => { host.close(); await reload(); await render(); };
    host.querySelector('[data-add]')?.addEventListener('click', () => {
      const fields = field('received_on', 'Ngày nhận', '', 'date', true) + field('value', 'Giá trị thực nhận (VNĐ)', '', 'number', true) + field('notes', 'Chi tiết / chứng từ', '', 'textarea');
      const modal = dialog('Ghi nhận thực nhận', 'Thao tác này chỉ ghi chú giá trị tài trợ, không tạo bút toán hay biến động kho; không thể xóa bản ghi.', fields, (form) => submitOnce(form, async () => { await api.post(base(`/sponsorships/${agreement.id}/receipts`), Object.fromEntries(new FormData(form))); await refresh(); toast('Đã ghi nhận.'); }));
      modal.querySelector('[name="value"]').step = '0.01'; modal.querySelector('[name="value"]').min = '0.01';
    });
    host.querySelector('[data-prev]').onclick = () => { page--; refresh(); }; host.querySelector('[data-next]').onclick = () => { page++; refresh(); };
    host.addEventListener('close', () => host.remove(), { once: true }); host.showModal();
  };
  try { await render(); } catch (error) { toast(error.message, true); }
}
