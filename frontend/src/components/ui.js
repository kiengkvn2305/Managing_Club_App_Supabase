import { escapeHtml as e, formatDate, validDate } from "../utils.js";
export const icons = {
  grid: '<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
  users:
    '<circle cx="9" cy="7" r="4"/><path d="M2 21v-2a7 7 0 0 1 14 0v2m1-17a4 4 0 0 1 0 8m3 3a6 6 0 0 1 2 6"/>',
  shield:
    '<path d="m12 2 8 3v6c0 6-8 11-8 11S4 17 4 11V5l8-3Z"/><path d="m8 12 3 3 5-6"/>',
  layers:
    '<path d="m12 3 10 5-10 5L2 8l10-5Zm-10 9 10 5 10-5M2 16l10 5 10-5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
  edit: '<path d="m16 3 5 5-12 12-6 1 1-6L16 3Zm-2 2 5 5"/>',
  trash: '<path d="M3 6h18M9 6V3h6v3m-10 0 1 15h12l1-15M10 10v7m4-7v7"/>',
  moon: '<path d="M21 13A9 9 0 0 1 11 3a9 9 0 1 0 10 10Z"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  user: '<circle cx="12" cy="7" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
  flag: '<path d="M4 22V3c4-3 10 3 16 0v12c-6 3-12-3-16 0"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
};
export const icon = (name) =>
  `<svg viewBox="0 0 24 24" aria-hidden="true">${icons[name] || icons.shield}</svg>`;
export const button = (action, label, glyph = "plus", style = "") =>
  `<button type="button" class="button ${style}" data-action="${action}" aria-label="${e(label)}">${icon(glyph)}<span>${label}</span></button>`;
export function field(
  name,
  label,
  value = "",
  type = "text",
  required = false,
) {
  const attributes = `id="f-${name}" name="${name}" aria-describedby="error-${name}" ${required ? "required" : ""}`;
  const control =
    type === "date"
      ? `<input type="hidden" name="${name}" value="${e(value)}"><input id="f-${name}" type="text" inputmode="numeric" placeholder="dd/mm/yyyy" maxlength="10" data-date-input="${name}" aria-describedby="error-${name}" ${required ? 'data-date-required="true"' : ''} value="${e(formatDate(value))}">`
      : type === "textarea"
      ? `<textarea ${attributes} rows="3">${e(value)}</textarea>`
      : `<input ${attributes} type="${type}" value="${e(value)}" ${type === "password" ? 'autocomplete="current-password"' : ""} ${type === "number" ? 'min="0" max="999"' : ""}>`;
  return `<div class="field"><label for="f-${name}">${label}${required ? " *" : ""}</label>${control}<small id="error-${name}" data-error="${name}"></small></div>`;
}
export const select = (name, label, options, value = "") =>
  `<div class="field"><label for="f-${name}">${label}</label><select id="f-${name}" name="${name}">${options.map(([v, l]) => `<option value="${e(v)}" ${String(v) === String(value) ? "selected" : ""}>${e(l)}</option>`).join("")}</select><small data-error="${name}"></small></div>`;
export const empty = (title, text, action = "", label = "") =>
  `<div class="empty"><div class="empty-icon">${icon("shield")}</div><h2>${title}</h2><p>${text}</p>${action ? button(action, label) : ""}</div>`;
export function toast(text, error = false) {
  const region = document.querySelector("#toast-region");
  region.textContent = "";
  const item = document.createElement("div");
  item.className = `toast ${error ? "error" : ""}`;
  item.textContent = text;
  region.append(item);
  setTimeout(() => item.remove(), 6000);
}
export function showErrors(form, errors = {}, message = "") {
  form.querySelectorAll("[data-error]").forEach((x) => (x.textContent = ""));
  form
    .querySelectorAll("[aria-invalid]")
    .forEach((x) => x.removeAttribute("aria-invalid"));
  form.querySelector("[data-form-error]").textContent = message;
  for (const [key, value] of Object.entries(errors)) {
    const input = form.elements.namedItem(key);
    const target = [...form.querySelectorAll("[data-error]")].find(
      (x) => x.dataset.error === key,
    );
    if (target) target.textContent = Array.isArray(value) ? value[0] : value;
    input?.setAttribute("aria-invalid", "true");
  }
  form.querySelector("[aria-invalid]")?.focus();
}
export function dialog(
  title,
  description,
  fields,
  onSubmit,
  submitLabel = "Lưu thay đổi",
) {
  const previous = document.activeElement;
  const el = document.createElement("dialog");
  el.setAttribute("aria-labelledby", "dialog-title");
  el.innerHTML = `<div class="dialog-head"><div><h2 id="dialog-title">${title}</h2><p>${description}</p></div><button type="button" class="icon-button" data-close aria-label="Đóng">${icon("close")}</button></div><form novalidate class="dialog-body"><div class="form-error" data-form-error role="alert"></div><div class="form-grid">${fields}</div><div class="form-actions"><button type="button" class="button secondary" data-close>Hủy</button><button class="button" type="submit">${submitLabel}</button></div></form>`;
  document.body.append(el);
  el.querySelectorAll("[data-close]").forEach(
    (x) => (x.onclick = () => el.close()),
  );
  el.addEventListener(
    "close",
    () => {
      el.remove();
      if (previous?.isConnected) previous.focus();
    },
    { once: true },
  );
  el.querySelector("form").onsubmit = async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    if (form.dataset.submitting === "true") return;
    for (const input of form.querySelectorAll('[data-date-input]')) {
      const value = input.value.trim();
      const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
      const iso = match ? `${match[3]}-${match[2]}-${match[1]}` : '';
      if ((value && (!iso || !validDate(iso))) || (!value && input.dataset.dateRequired)) {
        showErrors(form, { [input.dataset.dateInput]: 'Nhập ngày hợp lệ theo định dạng dd/mm/yyyy.' }, 'Vui lòng kiểm tra ngày đã nhập.');
        input.setAttribute('aria-invalid', 'true'); input.focus(); return;
      }
      form.elements.namedItem(input.dataset.dateInput).value = iso;
    }
    const submitButton = form.querySelector('[type="submit"]');
    const originalHtml = submitButton?.innerHTML;
    form.dataset.submitting = "true";
    form.setAttribute("aria-busy", "true");
    if (submitButton && submitLabel !== "Đóng") {
      submitButton.setAttribute("aria-busy", "true");
      submitButton.textContent = "Đang lưu…";
    }
    let saved = false;
    try {
      saved = await onSubmit(form);
      if (saved) el.close();
    } catch (error) {
      if (form.isConnected) showErrors(form, error.errors || {}, error.message || "Không thể lưu dữ liệu.");
    } finally {
      if (submitButton?.isConnected && submitButton.textContent === "Đang lưu…") submitButton.innerHTML = originalHtml;
      if (submitButton?.isConnected) submitButton.removeAttribute("aria-busy");
      if (form.isConnected) { form.removeAttribute("aria-busy"); delete form.dataset.submitting; }
    }
  };
  el.showModal();
  return el;
}
