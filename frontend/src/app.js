import { createApiClient } from "./api-supabase.js";
import { state as s, currentClub } from "./state.js";
import { page, authPage, titles } from "./pages.js";
import { openLineup, openCaptain } from "./lineups.js";
import { downloadMemberTemplate, parseMembers, exportFinance, exportMembers } from "./spreadsheets.js";
import { reviewImport } from "./import-review.js";
import { activityAction } from "./activities.js";
import { openAttendanceReport } from './attendance-report.js';
import { avatar, imageUrl, primeImageUrls } from './images.js';
import { setupImageCropper } from './image-crop.js';
import { openMatch } from './matches.js';
import { calendarRange } from './matches-page.js';
import { passwordResetPage } from './password-reset-page.js';
import { openInventoryItem, openInventoryMovement, showInventoryHistory, showInventoryAssignments } from './inventory.js';
import { openMatchAttendance } from './match-attendance.js';
import { openPlayerMatchStats, openPlayerStatsSummary } from './player-stats.js';
import { openPollCreate, confirmPollVote } from './polls.js';
import { openRecruitmentPost, showRecruitmentApplications } from './recruitment.js';
import {
  icon,
  button,
  field,
  select,
  dialog,
  toast,
  showErrors,
} from "./components/ui.js";
import {
  escapeHtml as e,
  number,
  roleLabel,
  canManageRoster,
  canManageClub,
  validate,
  formatDate, vietnamToday,
  compareVietnameseNames,
  unpackList,
} from "./utils.js";

const root = document.querySelector("#app");
let sequence = 0,
  controller,
  searchTimer;
const api = createApiClient({
  onUnauthorized: () => {
    clearSession();
    toast("Phiên đăng nhập đã hết hạn.", true);
  },
});
const currentRole = () => currentClub()?.membership_role || "member";
const vietnamCalendarDate = () => {
  const [year, month, day] = vietnamToday().split('-').map(Number);
  return new Date(year, month - 1, day);
};
const base = (suffix = "") => `/clubs/${encodeURIComponent(s.clubId)}${suffix}`;
const boardTitles = ['Chủ nhiệm', 'Phó chủ nhiệm', 'Thủ quỹ', 'Thư ký', 'Truyền thông', 'Hậu cần', 'Huấn luyện viên'];
function boardTitleFields(value = '') {
  const titles = [...new Set([...boardTitles, ...s.boardMembers.map((member) => member.title).filter(Boolean)])];
  const options = [...titles.map((title) => [title, title]), ['__custom__', 'Chức danh khác…']];
  return select('title_choice', 'Chức danh', options, !value || titles.includes(value) ? (value || titles[0]) : '__custom__') + field('custom_title', 'Chức danh khác', titles.includes(value) ? '' : value);
}
function setupBoardTitle(modal) {
  const selectEl = modal.querySelector('[name="title_choice"]');
  const toggle = () => { modal.querySelector('[name="custom_title"]').closest('.field').hidden = selectEl.value !== '__custom__'; };
  selectEl.addEventListener('change', toggle); toggle();
}
const selectedBoardTitle = (data) => (data.title_choice === '__custom__' ? data.custom_title : data.title_choice)?.trim() || '';
const navItems = [
  ["dashboard", "Tổng quan", "grid"],
  ["members", "Thành viên CLB", "users"],
  ["teams", "Đội bóng", "layers"],
  ["club-members", "Thành viên BCN", "users"],
  ["finance", "Sổ thu chi CLB", "layers"],
  ["dues", "Đóng quỹ", "layers"],
  ["inventory", "Kho trang bị", "layers"],
  ["activities", "Hoạt động CLB", "flag"],
  ["club", "Câu lạc bộ", "shield"],
  ["profile", "Tài khoản", "user"],
];
const nav = () =>
  navItems
    .filter(([route]) => route !== "club-members" || currentRole() === "owner")
    .filter(([route]) => !['finance', 'dues'].includes(route) || currentClub()?.can_view_finance)
    .filter(([route]) => route !== 'inventory' || currentClub()?.can_view_inventory)
    .map(
      ([route, name, glyph]) =>
        `<a href="#${route}" class="nav-link ${s.route === route ? "active" : ""}" ${s.route === route ? 'aria-current="page"' : ""}>${icon(glyph)}<span>${name}</span></a>`,
    )
    .join("");
const clubSelect = () =>
  `<select data-club-switch aria-label="Chuyển câu lạc bộ">${s.clubs.length ? s.clubs.map((c) => `<option value="${c.id}" ${String(c.id) === String(s.clubId) ? "selected" : ""}>${e(c.name)}</option>`).join("") : "<option>Chưa có câu lạc bộ</option>"}</select>`;
