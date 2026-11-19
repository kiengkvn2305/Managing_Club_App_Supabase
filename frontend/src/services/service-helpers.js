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
    throw new SupabaseApiError(
      result.error.message,
      result.error.code === '42501' ? 403 : 422,
      { database: [result.error.message] }
    );
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
