import { check } from './service-helpers.js';

export function createDuesService({ supabase }) {
  async function getDues(clubId, params) {
    const rawMonth = params.get('month') || new Date().toISOString().slice(0, 7);
    const targetMonth = `${rawMonth.slice(0, 7)}-01`;

    // Ưu tiên xử lý toàn bộ nghiệp vụ tính quỹ tại backend qua RPC bảo mật
    if (typeof supabase?.rpc === 'function') {
      try {
        const { data: rpcDues, error: rpcErr } = await supabase.rpc('get_club_dues_report', {
          p_club_id: clubId,
          p_month: rawMonth.slice(0, 7),
        });
        if (!rpcErr && Array.isArray(rpcDues) && rpcDues.length > 0) {
          return { data: rpcDues };
        }
      } catch {}
    }

    const [
      entriesResult,
      teamPlayersResult,
      playerProfilesResult,
      teamsResult,
      ratesResult,
      boardMembersResult,
      sharedBoardRatesResult,
      boardRatesResult,
      clubResult,
    ] = await Promise.all([
      supabase
        .from('team_dues_entries')
        .select(
          '*,player:player_profiles(id,full_name,date_of_birth,email,notes,status),team:teams(id,name)'
        )
        .eq('club_id', clubId)
        .eq('month', targetMonth),
      supabase
        .from('team_players')
        .select(
          'team_id,player_id,player:player_profiles(id,full_name,date_of_birth,email,notes,status),team:teams(id,name)'
        )
        .eq('club_id', clubId),
      supabase
        .from('player_profiles')
        .select('id,full_name,date_of_birth,email,notes,status,team_id')
        .eq('club_id', clubId)
        .in('status', ['active', 'inactive'])
        .not('team_id', 'is', null),
      supabase
        .from('teams')
        .select('id,name')
        .eq('club_id', clubId),
      supabase
        .from('team_dues_rates')
        .select('team_id,effective_month,amount')
        .eq('club_id', clubId)
        .lte('effective_month', targetMonth)
        .order('effective_month', { ascending: false }),
      supabase
        .from('club_board_members')
        .select('player_id')
        .eq('club_id', clubId)
        .is('archived_at', null),
      supabase
        .from('shared_board_dues_rates')
        .select('team_id,effective_month,amount')
        .eq('club_id', clubId)
        .lte('effective_month', targetMonth)
        .order('effective_month', { ascending: false }),
      supabase
        .from('board_dues_rates')
        .select('player_id,team_id,effective_month,ends_before,amount')
        .eq('club_id', clubId)
        .lte('effective_month', targetMonth)
        .order('effective_month', { ascending: false }),
      supabase
        .from('clubs')
        .select('maintenance_fee')
        .eq('id', clubId)
        .maybeSingle(),
    ]);

    const rows = check(entriesResult) || [];
    const teamPlayers = check(teamPlayersResult) || [];
    const directTeamPlayers = check(playerProfilesResult) || [];
    const clubTeams = check(teamsResult) || [];
    const rates = check(ratesResult) || [];
    const boardMembers = check(boardMembersResult) || [];
    const sharedBoardRates = check(sharedBoardRatesResult) || [];
    const boardRates = check(boardRatesResult) || [];
    const clubData = check(clubResult);
    const maintenanceFee = Number(clubData?.maintenance_fee ?? 50000);

    const teamsMap = new Map(clubTeams.map((t) => [t.id, t]));

    // Union team_players with direct player_profiles.team_id
    const combinedPlayers = [...teamPlayers];
    for (const dp of directTeamPlayers) {
      if (
        !combinedPlayers.some(
          (tp) => tp.player_id === dp.id && tp.team_id === dp.team_id
        )
      ) {
        combinedPlayers.push({
          team_id: dp.team_id,
          player_id: dp.id,
          player: dp,
          team: teamsMap.get(dp.team_id) || { id: dp.team_id, name: '' },
        });
      }
    }

    const boardPlayerIds = new Set(boardMembers.map((b) => b.player_id));
    const latestRates = new Map();
    for (const r of rates) {
      if (!latestRates.has(r.team_id)) {
        latestRates.set(r.team_id, Number(r.amount));
      }
    }

    function resolveRate(player, teamId) {
      if (!player || player.status === 'graduated') return null;
      if (player.status === 'inactive') {
        return maintenanceFee;
      }
      const playerId = player.id;
      if (boardPlayerIds.has(playerId)) {
        const personal = boardRates.find(
          (r) =>
            r.player_id === playerId &&
            r.team_id === teamId &&
            (!r.ends_before || r.ends_before > targetMonth)
        );
        if (personal != null) return Number(personal.amount);

        const shared = sharedBoardRates.find((r) => r.team_id === teamId);
        if (shared != null) return Number(shared.amount);
      }
      const std = latestRates.get(teamId);
      return std != null ? std : null;
    }

    const grouped = new Map();
    for (const row of rows) {
      const item = grouped.get(row.player_id) || {
        player_id: row.player_id,
        name: row.player?.full_name,
        date_of_birth: row.player?.date_of_birth,
        email: row.player?.email,
        notes: row.player?.notes,
        status: row.player?.status,
        teams: [],
        total: 0,
        debt: 0,
      };

      item.teams.push({
        team_id: row.team_id,
        name: row.team?.name,
        amount: Number(row.amount || 0),
        status: row.status,
      });
      item.total += Number(row.amount || 0);
      if (row.status === 'unpaid') item.debt += Number(row.amount || 0);
      grouped.set(row.player_id, item);
    }

    for (const tp of combinedPlayers) {
      if (tp.player?.status !== 'active' && tp.player?.status !== 'inactive') continue;
      const rateAmount = resolveRate(tp.player, tp.team_id);
      if (rateAmount == null) continue;

      const item = grouped.get(tp.player_id) || {
        player_id: tp.player_id,
        name: tp.player?.full_name,
        date_of_birth: tp.player?.date_of_birth,
        email: tp.player?.email,
        notes: tp.player?.notes,
        status: tp.player?.status,
        teams: [],
        total: 0,
        debt: 0,
      };

      if (!item.teams.some((t) => t.team_id === tp.team_id)) {
        if (rateAmount === 0) {
          item.teams.push({
            team_id: tp.team_id,
            name: tp.team?.name,
            amount: 0,
            status: 'exempt',
            is_maintenance: tp.player?.status === 'inactive',
          });
        } else {
          item.teams.push({
            team_id: tp.team_id,
            name: tp.team?.name,
            amount: rateAmount,
            status: 'unpaid',
            is_maintenance: tp.player?.status === 'inactive',
          });
          item.total += rateAmount;
          item.debt += rateAmount;
        }
      }
      grouped.set(tp.player_id, item);
    }

    return { data: [...grouped.values()] };
  }

  async function handleDuesRequest(clean, method, data, params, clubId) {
    if (!clubId) return null;

    if (clean.endsWith('/dues') && method === 'GET') {
      return getDues(clubId, params);
    }

    if (clean.endsWith('/dues') && method === 'POST') {
      return {
        data: check(
          await supabase.rpc('record_player_dues', {
            p_club_id: clubId,
            p_player_id: Number(data.player_id),
            p_month: `${data.month}-01`,
            p_months: Number(data.months || 1),
            p_status: data.status,
            p_idempotency_key: data.idempotency_key || null,
          })
        ),
      };
    }

    if (clean.endsWith('/dues') && method === 'PATCH') {
      return {
        data: check(
          await supabase.rpc('correct_team_dues', {
            p_club_id: clubId,
            p_team_id: Number(data.team_id),
            p_player_id: Number(data.player_id),
            p_month: `${data.month}-01`,
            p_expected_status: data.expected_status,
            p_status: data.status,
            p_reason: data.reason,
          })
        ),
      };
    }

    const duesRate = clean.match(/\/teams\/(\d+)\/dues-rate$/);
    if (duesRate && method === 'PATCH') {
      const effective = `${data.dues_month}-01`;
      return {
        data: check(
          await supabase
            .from('team_dues_rates')
            .upsert(
              {
                club_id: clubId,
                team_id: Number(duesRate[1]),
                effective_month: effective,
                amount: Number(data.dues_amount),
              },
              { onConflict: 'team_id,effective_month' }
            )
            .select()
            .single()
        ),
      };
    }

    if (clean === `/clubs/${clubId}/board-dues-rate` && method === 'POST') {
      return {
        data: check(
          await supabase
            .from('shared_board_dues_rates')
            .insert({
              club_id: clubId,
              team_id: Number(data.team_id),
              amount: Number(data.amount),
              effective_month: `${data.effective_month}-01`,
            })
            .select()
            .single()
        ),
      };
    }

    const boardSharedRate = clean.match(/\/board-dues-rates?\/(\d+)$/);
    if (boardSharedRate && method === 'DELETE') {
      check(
        await supabase
          .from('shared_board_dues_rates')
          .delete()
          .eq('club_id', clubId)
          .eq('id', Number(boardSharedRate[1]))
      );
      return {};
    }

    return null;
  }

  return {
    getDues,
    handleDuesRequest,
  };
}
