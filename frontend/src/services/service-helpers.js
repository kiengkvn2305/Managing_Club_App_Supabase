import { vietnamToday } from '../utils.js';

export class SupabaseApiError extends Error {
  constructor(message, status = 0, errors = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.errors = errors;
  }
}

export const ROLE = {
  owner: { roster: true, club: true },
  co_owner: { roster: true, club: true },
  general_manager: { roster: true, club: true },
  treasurer: { roster: false, club: false },
  hr_manager: { roster: true, club: false },
  equipment_manager: { roster: false, club: false },
  sporting_manager: { roster: true, club: false },
  member: { roster: false, club: false },
};

export const bodyOf = (body) =>
  body instanceof FormData ? Object.fromEntries(body.entries()) : body || {};

export const numeric = (value) =>
  value === '' || value == null ? null : Number(value);

export const truthy = (value) =>
  value === true || value === 1 || value === '1' || value === 'true';

export const paramsOf = (path) =>
  new URLSearchParams(path.split('?')[1] || '');

export const clubIdOf = (path) =>
  Number(path.match(/^\/clubs\/(\d+)/)?.[1] || 0);

export const page = (rows, params, size = 20) => {
  const current = Math.max(1, Number(params.get('page') || 1));
  const total = rows.length;
  const from = (current - 1) * size;
  const meta = {
    current_page: current,
    last_page: Math.max(1, Math.ceil(total / size)),
    total,
  };
  return { data: rows.slice(from, from + size), meta, ...meta };
};

export const hashValue = async (value) => {
  const bytes = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(JSON.stringify(value))
  );
  return [...new Uint8Array(bytes)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
};

export function check(result) {
  if (result.error) {
    let msg = result.error.message;
    let status = 422;
    if (result.error.code === '42501' || msg.includes('forbidden')) {
      msg = 'Bạn không có quyền thực hiện thao tác này. Vui lòng liên hệ Chủ nhiệm CLB để được cấp quyền.';
      status = 403;
    } else if (msg.includes('cannot_restrict_owner')) {
      msg = 'Không thể giới hạn quyền của Chủ nhiệm CLB.';
    } else if (msg.includes('already_owner_cannot_demote')) {
      msg = 'Bạn hiện đã là Chủ nhiệm CLB này, không cần chấp nhận mã mời thành viên.';
    } else if (msg.includes('already_owner')) {
      msg = 'Thành viên này hiện đã là Chủ nhiệm CLB.';
    } else if (msg.includes('target_member_not_found_or_inactive')) {
      msg = 'Không tìm thấy thành viên nhận quyền hoặc thành viên không còn hoạt động.';
    } else if (msg.includes('invalid_or_expired_invitation')) {
      msg = 'Mã lời mời không hợp lệ, đã hết hạn hoặc đã được sử dụng trước đó.';
    } else if (msg.includes('email_mismatch')) {
      msg = 'Mã lời mời này dành cho một địa chỉ email cụ thể khác với tài khoản của bạn.';
    } else if (msg.includes('already_member')) {
      msg = 'Bạn đã là thành viên trong câu lạc bộ này.';
    } else if (msg.includes('inactive_club')) {
      msg = 'Câu lạc bộ này hiện không ở trạng thái hoạt động.';
    } else if (msg.includes('owner_cannot_leave')) {
      msg = 'Chủ nhiệm không thể tự rời câu lạc bộ. Vui lòng chuyển quyền Chủ nhiệm trước hoặc thực hiện xóa CLB.';
    } else if (msg.includes('idempotency_key_required')) {
      msg = 'Yêu cầu lưu thiếu mã chống ghi trùng. Vui lòng tải lại trang rồi thử lại.';
    } else if (msg.includes('idempotency_conflict')) {
      msg = 'Yêu cầu này đã được xử lý với dữ liệu khác. Vui lòng tải lại dữ liệu trước khi tiếp tục.';
    } else if (msg.includes('attendance_stale_reload')) {
      msg = 'Điểm danh vừa được người khác cập nhật. Hãy tải lại danh sách rồi lưu lại thay đổi của bạn.';
    } else if (msg.includes('attendance_must_use_rpc')) {
      msg = 'Điểm danh chỉ được phép lưu qua quy trình an toàn của hệ thống.';
    } else if (msg.includes('not_a_member')) {
      msg = 'Bạn không phải là thành viên của câu lạc bộ này.';
    } else if (msg.includes('not_authenticated')) {
      msg = 'Vui lòng đăng nhập để thực hiện thao tác này.';
    }
    throw new SupabaseApiError(msg, status, { database: [msg] });
  }
  return result.data;
}

export function dashboardMetrics({
  players = [],
  managerMemberships = [],
  teamsCount = 0,
}) {
  return {
    members_count: players.length,
    active_members_count: players.filter((player) => player.status === 'active').length,
    teams_count: Number(teamsCount) || 0,
    managers_count: managerMemberships.filter(
      (membership) => membership.status === 'active' && membership.role !== 'member'
    ).length,
  };
}

export function latestTeamDuesRate(rates = [], teamId, today = vietnamToday()) {
  return (
    rates
      .filter(
        (rate) =>
          String(rate.team_id) === String(teamId) &&
          String(rate.effective_month) <= today
      )
      .sort((a, b) =>
        String(b.effective_month).localeCompare(String(a.effective_month))
      )[0] || null
  );
}
