export const escapeHtml = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ],
  );
export const initials = (value) =>
  String(value || "FC")
    .trim()
    .split(/\s+/)
    .slice(-2)
    .map((word) => word[0])
    .join("")
    .toLocaleUpperCase("vi");
export const number = (value) =>
  new Intl.NumberFormat("vi-VN").format(Number(value) || 0);
export const compareVietnameseNames = (a, b) => {
  const clean = (name) => String(name || '').trim();
  const first = (name) => clean(name).split(/\s+/).pop();
  return first(a).localeCompare(first(b), 'vi') || clean(a).localeCompare(clean(b), 'vi');
};
export const roleLabel = (role) =>
  ({
    owner: "Chủ nhiệm CLB",
    co_owner: "Ban chủ nhiệm",
    general_manager: "Ban quản lý",
    treasurer: "Thủ quỹ",
    hr_manager: "Quản lý nhân sự",
    equipment_manager: "Quản lý trang bị",
    sporting_manager: "Quản lý chuyên môn",
    member: "Thành viên",
  })[role] || "Thành viên";
export const statusLabel = (status) =>
  ({
    active: "Đang hoạt động",
    inactive: "Tạm ngưng",
    injured: "Chấn thương",
    graduated: "Đã ra trường",
  })[status] || status;

export function currentAcademicYear(date = new Date()) {
  const d = typeof date === "string" ? new Date(date) : (date || new Date());
  const month = d.getMonth() + 1;
  const year = d.getFullYear();
  return month >= 9 ? `${year}-${year + 1}` : `${year - 1}-${year}`;
}
export const canManageRoster = (target) => {
  if (!target) return false;
  if (typeof target === 'object') {
    if (target.is_system_admin || target.membership_role === 'owner') return true;
    if (target.can_manage_roster !== undefined) return Boolean(target.can_manage_roster);
    return [
      "owner",
      "co_owner",
      "general_manager",
      "hr_manager",
      "sporting_manager",
    ].includes(target.membership_role);
  }
  return [
    "owner",
    "co_owner",
    "general_manager",
    "hr_manager",
    "sporting_manager",
  ].includes(target);
};

export const canManageClub = (target) => {
  if (!target) return false;
  if (typeof target === 'object') {
    if (target.is_system_admin || target.membership_role === 'owner') return true;
    if (target.can_manage_club !== undefined) return Boolean(target.can_manage_club);
    return ["owner", "co_owner", "general_manager"].includes(target.membership_role);
  }
  return ["owner", "co_owner", "general_manager"].includes(target);
};
export function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}
export function formatDate(value) {
  if (!value) return '';
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match && validDate(match[0]) ? `${match[3]}/${match[2]}/${match[1]}` : String(value);
}
export function vietnamToday(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const get = (type) => parts.find((part) => part.type === type).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}
export function formatVietnamDateTime(value) {
  if (!value) return '';
  const text = String(value);
  const input = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}$/.test(text) ? text.replace(' ', 'T') + 'Z' : text;
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return text;
  return new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(date);
}
export function validate(kind, data) {
  const errors = {};
  const required = (key, label) => {
    if (!String(data[key] || "").trim())
      errors[key] = `${label} không được để trống.`;
  };
  if (["register", "profile"].includes(kind)) required("name", "Họ tên");
  if (["login", "register", "profile"].includes(kind))
    required("email", "Email");
  if (["login", "register"].includes(kind)) required("password", "Mật khẩu");
  if (kind === "register" && data.password && data.password.length < 8)
    errors.password = "Mật khẩu cần ít nhất 8 ký tự.";
  if (kind === "register" && data.password_confirmation !== data.password)
    errors.password_confirmation = "Mật khẩu xác nhận chưa khớp.";
  if (kind === "member") {
    required("full_name", "Họ tên");
    if (
      data.jersey_number !== "" &&
      data.jersey_number != null &&
      (!/^\d+$/.test(String(data.jersey_number)) ||
        Number(data.jersey_number) > 999)
    )
      errors.jersey_number = "Số áo phải từ 0 đến 999.";
    if (
      data.date_of_birth &&
      (!validDate(data.date_of_birth) ||
        data.date_of_birth > vietnamToday())
    )
      errors.date_of_birth = "Ngày sinh không hợp lệ.";
    if (!["active", "inactive", "injured"].includes(data.status))
      errors.status = "Chọn trạng thái hợp lệ.";
  }
  if (["club", "team"].includes(kind)) required("name", "Tên");
  if (kind === "team" && !["5", "7", "11"].includes(String(data.format)))
    errors.format = "Chọn loại sân 5, 7 hoặc 11 người.";
  if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(data.email).trim()))
    errors.email = "Nhập địa chỉ email hợp lệ.";
  return errors;
}
export function unpackList(payload) {
  if (Array.isArray(payload?.data))
    return { rows: payload.data, meta: payload.meta || {} };
  if (Array.isArray(payload?.data?.data))
    return { rows: payload.data.data, meta: payload.data };
  return { rows: [], meta: {} };
}

export const TITLE_PRESETS = {
  'Phó chủ nhiệm CLB': {
    can_view_finance: true,
    can_manage_finance: false,
    can_manage_roster: true,
    can_manage_inventory: true,
    can_manage_activities: true,
    can_manage_club: true,
  },
  'Thủ quỹ': {
    can_view_finance: true,
    can_manage_finance: true,
    can_manage_roster: false,
    can_manage_inventory: false,
    can_manage_activities: false,
    can_manage_club: false,
  },
  'Trưởng ban chuyên môn / HLV': {
    can_view_finance: false,
    can_manage_finance: false,
    can_manage_roster: true,
    can_manage_inventory: false,
    can_manage_activities: true,
    can_manage_club: false,
  },
  'Phụ trách hậu cần / Trang thiết bị': {
    can_view_finance: false,
    can_manage_finance: false,
    can_manage_roster: false,
    can_manage_inventory: true,
    can_manage_activities: true,
    can_manage_club: false,
  },
  'Ủy viên BCN / Cán sự': {
    can_view_finance: false,
    can_manage_finance: false,
    can_manage_roster: false,
    can_manage_inventory: false,
    can_manage_activities: true,
    can_manage_club: false,
  },
  'Thành viên': {
    can_view_finance: false,
    can_manage_finance: false,
    can_manage_roster: false,
    can_manage_inventory: false,
    can_manage_activities: false,
    can_manage_club: false,
  },
};
