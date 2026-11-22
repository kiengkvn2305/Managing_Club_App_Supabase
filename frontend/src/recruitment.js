import { dialog, field, select, showErrors, toast } from './components/ui.js';
import { escapeHtml as e, formatDate } from './utils.js';
import { postStatus, applicationStatus } from './recruitment-page.js';

function submitOnce(form, operation) {
  const submit = form.querySelector('[type="submit"]');
  if (submit.disabled) return Promise.resolve(false);
  submit.disabled = true;
  return operation().then(() => true).catch((error) => { showErrors(form, error.errors || {}, error.message); return false; }).finally(() => { if (submit.isConnected) submit.disabled = false; });
}

export function openRecruitmentPost({ post, api, base, reload }) {
  const fields = field('title', 'Tên tin', post?.title || '', 'text', true) + field('position', 'Vị trí cần tuyển', post?.position || '') + field('requirements', 'Yêu cầu', post?.requirements || '', 'textarea') + field('deadline', 'Hạn tuyển', post?.deadline || '', 'date') + select('status', 'Trạng thái', Object.entries(postStatus), post?.status || 'draft');
  return dialog(post ? 'Sửa tin tuyển dụng' : 'Thêm tin tuyển dụng', 'Tin và ứng viên chỉ hiển thị nội bộ cho người có quyền nhân sự.', fields, (form) => submitOnce(form, async () => {
    const data = Object.fromEntries(new FormData(form));
    if (post) await api.patch(base(`/recruitment/posts/${post.id}`), data); else await api.post(base('/recruitment/posts'), data);
    await reload(); toast('Đã lưu tin tuyển dụng.');
  }));
}

export function openRecruitmentApplication({ post, application, api, base, refresh }) {
  const fields = field('full_name', 'Họ và tên', application?.full_name || '', 'text', true) + field('date_of_birth', 'Ngày sinh', application?.date_of_birth || '', 'date') + field('email', 'Email', application?.email || '', 'email') + field('phone', 'Điện thoại', application?.phone || '') + field('notes', 'Ghi chú', application?.notes || '', 'textarea') + select('status', 'Trạng thái', Object.entries(applicationStatus), application?.status || 'new');
  return dialog(application ? 'Sửa hồ sơ ứng viên' : 'Thêm ứng viên', 'Thông tin ứng viên được lưu nội bộ trong CLB.', fields, (form) => submitOnce(form, async () => {
    const data = Object.fromEntries(new FormData(form));
    if (application) await api.patch(base(`/recruitment/posts/${post.id}/applications/${application.id}`), data); else await api.post(base(`/recruitment/posts/${post.id}/applications`), data);
    await refresh(); toast('Đã lưu ứng viên.');
  }));
}

export async function showRecruitmentApplications({ post, api, base, canManage }) {
  let page = 1, status = '';
  const render = async () => {
    const result = await api.get(base(`/recruitment/posts/${post.id}/applications?page=${page}&status=${encodeURIComponent(status)}`));
    const host = document.createElement('dialog'); host.setAttribute('aria-label', 'Ứng viên tuyển dụng');
    const rows = result.data.map((a) => `<tr><td>${e(a.full_name)}</td><td>${e(formatDate(a.date_of_birth) || '—')}</td><td>${e(a.email || '—')}</td><td>${e(a.phone || '—')}</td><td>${e(applicationStatus[a.status] || a.status)}</td><td>${e(a.notes || '—')}</td><td>${canManage ? `<button class="text-button" data-edit="${a.id}">Sửa</button>` : '—'}</td></tr>`).join('');
    host.innerHTML = `<div class="dialog-head"><div><h2>Ứng viên · ${e(post.title)}</h2><p>Hồ sơ chỉ dành cho người có quyền nhân sự của CLB.</p></div><button type="button" class="icon-button" data-close aria-label="Đóng">×</button></div><div class="dialog-body">${canManage ? '<button type="button" class="button" data-add>Thêm ứng viên</button>' : ''}<label>Trạng thái <select data-status><option value="">Tất cả</option>${Object.entries(applicationStatus).map(([value, label]) => `<option value="${value}" ${value === status ? 'selected' : ''}>${label}</option>`).join('')}</select></label>${rows ? `<div class="table-wrap"><table><thead><tr><th>Họ tên</th><th>Ngày sinh</th><th>Email</th><th>Điện thoại</th><th>Trạng thái</th><th>Ghi chú</th><th>Thao tác</th></tr></thead><tbody>${rows}</tbody></table></div>` : '<p>Chưa có ứng viên phù hợp.</p>'}<div class="table-footer"><button class="icon-button" data-prev aria-label="Trang trước" ${page <= 1 ? 'disabled' : ''}>←</button> ${page} / ${result.last_page} <button class="icon-button" data-next aria-label="Trang sau" ${page >= result.last_page ? 'disabled' : ''}>→</button></div></div>`;
    document.body.append(host); host.querySelector('[data-close]').onclick = () => host.close();
    const refresh = async () => { host.close(); await render(); };
    host.querySelector('[data-add]')?.addEventListener('click', () => openRecruitmentApplication({ post, api, base, refresh }));
    host.querySelectorAll('[data-edit]').forEach((button) => button.addEventListener('click', () => openRecruitmentApplication({ post, application: result.data.find((a) => String(a.id) === button.dataset.edit), api, base, refresh })));
    host.querySelector('[data-status]').onchange = (event) => { status = event.target.value; page = 1; refresh(); };
    host.querySelector('[data-prev]').onclick = () => { page--; refresh(); }; host.querySelector('[data-next]').onclick = () => { page++; refresh(); };
    host.addEventListener('close', () => host.remove(), { once: true }); host.showModal();
  };
  try { await render(); } catch (error) { toast(error.message, true); }
}