function render() {
  if (['forgot', 'reset'].includes(s.authMode)) { root.innerHTML = passwordResetPage(s); return; }
  if (!s.user) {
    root.innerHTML = authPage();
    return;
  }
  const club = currentClub(), background = imageUrl("background", club?.id, club?.background_version, club?.id);
  root.innerHTML = `<div class="shell"><aside class="sidebar"><a class="brand" href="#dashboard"><img src="/icons/crest.svg" alt="">FCMS <small>PRO</small></a><div class="club-selector">${avatar(club?.name || "FC", imageUrl("club", club?.id, club?.avatar_version, club?.id), "club-icon")}<div><small>CÂU LẠC BỘ CỦA BẠN</small>${clubSelect()}</div></div><div class="nav-label">QUẢN LÝ CÂU LẠC BỘ</div><nav aria-label="Điều hướng chính">${nav()}<div class="nav-divider"></div><a class="nav-link ${s.route === "roadmap" ? "active" : ""}" href="#roadmap">${icon("flag")}<span>Lộ trình phát triển</span></a></nav><div class="sidebar-bottom"><div>${icon("flag")}<h3>Vững đội hình.<br>Chung mục tiêu.</h3><p>Mỗi hồ sơ chỉn chu là một bước tiến của câu lạc bộ.</p></div><small>FCMS PRO / PHIÊN BẢN NỀN TẢNG</small></div></aside><div class="workspace ${background ? "has-club-background" : ""}" ${background ? `style="--club-background: url('${e(background)}')"` : ""}><header class="topbar"><div class="breadcrumb">${icon("shield")} ${e(currentClub()?.name || "FCMS PRO")} <span>/</span> <strong>${titles[s.route]}</strong></div><a class="brand mobile-brand" href="#dashboard"><img src="/icons/crest.svg" alt="">FCMS <small>PRO</small></a><div class="header-actions"><button class="icon-button" data-action="theme" aria-label="Đổi giao diện sáng tối">${icon("moon")}</button><a class="user-link" href="#profile">${avatar(s.user.name, imageUrl("account", s.user.id, s.user.avatar_version))}<div><strong>${e(s.user.name)}</strong><small>${e(roleLabel(currentRole()))}</small></div></a></div></header><div id="connection-banner" class="connection-banner" ${navigator.onLine ? "hidden" : ""} role="status">Bạn đang ngoại tuyến. Kết nối lại để cập nhật dữ liệu.</div><div class="mobile-club">${clubSelect()}</div><main id="main-content" tabindex="-1" class="page">${page()}<footer>© ${new Date().getFullYear()} FCMS PRO. Cùng câu lạc bộ vươn xa.</footer></main></div><nav class="bottom-nav" aria-label="Điều hướng di động">${nav()}</nav></div>`;
}
function clearSession() {
  sequence++;
  controller?.abort();
  s.user = null;
  s.clubs = [];
  s.clubId = null;
  clearData();
  document.querySelectorAll("dialog").forEach((x) => x.close());
  render();
}
function clearData() {
  s.members = [];
  s.myPlayer = null;
  s.canClaimPlayer = false;
  s.teams = [];
  s.lineups = [];
  s.matches = { data: [], meta: {} };
  s.matchCalendar = [];
  s.inventory = { data: [], current_page: 1, last_page: 1, total: 0 };
  s.polls = { data: [], current_page: 1, last_page: 1 };
  s.recruitment = { data: [], current_page: 1, last_page: 1, total: 0 };
  s.clubMemberships = [];
  s.boardMembers = [];
  s.boardSharedRates = [];
  s.boardTasks = [];
  s.activities = { celebrations: [], birthdays: [], trainings: [], awards: [] };
  s.finance = { data: [], summary: {}, meta: {} };
  s.plannedExpenses = [];
  s.discovery = { data: [], meta: {} };
  s.friendlies = { data: [], meta: {} };
  s.meta = {};
  s.dashboard = {};
  s.error = "";
}
function readRoute() {
  const rawHash = location.hash.slice(1);
  const recoveryText = rawHash.includes("access_token=") ? rawHash : location.search.slice(1);
  const recovery = new URLSearchParams(recoveryText);
  if (recovery.get("type") === "recovery" || recovery.get("code")) {
    s.authMode = "reset";
    s.resetToken = recovery.get("access_token") || recovery.get("code") || "";
    s.resetEmail = "";
    s.route = "dashboard";
    return;
  }
  const [route, query = ""] = rawHash.split("?");
  if (route === 'reset-password') {
    const params = new URLSearchParams(query); s.resetToken = params.get('token') || ''; s.resetEmail = params.get('email') || ''; s.authMode = 'reset'; s.route = 'dashboard';
    history.replaceState(null, '', location.pathname + location.search); return;
  }
  const token = new URLSearchParams(query).get("token");
  s.route = Object.hasOwn(titles, route) ? route : "dashboard";
  s.teamRosterId = route === "team-roster" ? (new URLSearchParams(query).get("id") || "") : "";
  if (token) {
    s.invite = token;
    history.replaceState(null, "", location.pathname + "#accept");
    s.route = "accept";
  }
}
async function loadApp() {
  const seq = ++sequence;
  s.loading = true;
  s.error = "";
  render();
  try {
    const result = await api.get("/clubs");
    if (seq !== sequence || !s.user) return;
    s.clubs = unpackList(result).rows;
    if (!currentClub()) s.clubId = s.clubs[0]?.id || null;
    await primeImageUrls([{ kind: 'account', id: s.user.id, version: s.user.avatar_version }, ...s.clubs.flatMap((club) => [{ kind: 'club', id: club.id, version: club.avatar_version, clubId: club.id }, { kind: 'background', id: club.id, version: club.background_version, clubId: club.id }])]);
    await loadView();
  } catch (error) {
    if (seq !== sequence || !s.user) return;
    s.loading = false;
    s.error = error.message;
    render();
  }
}
async function loadView() {
  controller?.abort();
  controller = new AbortController();
  const signal = controller.signal,
    tenant = s.clubId,
    route = s.route;
  clearData();
  s.loading = true;
  render();
  try {
    if (route === 'discover') {
      const tasks = [api.get(`/discover/clubs?${new URLSearchParams({ q: s.discoveryQuery, page: s.discoveryPage })}`, { signal })];
      if (tenant && canManageClub(currentRole())) tasks.push(api.get(base(`/friendlies?${new URLSearchParams({ page: s.friendlyPage })}`), { signal }));
      const results = await Promise.all(tasks);
      if (signal.aborted || !s.user || tenant !== s.clubId || route !== s.route) return;
      s.discovery = results[0]; s.friendlies = results[1] || { data: [], meta: {} };
    }
    if (tenant && ["dashboard", "members", "team-roster", "teams", "lineups", "matches", "inventory", "polls", "recruitment", "club-members", "finance", "dues", "activities", "profile"].includes(route)) {
      const tasks = [api.get(base("/teams"), { signal })];
      if (route === "dashboard")
        tasks.push(api.get(base("/dashboard"), { signal }));
      if (route === "lineups" && canManageRoster(currentRole()))
        tasks.push(api.get(base("/lineups"), { signal }));
      if (route === 'matches' && canManageRoster(currentRole())) {
        if (!s.matchesMonth) { const now = new Date(); s.matchesMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`; s.matchesWeek = `${s.matchesMonth}-${String(now.getDate()).padStart(2, '0')}`; }
        const query = s.matchesView === 'list' ? `/matches?${new URLSearchParams({ month: s.matchesMonth, page: s.matchesPage })}` : `/matches/calendar?${new URLSearchParams(calendarRange(s.matchesView, s.matchesMonth, s.matchesWeek))}`;
        tasks.push(api.get(base(query), { signal }));
      }
      if (route === 'inventory' && currentClub()?.can_view_inventory) {
        const query = new URLSearchParams({ page: s.inventoryPage, ...(s.inventorySearch ? { search: s.inventorySearch } : {}), ...(s.inventoryLowStock ? { low_stock: '1' } : {}), ...(s.inventoryArchived ? { archived: '1' } : {}) });
        tasks.push(api.get(base(`/inventory?${query}`), { signal }));
      }
      if (route === 'polls') tasks.push(api.get(base(`/polls?${new URLSearchParams({ page: s.pollsPage })}`), { signal }));
      if (route === 'recruitment' && canManageRoster(currentRole())) tasks.push(api.get(base(`/recruitment/posts?${new URLSearchParams({ page: s.recruitmentPage, ...(s.recruitmentStatus ? { status: s.recruitmentStatus } : {}) })}`), { signal }));
      if (route === "club-members" && currentRole() === "owner") {
        tasks.push(api.get(base("/board-members"), { signal }));
      }
      if (route === "finance" && currentClub()?.can_view_finance) {
        if (!s.financeMonth) { const d = vietnamCalendarDate(); s.financeMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; s.financeYear = String(d.getFullYear()); s.financeFrom = `${s.financeMonth}-01`; s.financeTo = `${s.financeMonth}-${String(new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()).padStart(2, '0')}`; }
        tasks.push(api.get(base(`/finance?${new URLSearchParams({ page: s.financePage, adjustment_page: s.financeAdjustmentPage, group: s.financePeriod === 'month' ? 'day' : 'month', period: s.financePeriod, from: s.financeFrom, to: s.financeTo })}`), { signal }));
        tasks.push(api.get(base(`/finance/planned?${new URLSearchParams({ from: s.financeFrom.slice(0, 7), to: s.financeTo.slice(0, 7) })}`), { signal }));
      }
      if (route === 'dues' && currentClub()?.can_view_finance) {
        if (!s.duesMonth) { const d = vietnamCalendarDate(); s.duesMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; }
        tasks.push(api.get(base(`/dues?${new URLSearchParams({ month: s.duesMonth })}`), { signal }));
      }
      if (route === "activities" && currentClub()?.can_manage_activities) tasks.push(api.get(base('/activities'), { signal }));
      if (route === 'profile') tasks.push(api.get(base('/my-player'), { signal }));
      if (
        (route === "dashboard" || route === "members" || (route === "team-roster" && /^\d+$/.test(s.teamRosterId))) &&
        canManageRoster(currentRole())
      ) {
        const q =
          route === "dashboard"
            ? new URLSearchParams({ per_page: "5", sort: "created_at" })
            : route === "team-roster" ? new URLSearchParams({ team_id: s.teamRosterId, sort: s.teamRosterSort, direction: s.teamRosterDirection, q: s.teamRosterSearch, dues_status: s.teamDuesFilter || '', page: String(s.teamRosterPage), per_page: "15" }) : new URLSearchParams({ ...s.filters, per_page: "15" });
        for (const [key, value] of [...q]) if (value === "") q.delete(key);
        tasks.push(api.get(base(`/members?${q}`), { signal }));
      }
      const results = await Promise.all(tasks);
      if (signal.aborted || !s.user || tenant !== s.clubId || route !== s.route)
        return;
      s.teams = unpackList(results[0]).rows;
      if (route === "lineups" && results[1]) s.lineups = unpackList(results[1]).rows;
      if (route === 'matches' && results[1]) { if (s.matchesView === 'list') s.matches = results[1]; else s.matchCalendar = results[1].data; }
      if (route === 'inventory' && results[1]) s.inventory = results[1];
      if (route === 'polls' && results[1]) s.polls = results[1];
      if (route === 'recruitment' && results[1]) s.recruitment = results[1];
      if (route === "club-members" && results[1]) { s.boardMembers = unpackList(results[1]).rows; s.boardSharedRates = results[1].shared_rates || []; }
      if (route === "finance" && results[1]) s.finance = results[1];
      if (route === 'finance' && results[2]) s.plannedExpenses = results[2].data;
      if (route === 'dues') s.dues = results[1]?.data || [];
      if (route === "activities" && results[1]) s.activities = results[1].data;
      if (route === 'profile') { s.myPlayer = results[1]?.data || null; s.canClaimPlayer = Boolean(results[1]?.eligible); }
      if (route === "dashboard") s.dashboard = results[1].data;
      const list = ["lineups", "matches", "inventory", "polls", "recruitment", "club-members", "finance", "dues", "activities", "profile"].includes(route) ? null : results[route === "dashboard" ? 2 : 1];
      if (list) {
        const { rows, meta } = unpackList(list);
        s.members = route === "dashboard" ? rows.map((m) => ({ ...m, team: { name: (m.teams || []).map((t) => t.name).join(", ") || "Chưa xếp đội" }, jersey_number: null })) : rows;
        s.meta = meta;
      }
      await primeImageUrls([{ kind: 'account', id: s.user.id, version: s.user.avatar_version }, { kind: 'club', id: tenant, version: currentClub()?.avatar_version, clubId: tenant }, { kind: 'background', id: tenant, version: currentClub()?.background_version, clubId: tenant }, ...(s.members || []).map((member) => ({ kind: 'player', id: member.id, version: member.avatar_version, clubId: tenant })), ...(s.myPlayer ? [{ kind: 'player', id: s.myPlayer.id, version: s.myPlayer.avatar_version, clubId: tenant }] : [])]);
    }
    if (signal.aborted || !s.user) return;
    s.loading = false;
    render();
  } catch (error) {
    if (error.name === "AbortError" || signal.aborted || !s.user) return;
    s.loading = false;
    s.error = error.message;
    render();
  }
}
function values(form) {
  return Object.fromEntries(
    [...new FormData(form)].map(([k, v]) => [
      k,
      k.includes("password") ? v : String(v).trim(),
    ]),
  );
}
async function submit(form, kind, handler) {
  const data = values(form),
    errors = validate(kind, data);
  if (kind === "accept" && data.token?.length !== 64)
    errors.token = "Mã lời mời phải có 64 ký tự.";
  showErrors(form, errors);
  if (Object.keys(errors).length) return false;
  const btn = form.querySelector('[type="submit"]');
  if (btn?.disabled) return false;
  if (btn) btn.disabled = true;
  form.setAttribute("aria-busy", "true");
  try {
    await handler(data);
    return true;
  } catch (error) {
    if (form.isConnected) showErrors(form, error.errors || {}, error.message);
    return false;
  } finally {
    if (btn?.isConnected) btn.disabled = false;
    form.removeAttribute("aria-busy");
  }
}
function editClub(edit = false) {
  const c = edit ? currentClub() : {};
  const fields =
    field("name", "Tên câu lạc bộ", c.name, "text", true) +
    field("city", "Thành phố", c.city) +
    field("home_ground", "Sân nhà", c.home_ground) +
    `<fieldset class="field format-options"><legend>Loại sân *</legend>${["5", "7", "11"].map((v) => `<label><input type="checkbox" name="formats" value="${v}" ${(c.formats || [c.format || "7"]).includes(v) ? "checked" : ""}> Sân ${v} người</label>`).join("")}</fieldset>` +
    (edit
      ? select(
          "status",
          "Trạng thái",
          [
            ["active", "Đang hoạt động"],
            ["archived", "Lưu trữ"],
          ],
          c.status,
        )
      : "") +
    field("description", "Giới thiệu", c.description, "textarea");
  dialog(
    edit ? "Chỉnh sửa câu lạc bộ" : "Tạo câu lạc bộ mới",
    "Bạn có thể quản lý nhiều câu lạc bộ trong một tài khoản.",
    fields,
    (form) =>
      submit(form, "club", async (data) => {
        data.formats = [...form.querySelectorAll('[name="formats"]:checked')].map((input) => input.value);
        if (!data.formats.length) throw new Error("Vui lòng chọn ít nhất một loại sân.");
        const result = edit
          ? await api.patch(base(), data)
          : await api.post("/clubs", data);
        s.clubId = result.data.id;
        s.route = "club";
        history.replaceState(null, "", location.pathname + "#club");
        await loadApp();
        toast("Đã lưu câu lạc bộ.");
      }),
  );
}
function editTeam() {
  dialog(
    "Tạo đội bóng",
    "Sắp xếp đội hình sân 5, 7 hoặc 11 người.",
    field("name", "Tên đội bóng", "", "text", true) +
      select(
        "format",
        "Loại sân",
        (currentClub().formats || [currentClub().format]).map((v) => [v, `Sân ${v} người`]),
        (currentClub().formats || [currentClub().format])[0],
      ),
    (form) =>
      submit(form, "team", async (data) => {
        await api.post(base("/teams"), data);
        await loadView();
        toast("Đã tạo đội bóng.");
      }),
  );
}
async function renameTeam(team) {
  const candidates = unpackList(await api.get(base('/team-manager-candidates'))).rows;
  const managerFields = `<fieldset class="field format-options"><legend>Người quản lý đội</legend>${candidates.map((m) => `<label><input type="checkbox" name="manager_ids" value="${m.id}" ${(team.managers || []).some((x) => String(x.id) === String(m.id)) ? "checked" : ""}> ${e(m.name)}</label>`).join("") || "Chưa có tài khoản thành viên."}</fieldset>`;
  const today = vietnamCalendarDate(), month = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  const duesInfo = team.monthly_dues ? `<p>Mức quỹ gần nhất: ${e(Number(team.monthly_dues.amount).toLocaleString('vi-VN'))} đ/tháng, từ ${e(team.monthly_dues.effective_month.slice(0, 7))}.</p>` : '<p>Đội chưa thiết lập mức quỹ.</p>';
  const duesFields = currentClub()?.can_manage_finance ? duesInfo + field('dues_amount', 'Mức quỹ mới mỗi tháng (đồng; để trống nếu không đổi)', '', 'number').replace('min="0" max="999"', 'min="0" max="1000000000000"') + field('dues_month', 'Tháng áp dụng đề xuất', month, 'month') : '';
  dialog("Chỉnh sửa đội bóng", "Mức quỹ mới áp dụng sớm nhất trong tháng này nếu chỉnh trước ngày 3; từ ngày 3 áp dụng sớm nhất tháng sau.",
    field("name", "Tên đội bóng", team.name, "text", true) + select("format", "Loại sân", (currentClub().formats || [currentClub().format]).map((v) => [v, `Sân ${v} người`]), team.format) + managerFields + duesFields,
    (form) => submit(form, "team-rename", async (data) => {
      if (!data.name) throw new Error("Vui lòng nhập tên đội bóng.");
      const managerIds = [...form.querySelectorAll('[name="manager_ids"]:checked')].map((x) => Number(x.value));
      await api.patch(base(`/teams/${team.id}`), { name: data.name, format: data.format, membership_ids: managerIds, ...(data.dues_amount !== undefined && data.dues_amount !== '' ? { dues_amount: data.dues_amount, dues_month: data.dues_month } : {}) });
      await loadView();
      toast("Đã đổi tên đội bóng.");
    }));
}

function editImage(kind, member) {
  const club = currentClub();
  const config = kind === 'account' ? { path: '/auth/avatar', title: 'Ảnh đại diện tài khoản', version: s.user.avatar_version } : kind === 'player' ? { path: `/clubs/${encodeURIComponent(club.id)}/members/${encodeURIComponent(member.id)}/avatar`, title: `Ảnh đại diện · ${e(member.full_name)}`, version: member.avatar_version, removable: member.has_custom_avatar } : { path: `/clubs/${encodeURIComponent(club.id)}/images/${kind === 'background' ? 'background' : 'avatar'}`, title: kind === 'background' ? 'Ảnh nền CLB' : 'Ảnh đại diện CLB', version: kind === 'background' ? club.background_version : club.avatar_version };
  const url = imageUrl(kind, member?.id, config.version, club?.id);
  const fields = `<div class="image-picker"><div class="image-preview ${kind === 'background' ? 'image-preview-wide' : ''}">${url ? `<img src="${e(url)}" alt="Ảnh hiện tại">` : '<span>Chưa có ảnh</span>'}</div><div class="field"><label for="f-image">Chọn ảnh JPG, PNG hoặc WEBP</label><input id="f-image" name="image" type="file" accept="image/jpeg,image/png,image/webp" required><small data-error="image"></small><small>Tối đa 5 MB. ${kind === 'background' ? 'Ảnh nền sẽ được phủ màu để nội dung dễ đọc.' : ''}</small></div><div class="crop-editor" data-crop-editor><canvas hidden aria-label="Xem trước vùng ảnh đã cắt"></canvas><p data-crop-message>Chọn một ảnh để điều chỉnh khung hình.</p><div class="crop-controls" data-crop-controls hidden><label>Phóng to <input type="range" data-crop-zoom min="1" max="3" step="0.01" value="1"></label><label>Điều chỉnh ngang <input type="range" data-crop-x min="-100" max="100" value="0"></label><label>Điều chỉnh dọc <input type="range" data-crop-y min="-100" max="100" value="0"></label></div></div>${(config.removable ?? Boolean(config.version)) ? '<button type="button" class="text-button danger" data-delete-image>Xóa ảnh hiện tại</button>' : ''}</div>`;
  const refresh = async () => { if (kind === 'account') { s.user = (await api.get('/auth/user')).data; await loadView(); } else if (kind === 'player') await loadView(); else await loadApp(); };
  let cropper;
  const modal = dialog(config.title, 'Chọn ảnh và điều chỉnh vùng hiển thị trước khi lưu.', fields, (form) => submit(form, 'image', async () => {
    const file = form.elements.image.files[0];
    if (!file || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) throw new Error('Chọn ảnh JPG, PNG hoặc WEBP tối đa 5 MB.');
    const cropped = await cropper.exportFile();
    const data = new FormData(); data.append('image', cropped); await api.post(config.path, data); await refresh(); toast('Đã cập nhật ảnh.');
  }));
  cropper = setupImageCropper(modal.querySelector('[data-crop-editor]'), modal.querySelector('[name="image"]'), { background: kind === 'background' });
  modal.querySelector('[data-delete-image]')?.addEventListener('click', async (event) => {
    event.currentTarget.disabled = true;
    try { await api.delete(config.path); await refresh(); modal.close(); toast('Đã xóa ảnh.'); }
    catch (error) { showErrors(modal.querySelector('form'), error.errors || {}, error.message); event.currentTarget.disabled = false; }
  });
  modal.addEventListener('close', () => cropper.destroy(), { once: true });
  return modal;
}
function editMember(member = { status: "active" }) {
  const fields =
    field("full_name", "Họ và tên", member.full_name, "text", true) +
    field("email", "Email", member.email, "email") +
    field("phone", "Số điện thoại", member.phone, "tel") +
    field("date_of_birth", "Ngày sinh", member.date_of_birth, "date") +
    select(
      "preferred_foot",
      "Chân thuận",
      [
        ["", "Chưa cập nhật"],
        ["right", "Phải"],
        ["left", "Trái"],
        ["both", "Hai chân"],
      ],
      member.preferred_foot,
    ) +
    select(
      "status",
      "Trạng thái",
      ["active", "inactive", "injured"].map((x) => [
        x,
        {
          active: "Đang hoạt động",
          inactive: "Tạm ngưng",
          injured: "Chấn thương",
        }[x],
      ]),
      member.status,
    ) +
    field("notes", "Ghi chú", member.notes, "textarea");
  dialog(
    member.id ? "Chỉnh sửa thành viên" : "Thêm thành viên",
    "Hồ sơ cầu thủ không tự cấp quyền truy cập tài khoản.",
    fields,
    (form) =>
      submit(form, "member", async (data) => {
        for (const k of Object.keys(data)) if (data[k] === "") data[k] = null;
        if (member.id) await api.patch(base(`/members/${member.id}`), data);
        else await api.post(base("/members"), data);
        await loadView();
        toast("Đã lưu hồ sơ thành viên.");
      }),
  );
}
function invite() {
  let roles = ["member"];
  if (["owner", "co_owner"].includes(currentRole()))
    roles.push(
      "general_manager",
      "treasurer",
      "hr_manager",
      "equipment_manager",
      "sporting_manager",
    );
  if (currentRole() === "owner") roles.push("co_owner");
  let created;
  const el = dialog(
    "Mời tham gia câu lạc bộ",
    "Tạo liên kết và chia sẻ riêng với người nhận. Không gửi email tự động.",
    field("email", "Email người nhận", "", "email", true) +
      select(
        "role",
        "Vai trò",
        roles.map((r) => [r, roleLabel(r)]),
        "member",
      ),
    (form) =>
      submit(form, "invitation", async (data) => {
        created = (await api.post(base("/invitations"), data)).data;
      }),
    "Tạo lời mời",
  );
  el.addEventListener(
    "close",
    () => {
      if (!created) return;
      const link = `${location.origin}${location.pathname}#accept?token=${encodeURIComponent(created.token)}`;
      const result = dialog(
        "Lời mời đã sẵn sàng",
        "Sao chép liên kết này và gửi riêng cho người nhận. Hiệu lực 7 ngày.",
        field("link", "Liên kết nhận lời mời", link),
        async () => true,
        "Đóng",
      );
      result.querySelector("input").readOnly = true;
      result.querySelector("input").select();
    },
    { once: true },
  );
}
async function action(el) {
  const a = el.dataset.action;
  if (a === "theme") {
    const theme =
      document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem("fcms-theme", theme);
    } catch {}
    return;
  }
  if (a === "auth-mode") {
    s.authMode = s.authMode === "login" ? "register" : "login";
    render();
    return;
  }
  if (a === 'forgot-password') { s.authMode = 'forgot'; render(); return; }
  if (a === 'back-to-login') { s.authMode = 'login'; s.resetToken = ''; s.resetEmail = ''; render(); return; }
  if (!s.user) return;
  if (a === 'edit-account-avatar') return editImage('account');
  if (a === 'change-password') return dialog('Đổi mật khẩu', 'Nhập mật khẩu hiện tại và mật khẩu mới. Các phiên cơ sở dữ liệu khác sẽ được thu hồi; phiên đã được bảo vệ sẽ cần đăng nhập lại.', field('current_password', 'Mật khẩu hiện tại', '', 'password', true) + field('password', 'Mật khẩu mới', '', 'password', true).replace('autocomplete="current-password"', 'autocomplete="new-password"') + field('password_confirmation', 'Nhập lại mật khẩu mới', '', 'password', true).replace('autocomplete="current-password"', 'autocomplete="new-password"'), (form) => submit(form, 'change-password', async (data) => { await api.patch('/auth/password', data); toast('Đã đổi mật khẩu.'); }));
  if (a === 'edit-my-player-avatar' && s.myPlayer) return editImage('player', s.myPlayer);
  if (a === 'claim-player' && s.canClaimPlayer) return dialog('Liên kết hồ sơ thành viên?', 'Hồ sơ có email đã xác minh của bạn sẽ được liên kết với tài khoản này trong CLB hiện tại.', '', (form) => submit(form, 'claim-player', async () => { await api.post(base('/my-player/claim'), {}); await loadView(); toast('Đã liên kết hồ sơ thành viên.'); }), 'Liên kết');
  if (a === 'unlink-player' && s.myPlayer) return dialog('Bỏ liên kết hồ sơ?', 'Hồ sơ vẫn thuộc CLB, nhưng tài khoản này sẽ không còn quyền tự đổi ảnh hồ sơ đó.', '', (form) => submit(form, 'unlink-player', async () => { await api.delete(base('/my-player/claim')); await loadView(); toast('Đã bỏ liên kết hồ sơ.'); }), 'Bỏ liên kết');
  if (a === 'edit-club-avatar' && canManageClub(currentRole())) return editImage('club');
  if (a === 'edit-club-background' && canManageClub(currentRole())) return editImage('background');
  if (a === 'edit-player-avatar' && canManageRoster(currentRole())) { const member = s.members.find((x) => String(x.id) === el.dataset.id); if (member) return editImage('player', member); }
  if (a === "retry") return loadApp();
  if (a === "new-club") return editClub();
  if (a === "edit-club" && canManageClub(currentRole())) return editClub(true);
  if (a === "delete-club" && currentRole() === "owner") {
    const club = currentClub();
    return dialog("Xóa câu lạc bộ?", `Xóa ${e(club.name)} sẽ ẩn câu lạc bộ với tất cả thành viên. Dữ liệu được giữ trong hệ thống; hiện chưa có chức năng tự khôi phục trên giao diện.`, "", (form) => submit(form, "delete", async () => {
      await api.delete(base());
      s.clubId = null;
      s.route = "dashboard";
      history.replaceState(null, "", location.pathname + "#dashboard");
      await loadApp();
      toast("Đã xóa câu lạc bộ.");
    }), "Xác nhận xóa CLB");
  }
  if (a === "new-team") return editTeam();
  if ((a === 'new-match' || a === 'edit-match') && canManageRoster(currentRole())) return openMatch({ match: a === 'edit-match' ? [...s.matches.data, ...s.matchCalendar].find((m) => String(m.id) === el.dataset.id) : null, state: s, api, base, reload: loadView });
  if (a === 'match-attendance' && canManageRoster(currentRole())) { const match = [...s.matches.data, ...s.matchCalendar].find((m) => String(m.id) === el.dataset.id); if (match) return openMatchAttendance({ match, api, base }); }
  if (a === 'match-player-stats' && canManageRoster(currentRole())) { const match = [...s.matches.data, ...s.matchCalendar].find((m) => String(m.id) === el.dataset.id); if (match) return openPlayerMatchStats({ match, api, base }); }
  if (a === 'stats-summary' && canManageRoster(currentRole())) return openPlayerStatsSummary({ api, base, teams: s.teams });
  if (a === 'poll-new' && canManageClub(currentRole()) && currentClub()?.status === 'active') return openPollCreate({ api, base, reload: loadView });
  if (a === 'poll-prev' || a === 'poll-next') { s.pollsPage += a === 'poll-next' ? 1 : -1; return loadView(); }
  if (a === 'poll-vote') { const poll = s.polls.data.find((p) => String(p.id) === el.dataset.id), option = poll?.options.find((o) => String(o.id) === el.dataset.option); if (poll && option) return confirmPollVote({ poll, option, api, base, reload: loadView }); }
  if (a === 'recruitment-prev' || a === 'recruitment-next') { s.recruitmentPage += a === 'recruitment-next' ? 1 : -1; return loadView(); }
  if (a === 'recruitment-new' && canManageRoster(currentRole()) && currentClub()?.status === 'active') return openRecruitmentPost({ api, base, reload: loadView });
  if (['recruitment-edit', 'recruitment-applications'].includes(a) && canManageRoster(currentRole())) {
    const post = s.recruitment.data.find((p) => String(p.id) === el.dataset.id); if (!post) return;
    const canManage = currentClub()?.status === 'active';
    if (a === 'recruitment-edit' && canManage) return openRecruitmentPost({ post, api, base, reload: loadView });
    if (a === 'recruitment-applications') return showRecruitmentApplications({ post, api, base, canManage });
  }
  if (a === 'matches-prev' || a === 'matches-next') { s.matchesPage += a === 'matches-next' ? 1 : -1; return loadView(); }
  if (a === 'inventory-prev' || a === 'inventory-next') { s.inventoryPage += a === 'inventory-next' ? 1 : -1; return loadView(); }
  if (a === 'inventory-new' && currentClub()?.can_manage_inventory) return openInventoryItem({ api, base, reload: loadView });
  if (['inventory-edit', 'inventory-move', 'inventory-history', 'inventory-assignments', 'inventory-archive', 'inventory-restore'].includes(a) && currentClub()?.can_view_inventory) {
    const item = s.inventory.data.find((x) => String(x.id) === el.dataset.id); if (!item) return;
    if (a === 'inventory-history') return showInventoryHistory({ item, api, base });
    if (a === 'inventory-assignments') return showInventoryAssignments({ item, api, base, reload: loadView, canManage: currentClub()?.can_manage_inventory });
    if (!currentClub()?.can_manage_inventory) return;
    if (a === 'inventory-edit') return openInventoryItem({ item, api, base, reload: loadView });
    if (a === 'inventory-move') return openInventoryMovement({ item, api, base, reload: loadView });
    if (a === 'inventory-restore') { await api.post(base(`/inventory/${item.id}/restore`), {}); await loadView(); toast('Đã khôi phục vật tư.'); return; }
    return dialog('Lưu trữ vật tư?', `${e(item.name)} sẽ được ẩn khỏi danh sách. Chỉ vật tư có tồn kho bằng 0 mới được lưu trữ; lịch sử được giữ lại.`, '', (form) => submit(form, 'inventory-archive', async () => { await api.delete(base(`/inventory/${item.id}`)); if (s.inventory.data.length === 1 && s.inventoryPage > 1) s.inventoryPage--; await loadView(); toast('Đã lưu trữ vật tư.'); }), 'Lưu trữ');
  }
  if (["new-celebration", "new-training", "new-award", "attendance", "edit-activity", "delete-activity", "approve-activity"].includes(a) && currentClub()?.can_manage_activities) return activityAction(a, el.dataset.id, { state: s, api, base, reload: loadView });
  if (a === 'edit-birthday' && currentRole() === 'owner') { const member = (await api.get(base(`/members/${el.dataset.id}`))).data; return editMember(member); }
  if (a === "rename-team" && canManageRoster(currentRole())) {
    const team = s.teams.find((t) => String(t.id) === el.dataset.id);
    if (team) return renameTeam(team);
  }
  if (a === 'edit-dues-rate' && currentClub()?.can_manage_finance) {
    const team = s.teams.find((t) => String(t.id) === el.dataset.id); if (!team) return;
    const date = vietnamCalendarDate(), month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    return dialog('Chỉnh sửa quỹ đội', `Đội ${e(team.name)}. Mức quỹ áp dụng sớm nhất tháng này nếu chỉnh trước ngày 3, hoặc tháng sau từ ngày 3.`, field('dues_amount', 'Mức quỹ mỗi tháng (đồng)', '', 'number', true).replace('min="0" max="999"', 'min="0" max="1000000000000"') + field('dues_month', 'Tháng áp dụng đề xuất', month, 'month', true), (form) => submit(form, 'dues-rate', async (data) => { await api.patch(base(`/teams/${team.id}/dues-rate`), data); await loadView(); toast('Đã cập nhật quỹ đội.'); }));
  }
  if (a === "delete-team" && canManageRoster(currentRole())) {
    const team = s.teams.find((t) => String(t.id) === el.dataset.id);
    if (!team) return;
    return dialog("Xóa đội bóng?", `Xóa ${e(team.name)} sẽ xóa các đội hình trận đấu của đội. Hồ sơ cầu thủ được giữ lại nhưng không còn thuộc đội này.`, "", (form) => submit(form, "delete", async () => {
      await api.delete(base(`/teams/${team.id}`));
      await loadView();
      toast("Đã xóa đội bóng.");
    }), "Xác nhận xóa đội");
  }
  if (a === 'board-new' && currentRole() === 'owner') {
    const players = [];
    let pageNumber = 1, lastPage = 1;
    do {
      const result = unpackList(await api.get(base(`/members?per_page=100&page=${pageNumber}`)));
      players.push(...result.rows); lastPage = result.meta.last_page || 1; pageNumber++;
    } while (pageNumber <= lastPage);
    const assigned = new Set(s.boardMembers.map((m) => String(m.player_id)));
    const available = players.filter((p) => !assigned.has(String(p.id)));
    if (!available.length) { toast('Không còn thành viên CLB để thêm vào BCN.'); return; }
    const fields = `<div class="member-picker">${field('board_search', 'Tìm theo tên hoặc ghi chú', '', 'search')}<label>Sắp xếp <select data-board-sort><option value="asc">Tên A–Z</option><option value="desc">Tên Z–A</option></select></label><div class="member-picker-list" data-board-list>${available.map((p) => `<label data-board-row data-full-name="${e(p.full_name)}" data-search="${e([p.full_name, p.notes].filter(Boolean).join(' ').toLocaleLowerCase('vi'))}"><input type="radio" name="player_id" value="${e(p.id)}"><span><strong>${e(p.full_name)}</strong><small>${e([formatDate(p.date_of_birth), p.email, p.notes].filter(Boolean).join(' · ') || 'Chưa có thông tin bổ sung')}</small></span></label>`).join('')}</div><p data-board-empty hidden>Không tìm thấy thành viên.</p></div>` + boardTitleFields();
    const modal = dialog('Thêm BCN', 'Chọn thành viên và ghi chức danh; không cần tài khoản riêng.', fields, (form) => submit(form, 'board', async (data) => {
      const title = selectedBoardTitle(data);
      if (!data.player_id || !title) throw new Error('Vui lòng chọn thành viên và nhập chức danh.');
      await api.post(base('/board-members'), { player_id: Number(data.player_id), title });
      await loadView(); toast('Đã thêm thành viên BCN.');
    }), 'Thêm BCN');
    modal.classList.add('member-picker-dialog'); setupBoardTitle(modal);
    const search = modal.querySelector('[name="board_search"]');
    const filterBoard = () => {
      const query = search.value.trim().toLocaleLowerCase('vi'); let visible = 0;
      const list = modal.querySelector('[data-board-list]'), rows = [...list.querySelectorAll('[data-board-row]')], direction = modal.querySelector('[data-board-sort]').value === 'desc' ? -1 : 1;
      rows.forEach((row) => { row.hidden = !row.dataset.search.includes(query); if (!row.hidden) visible++; else row.querySelector('input').checked = false; });
      rows.sort((a,b) => direction * compareVietnameseNames(a.dataset.fullName, b.dataset.fullName)); rows.forEach((row) => list.append(row));
      modal.querySelector('[data-board-empty]').hidden = visible > 0;
    };
    search.addEventListener('input', filterBoard); modal.querySelector('[data-board-sort]').addEventListener('change', filterBoard); filterBoard();
    return modal;
  }
  if (['board-edit', 'board-remove'].includes(a) && currentRole() === 'owner') {
    const member = s.boardMembers.find((m) => String(m.id) === el.dataset.id);
    if (!member) return;
    if (a === 'board-remove') return dialog('Bỏ khỏi BCN?', `Bỏ ${e(member.full_name)} khỏi danh sách BCN; hồ sơ thành viên vẫn được giữ. Ưu đãi quỹ kết thúc từ tháng sau, các khoản đã ghi được giữ nguyên.`, '', (form) => submit(form, 'board', async () => {
      await api.delete(base(`/board-members/${member.id}`)); await loadView(); toast('Đã cập nhật danh sách BCN.');
    }), 'Bỏ khỏi BCN');
    const modal = dialog('Sửa chức danh', e(member.full_name), boardTitleFields(member.title), (form) => submit(form, 'board', async (data) => {
      const title = selectedBoardTitle(data); if (!title) throw new Error('Vui lòng nhập chức danh.');
      await api.patch(base(`/board-members/${member.id}`), { title }); await loadView(); toast('Đã cập nhật chức danh.');
    }));
    setupBoardTitle(modal); return modal;
  }
  if (a === 'board-shared-dues' && currentRole() === 'owner') {
    if (!s.teams.length) { toast('Hãy tạo đội bóng trước khi đặt mức quỹ.'); return; }
    const today = vietnamCalendarDate();
    const firstMonth = new Date(today.getFullYear(), today.getMonth() + (today.getDate() >= 3 ? 1 : 0), 1);
    const initialMonth = `${firstMonth.getFullYear()}-${String(firstMonth.getMonth() + 1).padStart(2, '0')}`;
    const fields = select('team_id', 'Đội bóng', s.teams.map((team) => [team.id, team.name])) + field('amount', 'Số tiền BCN phải đóng mỗi tháng (đ)', '', 'number', true).replace('min="0" max="999"', 'min="0" max="1000000000000"') + field('effective_month', 'Áp dụng từ tháng', initialMonth, 'month', true);
    return dialog('Ưu đãi quỹ chung BCN', 'Áp dụng cho mọi thành viên BCN trong đội đã chọn; 0 đồng là không phải đóng. Từ ngày 3, mức mới áp dụng sớm nhất tháng sau. Khoản đã ghi và tháng trước không thay đổi.', fields, (form) => submit(form, 'board-dues', async (data) => {
      if (!/^\d+$/.test(data.amount) || !data.effective_month) throw new Error('Vui lòng nhập số tiền và tháng áp dụng hợp lệ.');
      await api.post(base('/board-dues-rate'), { team_id: Number(data.team_id), amount: Number(data.amount), effective_month: data.effective_month });
      await loadView(); toast('Đã lưu mức quỹ ưu đãi.');
    }), 'Lưu mức quỹ');
  }
  if (['board-task-new', 'board-task-edit', 'board-task-delete'].includes(a) && currentRole() === 'owner') {
    const task = s.boardTasks.find((t) => String(t.id) === el.dataset.id);
    if (a !== 'board-task-new' && !task) return;
    if (a === 'board-task-delete') return dialog('Xóa công việc?', `Xóa công việc ${e(task.title)} khỏi danh sách.`, '', (form) => submit(form, 'board-task', async () => {
      await api.delete(base(`/board-tasks/${task.id}`)); await loadView(); toast('Đã xóa công việc.');
    }), 'Xóa công việc');
    if (!s.boardMembers.length) { toast('Hãy thêm thành viên BCN trước khi giao việc.'); return; }
    const fields = field('title', 'Công việc', task?.title || '', 'text', true) + select('board_member_id', 'Người phụ trách', s.boardMembers.map((m) => [m.id, `${m.full_name} · ${m.title}`]), task?.board_member_id || s.boardMembers[0].id) + field('due_date', 'Hạn chót', task?.due_date || '', 'date') + field('progress', 'Tiến độ (%)', task?.progress ?? 0, 'number', true).replace('min="0" max="999"', 'min="0" max="100"') + field('description', 'Nội dung / ghi chú', task?.description || '', 'textarea');
    return dialog(task ? 'Cập nhật công việc' : 'Giao việc BCN', 'Chủ nhiệm cập nhật công việc, hạn chót và tiến độ.', fields, (form) => submit(form, 'board-task', async (data) => {
      const progress = Number(data.progress);
      if (!data.title.trim() || !/^\d+$/.test(data.progress) || progress > 100) throw new Error('Nhập công việc và tiến độ từ 0 đến 100%.');
      const payload = { title: data.title.trim(), board_member_id: Number(data.board_member_id), due_date: data.due_date || null, progress, description: data.description || null };
      if (task) await api.patch(base(`/board-tasks/${task.id}`), payload); else await api.post(base('/board-tasks'), payload);
      await loadView(); toast('Đã lưu công việc.');
    }), task ? 'Lưu thay đổi' : 'Giao việc');
  }
  if (a === "edit-title" && currentRole() === "owner") {
    const member = s.clubMemberships.find((m) => String(m.id) === el.dataset.id);
    if (!member) return;
    const preset = ["Thành viên", "HLV", "Chủ nhiệm CLB", "Phó chủ nhiệm CLB", "Thủ quỹ", "Thư ký", "Media", "Truyền thông", ...s.clubMemberships.map((m) => m.title).filter(Boolean)];
    const choices = [...new Set(preset)];
    const modal = dialog("Vai trò thành viên", `Chọn chức danh cho ${e(member.name)}. Chủ nhiệm, phó chủ nhiệm, thủ quỹ và HLV có thể xem sổ thu chi; thủ quỹ được ghi khoản thu chi.`,
      select("title_choice", "Vai trò", [...choices.map((v) => [v, v]), ["__custom__", "Thêm vai trò khác…"]], member.title || (member.role === "owner" ? "Chủ nhiệm CLB" : "Thành viên")) + field("custom_title", "Vai trò khác", ""),
      (form) => submit(form, "title", async (data) => {
        const title = data.title_choice === "__custom__" ? data.custom_title : data.title_choice;
        if (!title) throw new Error("Vui lòng nhập vai trò.");
        await api.patch(base(`/club-memberships/${member.id}`), { title });
        await loadView(); toast("Đã cập nhật vai trò.");
      }));
    const toggle = () => { modal.querySelector('[name="custom_title"]').closest('.field').hidden = modal.querySelector('[name="title_choice"]').value !== '__custom__'; };
    modal.querySelector('[name="title_choice"]').addEventListener('change', toggle); toggle();
  }
  if (a === "new-lineup" || a === "edit-lineup" || a === "match-lineup" || a === "team-captain" || a === "select-team-players") {
    if (!canManageRoster(currentRole())) return;
    const rows = [];
    let pageNumber = 1, lastPage = 1;
    do {
      const result = unpackList(await api.get(base(`/members?per_page=100&page=${pageNumber}`)));
      rows.push(...result.rows);
      lastPage = result.meta.last_page || 1;
      pageNumber++;
    } while (pageNumber <= lastPage);
    if (a === 'match-lineup') {
      const match = [...s.matches.data, ...s.matchCalendar].find((m) => String(m.id) === el.dataset.id);
      if (!match?.team_id || !s.teams.some((t) => String(t.id) === String(match.team_id))) { toast('Đội bóng của trận không còn hoạt động.', true); return; }
      const lineup = (await api.get(base(`/matches/${match.id}/lineup`))).data;
      return openLineup({ teams: s.teams, players: rows, lineup, linkedMatch: match, api, base, reload: loadView });
    }
    if (a === "select-team-players") {
      const team = s.teams.find((t) => String(t.id) === el.dataset.id);
      if (!team) return;
      const pickerPositions = (p) => (p.teams || []).filter((t) => String(t.format) === String(team.format) && t.position).map((t) => t.position);
      const positions = [...new Set(rows.flatMap(pickerPositions))].sort();
      const fields = `<div class="member-picker"><div class="filters"><label>Tìm tên <input type="search" data-pick-name placeholder="Nhập tên"></label><label>Năm sinh <input type="number" data-pick-year min="1900" max="2100" placeholder="Năm"></label><label>Chân thuận <select data-pick-foot><option value="">Tất cả</option><option value="left">Trái</option><option value="right">Phải</option><option value="both">Hai chân</option></select></label><label>Vị trí <select data-pick-position><option value="">Tất cả</option>${positions.map((p) => `<option value="${e(p)}">${e(p)}</option>`).join('')}</select></label></div><div class="member-picker-list">${rows.map((p) => `<label data-pick-row data-name="${e(p.full_name.toLocaleLowerCase('vi'))}" data-year="${e((p.date_of_birth || '').slice(0, 4))}" data-foot="${e(p.preferred_foot || '')}" data-position="${e(pickerPositions(p).join(', '))}"><input type="checkbox" name="player_ids" value="${p.id}" ${(p.teams || []).some((t) => String(t.id) === String(team.id)) ? "checked" : ""}>${avatar(p.full_name, imageUrl("player", p.id, p.avatar_version, s.clubId))}<span><strong>${e(p.full_name)}</strong><small>${e([formatDate(p.date_of_birth), p.email, p.phone, pickerPositions(p).join(", "), ({left:'Chân trái', right:'Chân phải', both:'Hai chân'})[p.preferred_foot]].filter(Boolean).join(' · '))}</small></span></label>`).join("") || "Chưa có thành viên. Hãy tạo thành viên CLB trước."}</div></div>`;
      const modal = dialog("Chọn thành viên cho đội", `Chọn từ các hồ sơ đã tạo trong CLB. Bỏ chọn sẽ đưa thành viên ra khỏi đội ${e(team.name)}.`, fields, (form) => submit(form, "team-players", async () => {
        const player_ids = [...form.querySelectorAll('[name="player_ids"]:checked')].map((x) => Number(x.value));
        await api.patch(base(`/teams/${team.id}/players`), { player_ids });
        await loadView(); toast("Đã cập nhật thành viên đội.");
      }));
      modal.classList.add('member-picker-dialog');
      modal.querySelectorAll('[data-pick-row]').forEach((row) => { const player = rows.find((p) => String(p.id) === row.querySelector('[name="player_ids"]').value); row.dataset.positions = JSON.stringify(pickerPositions(player)); row.dataset.fullName = player.full_name; row.dataset.name = `${player.full_name} ${player.notes || ''}`.toLocaleLowerCase('vi'); });
      modal.querySelector('[data-pick-name]').placeholder = 'Tên hoặc ghi chú';
      const sortLabel = document.createElement('label'); sortLabel.innerHTML = 'Sắp xếp <select data-pick-sort><option value="asc">Tên A–Z</option><option value="desc">Tên Z–A</option></select>'; modal.querySelector('.filters').append(sortLabel);
      const filter = () => { const name = modal.querySelector('[data-pick-name]').value.trim().toLocaleLowerCase('vi'), year = modal.querySelector('[data-pick-year]').value, foot = modal.querySelector('[data-pick-foot]').value, position = modal.querySelector('[data-pick-position]').value, direction = modal.querySelector('[data-pick-sort]').value === 'desc' ? -1 : 1; const list = modal.querySelector('.member-picker-list'), items = [...list.querySelectorAll('[data-pick-row]')]; items.forEach((row) => { row.hidden = !row.dataset.name.includes(name) || (year && row.dataset.year !== year) || (foot && row.dataset.foot !== foot) || (position && !JSON.parse(row.dataset.positions).includes(position)); }); items.sort((a,b) => Number(b.querySelector('input').checked) - Number(a.querySelector('input').checked) || direction * compareVietnameseNames(a.dataset.fullName, b.dataset.fullName)); items.forEach((row) => list.append(row)); };
      modal.querySelector('.member-picker').addEventListener('input', filter);
      modal.querySelector('.member-picker').addEventListener('change', filter);
      filter();
      return modal;
    }
    if (a === "team-captain") return openCaptain({ team: s.teams.find((t) => String(t.id) === el.dataset.id), players: rows, api, base, reload: loadView });
    return openLineup({ teams: s.teams, players: rows, lineup: s.lineups.find((x) => String(x.id) === el.dataset.id), api, base, reload: loadView });
  }
  if (a === "new-member") return editMember();
  if (a === "invite") return invite();
  if (a === "reset") {
    s.filters = { q: "", team_id: "", status: "", page: 1 };
    return loadView();
  }
  if (a === "prev" || a === "next") {
    s.filters.page += a === "next" ? 1 : -1;
    return loadView();
  }
  if (a === "team-members") {
    s.teamRosterPage = 1;
    s.teamRosterSort = 'full_name';
    s.teamRosterDirection = 'asc'; s.teamRosterSearch = '';
    s.teamDuesFilter = '';
    location.hash = `team-roster?id=${encodeURIComponent(el.dataset.id)}`;
    return;
  }
  if (a === 'export-members' && canManageRoster(currentRole())) {
    const teamId = s.route === 'team-roster' ? s.teamRosterId : s.filters.team_id;
    const filters = s.route === 'team-roster' ? { team_id: teamId, sort: s.teamRosterSort, direction: s.teamRosterDirection, q: s.teamRosterSearch, dues_status: s.teamDuesFilter || '' } : s.filters;
    const rows = []; let page = 1, last = 1;
    do {
      const query = new URLSearchParams({ ...filters, page: String(page), per_page: '100' });
      for (const [key, value] of [...query]) if (!value) query.delete(key);
      const result = unpackList(await api.get(base(`/members?${query}`)));
      rows.push(...result.rows); last = result.meta.last_page || 1; page++;
    } while (page <= last);
    await exportMembers(rows, teamId); toast('Đã xuất danh sách thành viên.'); return;
  }
  if (a === "roster-prev" || a === "roster-next") {
    s.teamRosterPage += a === "roster-next" ? 1 : -1;
    return loadView();
  }
  if (a === "finance-prev" || a === "finance-next") {
    s.financePage += a === "finance-next" ? 1 : -1;
    return loadView();
  }
  if (a === 'discover-prev' || a === 'discover-next') { s.discoveryPage += a === 'discover-next' ? 1 : -1; return loadView(); }
  if (a === 'friendlies-prev' || a === 'friendlies-next') { s.friendlyPage += a === 'friendlies-next' ? 1 : -1; return loadView(); }
  if (a === 'invite-friendly' && canManageClub(currentRole())) {
    const target = s.discovery.data.find((c) => String(c.id) === el.dataset.id); if (!target) return;
    const today = new Date(), date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    return dialog('Mời giao hữu', `${e(currentClub().name)} gửi lời mời đến ${e(target.name)}. CLB nhận có thể chấp nhận hoặc từ chối.`, field('match_date', 'Ngày dự kiến', date, 'date', true) + field('match_time', 'Giờ dự kiến', '', 'time') + field('location', 'Địa điểm dự kiến', '') + field('message', 'Lời nhắn', '', 'textarea'), (form) => submit(form, 'friendly', async (data) => {
      await api.post(base('/friendlies'), { target_club_id: target.id, match_date: data.match_date, match_time: data.match_time || null, location: data.location || null, message: data.message || null });
      s.friendlyPage = 1; await loadView(); toast('Đã gửi lời mời giao hữu trong ứng dụng.');
    }));
  }
  if (a === 'friendly-response' && canManageClub(currentRole())) {
    const item = s.friendlies.data.find((x) => String(x.id) === el.dataset.id), status = el.dataset.status;
    if (!item || !['accepted', 'rejected', 'cancelled'].includes(status)) return;
    const label = { accepted: 'Chấp nhận', rejected: 'Từ chối', cancelled: 'Hủy' }[status];
    return dialog(`${label} lời mời?`, 'Lời mời sẽ được cập nhật cho cả hai CLB.', '', (form) => submit(form, 'friendly-response', async () => { await api.patch(base(`/friendlies/${item.id}`), { status }); await loadView(); toast('Đã cập nhật lời mời.'); }), label);
  }
  if (['new-planned-expense', 'edit-planned-expense', 'stop-planned-expense'].includes(a) && currentClub()?.can_manage_finance) {
    const item = a === 'new-planned-expense' ? null : s.plannedExpenses.find((p) => String(p.id) === el.dataset.id && p.month === el.dataset.month);
    if (a !== 'new-planned-expense' && !item) return;
    const month = item?.month || s.financeFrom.slice(0, 7);
    if (a === 'stop-planned-expense') return dialog('Dừng khoản chi dự kiến?', `Khoản ${e(item.description)} sẽ dừng từ ${e(month)}; các tháng trước vẫn giữ nguyên.`, '', (form) => submit(form, 'planned-stop', async () => { await api.delete(base(`/finance/planned/${item.id}?${new URLSearchParams({ month })}`)); await loadView(); toast('Đã dừng khoản dự kiến.'); }));
    const fields = field('description', 'Khoản dự kiến chi', item?.description || '', 'text', true) + field('amount', 'Số tiền dự kiến (đồng; có thể để trống)', item?.amount ?? '', 'number').replace('min="0" max="999"', 'min="0" max="1000000000000"') + field('month', item ? 'Áp dụng thay đổi từ tháng' : 'Bắt đầu từ tháng', month, 'month', true) + field('notes', 'Ghi chú', item?.notes || '', 'textarea');
    return dialog(item ? 'Sửa khoản chi dự kiến' : 'Thêm khoản chi dự kiến', 'Khoản dự kiến lặp lại hằng tháng và không tự ghi chi vào sổ.', fields, (form) => submit(form, 'planned-expense', async (data) => {
      const payload = { description: data.description, amount: data.amount === '' ? null : data.amount, month: data.month, notes: data.notes || null };
      if (item) await api.patch(base(`/finance/planned/${item.id}`), payload); else await api.post(base('/finance/planned'), payload);
      await loadView(); toast('Đã lưu khoản chi dự kiến.');
    }));
  }
  if (a === 'finance-adjust-prev' || a === 'finance-adjust-next') { s.financeAdjustmentPage += a === 'finance-adjust-next' ? 1 : -1; return loadView(); }
  if (a === 'birthday-prev' || a === 'birthday-next') { s.birthdayPage += a === 'birthday-next' ? 1 : -1; render(); return; }
  if (a === 'attendance-report' && canManageRoster(currentRole())) return openAttendanceReport({ teams: s.teams, trainings: s.activities.trainings || [], api, base });
  if (a === 'record-dues' && currentClub()?.can_manage_finance) {
    const person = s.dues.find((x) => String(x.player_id) === el.dataset.id); if (!person) return;
    return dialog('Ghi quỹ tháng', `${e(person.name)} · ${e(s.duesMonth)}. Áp dụng cho các đội đủ điều kiện; các khoản đã ghi được giữ nguyên.`, select('status', 'Hình thức', [['paid', 'Đã đóng'], ['exempt', 'Miễn đóng']]) + field('months', 'Số tháng liên tiếp (bao gồm tháng đã chọn)', 1, 'number', true).replace('min="0" max="999"', 'min="1" max="24"'), (form) => submit(form, 'dues', async (data) => {
      await api.post(base('/dues'), { player_id: person.player_id, month: s.duesMonth, months: data.months, status: data.status });
      await loadView(); toast('Đã ghi quỹ.');
    }));
  }
  if (a === 'correct-dues' && currentClub()?.can_manage_finance) {
    const person = s.dues.find((x) => String(x.player_id) === el.dataset.id), team = person?.teams.find((x) => String(x.team_id) === el.dataset.team);
    if (!person || !team) return;
    const old = ['paid', 'exempt'].includes(team.status) ? team.status : 'unpaid';
    return dialog('Sửa trạng thái đóng quỹ', `${e(person.name)} · ${e(team.name)} · ${e(s.duesMonth)} · ${e(number(team.amount))} đ. Sổ thu chi sẽ được điều chỉnh tương ứng; thay đổi này có lưu lý do.`, select('status', 'Trạng thái đúng', [['unpaid', 'Chưa đóng'], ['paid', 'Đã đóng'], ['exempt', 'Miễn đóng']], old) + field('reason', 'Lý do điều chỉnh', '', 'text', true), (form) => submit(form, 'dues-correction', async (data) => {
      await api.patch(base('/dues'), { player_id: person.player_id, team_id: team.team_id, month: s.duesMonth, expected_status: old, status: data.status, reason: data.reason });
      await loadView(); toast('Đã điều chỉnh trạng thái quỹ.');
    }));
  }
  if (a === 'record-team-dues' && currentClub()?.can_manage_finance) {
    const person = s.members.find((x) => String(x.id) === el.dataset.id); if (!person) return;
    const date = vietnamCalendarDate(), month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    return dialog('Ghi quỹ thành viên', `${e(person.full_name)} · Khoản ghi áp dụng cho các đội đủ điều kiện và giữ nguyên các khoản đã ghi.`, field('month', 'Tháng bắt đầu', month, 'month', true) + select('status', 'Hình thức', [['paid', 'Đã đóng'], ['exempt', 'Miễn đóng']]) + field('months', 'Số tháng liên tiếp', 1, 'number', true).replace('min="0" max="999"', 'min="1" max="24"'), (form) => submit(form, 'dues', async (data) => {
      await api.post(base('/dues'), { player_id: person.id, month: data.month, months: data.months, status: data.status }); await loadView(); toast('Đã ghi quỹ.');
    }));
  }
  if (a === "new-finance" && currentClub()?.can_manage_finance) {
    const today = new Date();
    const date = vietnamToday(today);
    return dialog("Ghi khoản thu chi", "Nhập số tiền bằng đồng Việt Nam. Có thể chọn hoặc chụp ảnh xác nhận (JPG, PNG, WEBP tối đa 5 MB).", select("type", "Loại khoản", [["income", "Thu"], ["expense", "Chi"]], "income") + field("amount", "Số tiền (đồng)", "", "number", true).replace('min="0" max="999"', 'min="1" max="1000000000000"') + field("occurred_on", "Ngày", date, "date", true) + field("description", "Nội dung", "", "text", true) + field("category", "Danh mục", "") + field("paid_by", "Người thu / chi", "") + field("notes", "Ghi chú / chứng từ", "", "textarea") + '<div class="field"><label for="f-receipt">Ảnh xác nhận (không bắt buộc)</label><input id="f-receipt" name="receipt" type="file" accept="image/jpeg,image/png,image/webp"><small data-error="receipt"></small></div>', (form) => submit(form, "finance", async (data) => {
      if (!/^[1-9]\d*$/.test(data.amount) || Number(data.amount) > 1000000000000) throw new Error("Số tiền phải là số nguyên từ 1 đến 1.000.000.000.000 đồng.");
      const upload = new FormData(form);
      if (!form.elements.receipt.files.length) upload.delete('receipt');
      await api.post(base("/finance"), upload);
      s.financePage = 1; await loadView(); toast("Đã ghi khoản thu chi.");
    }));
  }
  if (a === "export-finance" && currentClub()?.can_view_finance) {
    const rows = [], adjustments = []; let pageNumber = 1, lastPage = 1, summary = {}, firstAdjustments;
    do {
      const query = new URLSearchParams({ page: pageNumber, per_page: 100, ...(s.financeFrom ? { from: s.financeFrom } : {}), ...(s.financeTo ? { to: s.financeTo } : {}) });
      const result = await api.get(base(`/finance?${query}`)); rows.push(...result.data); lastPage = result.meta.last_page; summary = result.summary; if (pageNumber === 1) firstAdjustments = result.adjustments; pageNumber++;
    } while (pageNumber <= lastPage);
    if (firstAdjustments) {
      adjustments.push(...firstAdjustments.data);
      for (let page = 2; page <= firstAdjustments.meta.last_page; page++) {
        const query = new URLSearchParams({ adjustment_page: page, per_page: 1, ...(s.financeFrom ? { from: s.financeFrom } : {}), ...(s.financeTo ? { to: s.financeTo } : {}) });
        const result = await api.get(base(`/finance?${query}`)); adjustments.push(...result.adjustments.data);
      }
    }
    await exportFinance(rows, summary, adjustments); toast("Đã xuất sổ thu chi."); return;
  }
  if (a === "import-members" && canManageRoster(currentRole())) {
    let pendingImport;
    const info = `<div class="lineup-editor"><p>Chỉ dùng file .xlsx theo mẫu, tối đa 500 dòng và 5 MB. Cột <strong>full_name</strong> bắt buộc; email không được trùng; ngày sinh theo dd/mm/yyyy. Số điện thoại đặt dạng Text. Không đổi thứ tự cột hoặc dùng công thức.</p><p>Tải mẫu để xem đầy đủ vị trí, chân thuận và trạng thái hợp lệ. Sau khi nhập, hãy chọn thành viên vào đội và đặt số áo tại đội.</p><button type="button" class="button secondary" data-download-template>Tải mẫu Excel</button><div class="field"><label for="member-file">File thành viên (.xlsx)</label><input id="member-file" type="file" name="member_file" accept=".xlsx" required></div></div>`;
    const modal = dialog("Nhập thành viên từ Excel", "Kiểm tra dữ liệu trước khi nhập; nếu có lỗi, không dòng nào được lưu.", info, (form) => submit(form, "member-import", async () => {
      const rows = await parseMembers(form.elements.member_file.files[0]);
      try { const result = await api.post(base('/members/import/preview'), { players: rows }); pendingImport = { rows, preview: result.data }; }
      catch (error) {
        const messages = Object.entries(error.errors || {}).map(([key, value]) => { const m = /^players\.(\d+)\.(.+)$/.exec(key); return m ? `Dòng ${rows.sourceRows[Number(m[1])]}, ${m[2]}: ${Array.isArray(value) ? value[0] : value}` : `${key}: ${Array.isArray(value) ? value[0] : value}`; });
        throw new Error(messages.length ? messages.join(' | ') : error.message);
      }
    }), "Kiểm tra file");
    modal.querySelector('[data-download-template]').addEventListener('click', () => downloadMemberTemplate().catch((error) => toast(error.message, true)));
    modal.addEventListener('close', () => { if (pendingImport) reviewImport({ ...pendingImport, api, base, reload: loadView }); }, { once: true });
    return;
  }
  if (a === "set-team-captain") {
    const team = s.teams.find((t) => String(t.id) === s.teamRosterId);
    if (!team || !canManageRoster(currentRole())) return;
    const captain = String(team.captain_id) === el.dataset.id ? null : Number(el.dataset.id);
    await api.patch(base(`/teams/${team.id}/captain`), { captain_id: captain });
    await loadView(); toast(captain ? "Đã chọn đội trưởng." : "Đã bỏ chọn đội trưởng."); return;
  }
  if (a === "edit-team-position") {
    const member = s.members.find((m) => String(m.id) === el.dataset.id);
    const team = s.teams.find((t) => String(t.id) === s.teamRosterId);
    if (!member || !team) return;
    const current = (member.teams || []).find((t) => String(t.id) === String(team.id))?.position || "";
    const positions = { '5': ['GK', 'FIXO', 'ALA', 'PIVOT'], '7': ['GK', 'CB', 'LB', 'RB', 'CDM', 'CM', 'CAM', 'LM', 'RM', 'ST'], '11': ['GK', 'CB', 'LB', 'RB', 'CDM', 'CM', 'CAM', 'LM', 'RM', 'LW', 'RW', 'ST', 'CF'] };
    const choices = (positions[String(team.format)] || []).map((v) => [v, v]);
    const legacy = current && !choices.some(([id]) => id === current);
    return dialog("Vị trí của đội", `${e(member.full_name)} · ${e(team.name)} · Sân ${e(team.format)}${legacy ? ` · Vị trí cũ ${e(current)} không còn phù hợp, hãy chọn lại.` : ''}`, select("position", "Vị trí", [["", "Chưa chọn"], ...choices], legacy ? '' : current), (form) => submit(form, "team-position", async (data) => {
      await api.patch(base(`/teams/${team.id}/players/${member.id}/position`), { position: data.position || null });
      await loadView(); toast("Đã cập nhật vị trí.");
    }));
  }
  if (a === "edit-team-jersey") {
    const member = s.members.find((m) => String(m.id) === el.dataset.id);
    const team = s.teams.find((t) => String(t.id) === s.teamRosterId);
    if (!member || !team) return;
    const jersey = (member.teams || []).find((t) => String(t.id) === String(team.id))?.jersey_number;
    return dialog("Số áo của đội", `${e(member.full_name)} · ${e(team.name)}. Để trống nếu chưa chọn.`, field("jersey_number", "Số áo", jersey ?? "", "number"), (form) => submit(form, "jersey", async (data) => {
      await api.patch(base(`/teams/${team.id}/players/${member.id}/jersey`), { jersey_number: data.jersey_number === "" ? null : data.jersey_number });
      await loadView(); toast("Đã cập nhật số áo.");
    }));
  }
  if (a === "remove-team-player") {
    const member = s.members.find((m) => String(m.id) === el.dataset.id), team = s.teams.find((t) => String(t.id) === s.teamRosterId);
    if (!member || !team || !canManageRoster(currentRole())) return;
    return dialog('Xóa khỏi đội bóng?', `${e(member.full_name)} sẽ rời ${e(team.name)} nhưng hồ sơ vẫn còn trong CLB và các đội khác. Số áo và vị trí ở đội này sẽ bị xóa.`, '', (form) => submit(form, 'remove-player', async () => {
      await api.delete(base(`/teams/${team.id}/players/${member.id}`));
      if (s.members.length === 1 && s.teamRosterPage > 1) s.teamRosterPage--;
      await loadView(); toast('Đã xóa thành viên khỏi đội.');
    }), 'Xóa khỏi đội');
  }
  if (a === "edit-member") {
    const m = s.members.find((x) => String(x.id) === el.dataset.id);
    if (m) return editMember(m);
  }
  if (a === "view-member") {
    const m = s.members.find((x) => String(x.id) === el.dataset.id);
    if (!m) return;
    const details = [["Họ tên", m.full_name], ["Email", m.email], ["Điện thoại", m.phone], ["Ngày sinh", formatDate(m.date_of_birth)], ["Chân thuận", m.preferred_foot], ["Trạng thái", m.status], ["Đội bóng", (m.teams || []).map((t) => `${t.name}${t.jersey_number == null ? "" : ` #${t.jersey_number}`}`).join(", ")], ["Ghi chú", m.notes]];
    const removeButton = s.route === 'team-roster' ? '<div class="lineup-editor"><button type="button" class="button secondary" data-remove-from-team>Xóa khỏi đội bóng</button></div>' : '';
    const modal = dialog("Hồ sơ thành viên", "Thông tin và các đội bóng trong câu lạc bộ.", `<div class="lineup-editor profile-image-actions">${avatar(m.full_name, imageUrl('player', m.id, m.avatar_version, s.clubId))}<button type="button" class="button secondary" data-change-player-image>Đổi ảnh đại diện</button></div><dl class="details lineup-editor">${details.map(([label, value]) => `<div><dt>${e(label)}</dt><dd>${e(value ?? "Chưa cập nhật")}</dd></div>`).join("")}</dl>${removeButton}`, async () => true, "Đóng");
    modal.querySelector('[data-remove-from-team]')?.addEventListener('click', () => { modal.close(); action({ dataset: { action: 'remove-team-player', id: String(m.id) } }).catch((error) => toast(error.message, true)); });
    modal.querySelector('[data-change-player-image]').addEventListener('click', () => { modal.close(); editImage('player', m); });
    return modal;
  }
  if (a === "delete-member") {
    const m = s.members.find((x) => String(x.id) === el.dataset.id);
    if (!m) return;
    return dialog(
      "Xóa hồ sơ thành viên?",
      `Bạn sắp xóa hồ sơ của ${e(m.full_name)}. Tài khoản và quyền truy cập được quản lý riêng.`,
      "",
      (form) =>
        submit(form, "delete", async () => {
          await api.delete(base(`/members/${m.id}`));
          if (s.members.length === 1 && s.filters.page > 1) s.filters.page--;
          await loadView();
          toast("Đã xóa hồ sơ.");
        }),
      "Xác nhận xóa",
    );
  }
  if (a === "logout") {
    await api.post("/auth/logout");
    clearSession();
    toast("Đã đăng xuất an toàn.");
  }
  if (a === "verify") {
    const response = await api.post("/auth/verification-notification");
    toast(response.data.message);
  }
  if (a === "refresh-user") {
    s.user = (await api.get("/auth/user")).data;
    render();
    toast(
      s.user.email_verified_at
        ? "Email đã được xác minh."
        : "Email chưa được xác minh.",
    );
  }
}
root.addEventListener("click", (event) => {
  const el = event.target.closest("[data-action]");
  if (el && !el.disabled)
    action(el).catch((error) => toast(error.message, true));
});
document.addEventListener('error', (event) => { if (event.target.matches?.('.avatar img')) event.target.remove(); }, true);
root.addEventListener("change", (event) => {
  if (event.target.matches('[data-birthday-month]')) {
    s.birthdayMonth = event.target.value;
    s.birthdayPage = 1;
    render();
    root.querySelector('[data-birthday-month]')?.focus();
    return;
  }
  if (event.target.matches('[data-finance-period]')) {
    const form = event.target.closest('form');
    form.querySelector('[data-finance-month]').hidden = event.target.value !== 'month';
    form.querySelector('[data-finance-year]').hidden = event.target.value !== 'year';
  }
  if (event.target.matches("[data-club-switch]")) {
    clearTimeout(searchTimer);
    s.clubId = Number(event.target.value);
    s.birthdayPage = 1;
    s.birthdayMonth = '';
    s.friendlyPage = 1;
    s.matchesPage = 1;
    s.inventoryPage = 1; s.inventorySearch = ''; s.inventoryLowStock = false; s.inventoryArchived = false;
    s.pollsPage = 1; s.recruitmentPage = 1; s.recruitmentStatus = '';
    s.filters = { q: "", team_id: "", status: "", page: 1 };
    loadView();
  }
});
root.addEventListener("submit", (event) => {
  const form = event.target.closest("[data-form]");
  if (!form) return;
  event.preventDefault();
  const kind = form.dataset.form;
  if (kind === 'forgot-password' || kind === 'reset-password') {
    submit(form, kind, async (data) => {
      if (kind === 'forgot-password') { const result = await api.post('/auth/forgot-password', { email: data.email }); toast(result.message); }
      else { await api.post('/auth/reset-password', data); s.resetToken = ''; s.resetEmail = ''; s.authMode = 'login'; render(); toast('Đã đặt lại mật khẩu. Bạn có thể đăng nhập.'); }
    });
    return;
  }
  if (kind === "filters") {
    s.filters = { ...values(form), page: 1 };
    loadView();
    return;
  }
  if (kind === 'roster-sort') {
    const data = values(form); s.teamRosterSort = data.sort; s.teamRosterDirection = data.direction || 'asc'; s.teamRosterSearch = data.q || ''; s.teamDuesFilter = data.dues_status || ''; s.teamRosterPage = 1; loadView(); return;
  }
  if (kind === "finance-filter") {
    const data = values(form);
    if (!/^\d{4}-\d{2}$/.test(data.month) || !/^\d{4}$/.test(data.year) || Number(data.year) < 1901 || Number(data.year) > 9998) { toast('Hãy chọn tháng và năm hợp lệ.', true); return; }
    s.financePeriod = data.period; s.financeMonth = data.month; s.financeYear = data.year;
    if (data.period === 'year') { s.financeFrom = `${data.year}-01-01`; s.financeTo = `${data.year}-12-31`; }
    else { const [y, m] = data.month.split('-').map(Number); s.financeFrom = `${data.month}-01`; s.financeTo = `${data.month}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`; }
    s.financePage = 1; s.financeAdjustmentPage = 1; loadView(); return;
  }
  if (kind === 'dues-filter') { const data = values(form); s.duesMonth = data.month; s.duesSearch = data.q || ''; s.duesDirection = data.direction || 'asc'; s.duesTeam = data.team_id || ''; s.duesStatus = data.status || ''; loadView(); return; }
  if (kind === 'discover-filter') { s.discoveryQuery = values(form).q || ''; s.discoveryPage = 1; loadView(); return; }
  if (kind === 'matches-filter') { const data = values(form); s.matchesView = data.view; s.matchesMonth = data.month; s.matchesWeek = data.week; s.matchesPage = 1; loadView(); return; }
  if (kind === 'inventory-filter') { s.inventorySearch = values(form).search || ''; s.inventoryLowStock = Boolean(form.elements.low_stock.checked); s.inventoryArchived = Boolean(form.elements.archived.checked); s.inventoryPage = 1; loadView(); return; }
  if (kind === 'recruitment-filter') { s.recruitmentStatus = values(form).status || ''; s.recruitmentPage = 1; loadView(); return; }
  submit(form, kind, async (data) => {
    if (kind === "login" || kind === "register") {
      s.user = (
        await api.post(`/auth/${kind}`, data, { silentUnauthorized: true })
      ).data;
      await loadApp();
      toast("Chào mừng bạn đến với FCMS PRO!");
    }
    if (kind === "profile") {
      s.user = (await api.patch("/auth/profile", data)).data;
      render();
      toast("Đã cập nhật tài khoản.");
    }
    if (kind === "accept") {
      const response = await api.post("/invitations/accept", {
        token: data.token,
      });
      s.invite = "";
      s.clubId = response.data.id;
      s.route = "dashboard";
      history.replaceState(null, "", location.pathname + "#dashboard");
      await loadApp();
      toast("Đã tham gia câu lạc bộ.");
    }
  });
});
root.addEventListener("input", (event) => {
  if (event.target.name !== "q") return;
  clearTimeout(searchTimer);
  const text = event.target.value;
  searchTimer = setTimeout(async () => {
    if (s.route !== "members" || !s.user) return;
    s.filters.q = text;
    s.filters.page = 1;
    await loadView();
    const input = root.querySelector('[name="q"]');
    if (input) {
      input.focus();
      input.setSelectionRange(text.length, text.length);
    }
  }, 500);
});
window.addEventListener("hashchange", () => {
  clearTimeout(searchTimer);
  document.querySelectorAll("dialog").forEach((x) => x.close());
  readRoute();
  if (s.user) loadView();
  else render();
  window.scrollTo(0, 0);
});
for (const type of ["online", "offline"])
  window.addEventListener(type, () => {
    const banner = document.querySelector("#connection-banner");
    if (banner) banner.hidden = navigator.onLine;
    toast(
      navigator.onLine ? "Đã kết nối lại." : "Bạn đang ngoại tuyến.",
      !navigator.onLine,
    );
  });
document.querySelector(".skip-link").addEventListener("click", (event) => {
  event.preventDefault();
  document.querySelector("#main-content")?.focus();
});
try {
  document.documentElement.dataset.theme =
    localStorage.getItem("fcms-theme") || "light";
} catch {}
readRoute();
async function boot() {
  try {
    s.user = (await api.get("/auth/user", { silentUnauthorized: true })).data;
    await loadApp();
  } catch (error) {
    s.loading = false;
    render();
    if (error.status !== 401) toast(error.message, true);
  }
}
boot();
if (import.meta.env.PROD && "serviceWorker" in navigator && isSecureContext)
  navigator.serviceWorker
    .register("/sw.js")
    .then((registration) => {
      registration.addEventListener("updatefound", () => {
        const worker = registration.installing;
        worker?.addEventListener("statechange", () => {
          if (
            worker.state === "installed" &&
            navigator.serviceWorker.controller
          )
            toast("Phiên bản mới đã sẵn sàng. Tải lại trang để cập nhật.");
        });
      });
    })
    .catch(() => toast("Không thể cài bộ nhớ ứng dụng ngoại tuyến.", true));
