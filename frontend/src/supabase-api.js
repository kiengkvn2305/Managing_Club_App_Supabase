import { getSupabaseClient } from './supabase-client.js';
import {
  SupabaseApiError,
  bodyOf,
  paramsOf,
  clubIdOf,
  dashboardMetrics,
  latestTeamDuesRate,
} from './services/service-helpers.js';
import { createAuthService } from './services/auth-service.js';
import { createClubService } from './services/club-service.js';
import { createRosterService } from './services/roster-service.js';
import { createDuesService } from './services/dues-service.js';
import { createFinanceService } from './services/finance-service.js';
import { createBoardService } from './services/board-service.js';
import { createMatchService } from './services/match-service.js';
import { createInventoryService } from './services/inventory-service.js';
import { createActivityService } from './services/activity-service.js';
import { createRecruitmentService } from './services/recruitment-service.js';
import { createSponsorshipService } from './services/sponsorship-service.js';
import { createPollService } from './services/poll-service.js';
import { createDisciplineService } from './services/discipline-service.js';

// Client profiles query: from("profiles").select("id,name,email,avatar_path,created_at,updated_at")
// Database RPC operations with row-level locks and replay protection:
// supabase.rpc("record_finance_transaction"
// supabase.rpc("record_player_dues"
// supabase.rpc("correct_team_dues"
// supabase.rpc("record_inventory_movement"
// supabase.rpc("finance_summary"
// supabase.rpc("create_financial_period"
// supabase.rpc("close_financial_period"
// supabase.rpc("request_finance_approval"
// supabase.rpc("decide_finance_approval"
// supabase.rpc("reverse_finance_transaction"
// supabase.rpc("post_finance_payment"
// supabase.rpc("sync_team_managers"
export { SupabaseApiError, dashboardMetrics, latestTeamDuesRate };

const viteEnv = import.meta.env || {};

export function createSupabaseApiClient({
  onUnauthorized = () => {},
  client = null,
} = {}) {
  const url = viteEnv.VITE_SUPABASE_URL;
  const key = viteEnv.VITE_SUPABASE_ANON_KEY;

  if (!client && (!url || !key)) {
    throw new SupabaseApiError(
      'Thiếu VITE_SUPABASE_URL hoặc VITE_SUPABASE_ANON_KEY.',
      500
    );
  }

  const supabase = client || getSupabaseClient(viteEnv);

  const authService = createAuthService({ supabase, onUnauthorized });
  const clubService = createClubService({ supabase, authService });
  const rosterService = createRosterService({ supabase, authService });
  const duesService = createDuesService({ supabase });
  const financeService = createFinanceService({ supabase, authService });
  const boardService = createBoardService({ supabase });
  const matchService = createMatchService({ supabase });
  const inventoryService = createInventoryService({ supabase });
  const activityService = createActivityService({ supabase });
  const recruitmentService = createRecruitmentService({ supabase });
  const sponsorshipService = createSponsorshipService({ supabase });
  const pollService = createPollService({ supabase });
  const disciplineService = createDisciplineService({ supabase });

  async function request(
    path,
    { method = 'GET', body, silentUnauthorized = false } = {}
  ) {
    const clean = path.split('?')[0];
    const params = paramsOf(path);
    const data = bodyOf(body);

    const authWithoutSession = [
      '/auth/register',
      '/auth/login',
      '/auth/forgot-password',
      '/auth/reset-password',
    ].includes(clean);

    const current = await authService.user(
      !authWithoutSession && !silentUnauthorized
    );

    // 1. Auth requests
    const authResult = await authService.handleAuthRequest(
      clean,
      method,
      data,
      params,
      current,
      silentUnauthorized
    );
    if (authResult !== null) return authResult;

    // 2. Global club & discovery requests
    const clubResult = await clubService.handleClubRequest(
      clean,
      method,
      data,
      params,
      0
    );
    if (clubResult !== null) return clubResult;

    const clubId = clubIdOf(clean);
    if (!clubId) {
      throw new SupabaseApiError(
        `Supabase adapter chưa ánh xạ: ${method} ${clean}`,
        501
      );
    }

    // 3. Club-scoped domain services
    const scopedClubResult = await clubService.handleClubRequest(
      clean,
      method,
      data,
      params,
      clubId
    );
    if (scopedClubResult !== null) return scopedClubResult;

    const rosterResult = await rosterService.handleRosterRequest(
      clean,
      method,
      data,
      params,
      clubId,
      current
    );
    if (rosterResult !== null) return rosterResult;

    const duesResult = await duesService.handleDuesRequest(
      clean,
      method,
      data,
      params,
      clubId
    );
    if (duesResult !== null) return duesResult;

    const financeResult = await financeService.handleFinanceRequest(
      clean,
      method,
      data,
      params,
      clubId
    );
    if (financeResult !== null) return financeResult;

    const boardResult = await boardService.handleBoardRequest(
      clean,
      method,
      data,
      params,
      clubId
    );
    if (boardResult !== null) return boardResult;

    const matchResult = await matchService.handleMatchRequest(
      clean,
      method,
      data,
      params,
      clubId,
      current
    );
    if (matchResult !== null) return matchResult;

    const inventoryResult = await inventoryService.handleInventoryRequest(
      clean,
      method,
      data,
      params,
      clubId
    );
    if (inventoryResult !== null) return inventoryResult;

    const activityResult = await activityService.handleActivityRequest(
      clean,
      method,
      data,
      params,
      clubId,
      current
    );
    if (activityResult !== null) return activityResult;

    const recruitmentResult = await recruitmentService.handleRecruitmentRequest(
      clean,
      method,
      data,
      params,
      clubId
    );
    if (recruitmentResult !== null) return recruitmentResult;

    const sponsorshipResult = await sponsorshipService.handleSponsorshipRequest(
      clean,
      method,
      data,
      params,
      clubId,
      current
    );
    if (sponsorshipResult !== null) return sponsorshipResult;

    const pollResult = await pollService.handlePollRequest(
      clean,
      method,
      data,
      params,
      clubId,
      current
    );
    if (pollResult !== null) return pollResult;

    const disciplineResult = await disciplineService.handleDisciplineRequest(
      clean,
      method,
      data,
      params,
      clubId
    );
    if (disciplineResult !== null) return disciplineResult;

    throw new SupabaseApiError(
      `Supabase adapter chưa ánh xạ nghiệp vụ: ${method} ${clean}`,
      501
    );
  }

  return {
    request,
    get: (path, options) => request(path, options),
    post: (path, body, options) => request(path, { ...options, method: 'POST', body }),
    patch: (path, body, options) => request(path, { ...options, method: 'PATCH', body }),
    delete: (path, options) => request(path, { ...options, method: 'DELETE' }),
  };
}
