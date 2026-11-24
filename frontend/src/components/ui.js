import { escapeHtml as e, compareVietnameseNames, formatDate } from "../utils.js";
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
  folder: '<path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"/>',
  file: '<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>',
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
    type === "textarea"
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
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
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

export function openMemberPickerModal({
  title = "Chọn thành viên",
  description = "",
  items = [],
  initialSelectedIds = [],
  multi = true,
  name = "selected_ids",
  extraFields = "",
  onSubmit,
  submitLabel = "Lưu thay đổi",
}) {
  const selectedSet = new Set(initialSelectedIds.map(String));

  const footLabel = (f) =>
    ({ right: "Chân phải", left: "Chân trái", both: "Hai chân" })[f] || (f ? String(f) : "");

  // 1. Initial partition: selected items on top, unselected items below
  const selectedItems = items.filter((x) => selectedSet.has(String(x.id)));
  const unselectedItems = items.filter((x) => !selectedSet.has(String(x.id)));

  const sortByName = (a, b) =>
    compareVietnameseNames(a.full_name || a.name || "", b.full_name || b.name || "");

  selectedItems.sort(sortByName);
  unselectedItems.sort(sortByName);

  const orderedItems = [...selectedItems, ...unselectedItems];

  const sortOptions = [
    ["name_asc", "Tên A–Z"],
    ["name_desc", "Tên Z–A"],
    ["dob", "Theo ngày sinh"],
    ["notes", "Theo ghi chú"],
    ["foot", "Theo chân thuận"],
    ["position", "Theo vị trí"],
    ["jersey", "Theo số áo"],
  ];

  const filterBar = `
    <div class="filters" style="display:grid;grid-template-columns:1fr auto;gap:8px;margin-bottom:8px;">
      <label style="margin:0;">
        <input type="search" data-picker-search placeholder="Tìm theo tên, ghi chú, email…" aria-label="Tìm kiếm">
      </label>
      <label style="margin:0;">
        <select data-picker-sort aria-label="Sắp xếp">
          ${sortOptions.map(([val, text]) => `<option value="${val}">${text}</option>`).join("")}
        </select>
      </label>
    </div>
  `;

  const renderRow = (x) => {
    const isChecked = selectedSet.has(String(x.id));
    const displayName = x.full_name || x.name || `Thành viên #${x.id}`;
    const details = [
      x.date_of_birth ? `Ngày sinh: ${formatDate(x.date_of_birth)}` : "",
      x.notes ? `Ghi chú: ${x.notes}` : "",
      x.jersey_number != null ? `#${x.jersey_number}` : "",
      x.position ? `Vị trí: ${x.position}` : "",
      x.preferred_foot ? footLabel(x.preferred_foot) : "",
      x.title ? `Chức danh: ${x.title}` : "",
      x.email || "",
      x.phone || "",
    ].filter(Boolean).join(" · ");

    const searchBlob = [
      displayName,
      x.date_of_birth,
      x.date_of_birth ? formatDate(x.date_of_birth) : "",
      x.email,
      x.phone,
      x.notes,
      x.position,
      x.preferred_foot,
      x.title,
    ].filter(Boolean).join(" ").toLocaleLowerCase("vi");

    return `
      <label data-picker-row
        data-id="${e(x.id)}"
        data-full-name="${e(displayName)}"
        data-dob="${e(x.date_of_birth || "")}"
        data-notes="${e(x.notes || "")}"
        data-foot="${e(x.preferred_foot || "")}"
        data-pos="${e(x.position || "")}"
        data-jersey="${e(x.jersey_number ?? 9999)}"
        data-search="${e(searchBlob)}"
        style="cursor:pointer;"
      >
        <input type="${multi ? "checkbox" : "radio"}" name="${name}" value="${e(x.id)}" ${isChecked ? "checked" : ""}>
        <span style="flex:1;min-width:0;">
          <strong>${e(displayName)}</strong>
          <small style="display:block;color:var(--muted);">${e(details || "Chưa có thông tin bổ sung")}</small>
        </span>
      </label>
    `;
  };

  const listHtml = `
    <div class="member-picker" style="grid-column:1/-1;">
      ${filterBar}
      <div class="member-picker-list" data-picker-list style="max-height:50dvh;overflow-y:auto;display:grid;gap:6px;">
        ${orderedItems.map(renderRow).join("")}
      </div>
      <p data-picker-empty hidden style="text-align:center;color:var(--muted);padding:12px;">Không tìm thấy kết quả phù hợp.</p>
    </div>
  `;

  const fields = extraFields ? extraFields + listHtml : listHtml;

  const modal = dialog(
    title,
    description,
    fields,
    async (form) => {
      const selectedIds = [...selectedSet];
      return await onSubmit(selectedIds, form);
    },
    submitLabel
  );

  modal.classList.add("member-picker-dialog");

  const listEl = modal.querySelector("[data-picker-list]");
  const searchInput = modal.querySelector("[data-picker-search]");
  const sortSelect = modal.querySelector("[data-picker-sort]");
  const emptyEl = modal.querySelector("[data-picker-empty]");

  listEl.addEventListener("change", (event) => {
    const input = event.target.closest(`input[name="${name}"]`);
    if (!input) return;
    if (multi) {
      if (input.checked) selectedSet.add(String(input.value));
      else selectedSet.delete(String(input.value));
    } else {
      selectedSet.clear();
      if (input.checked) selectedSet.add(String(input.value));
    }
  });

  const applyFilterAndSort = (shouldSort = false) => {
    const query = (searchInput.value || "").trim().toLocaleLowerCase("vi");
    const sortVal = sortSelect.value;
    const rows = [...listEl.querySelectorAll("[data-picker-row]")];

    let visibleCount = 0;
    rows.forEach((row) => {
      const match = !query || row.dataset.search.includes(query);
      row.hidden = !match;
      if (match) visibleCount++;
    });

    if (emptyEl) emptyEl.hidden = visibleCount > 0;

    if (shouldSort) {
      rows.sort((a, b) => {
        if (sortVal === "name_asc") return compareVietnameseNames(a.dataset.fullName, b.dataset.fullName);
        if (sortVal === "name_desc") return -1 * compareVietnameseNames(a.dataset.fullName, b.dataset.fullName);
        if (sortVal === "dob") return (a.dataset.dob || "9999").localeCompare(b.dataset.dob || "9999") || compareVietnameseNames(a.dataset.fullName, b.dataset.fullName);
        if (sortVal === "notes") return (b.dataset.notes ? 1 : 0) - (a.dataset.notes ? 1 : 0) || compareVietnameseNames(a.dataset.fullName, b.dataset.fullName);
        if (sortVal === "foot") return (a.dataset.foot || "").localeCompare(b.dataset.foot || "") || compareVietnameseNames(a.dataset.fullName, b.dataset.fullName);
        if (sortVal === "position") return (a.dataset.pos || "").localeCompare(b.dataset.pos || "") || compareVietnameseNames(a.dataset.fullName, b.dataset.fullName);
        if (sortVal === "jersey") return Number(a.dataset.jersey) - Number(b.dataset.jersey);
        return 0;
      });
      rows.forEach((r) => listEl.append(r));
    }
  };

  searchInput.addEventListener("input", () => applyFilterAndSort(false));
  sortSelect.addEventListener("change", () => applyFilterAndSort(true));

  return modal;
}
