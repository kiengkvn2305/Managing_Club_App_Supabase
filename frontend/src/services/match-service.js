import { check, page, numeric } from './service-helpers.js';
import { statisticsView } from '../data-views.js';

export function createMatchService({ supabase }) {
  async function handleMatchRequest(clean, method, data, params, clubId, current) {
    if (!clubId) return null;

    if (clean.endsWith('/matches/calendar') && method === 'GET') {
      const rows =
        check(
          await supabase
            .from('club_matches')
            .select('*,team:teams(name)')
            .eq('club_id', clubId)
            .gte('match_date', params.get('from'))
            .lte('match_date', params.get('to'))
            .order('match_date')
        ) || [];
      return { data: rows };
    }

    if (clean.endsWith('/matches') && method === 'GET') {
      let query = supabase
        .from('club_matches')
        .select('*,team:teams(name)')
        .eq('club_id', clubId)
        .order('match_date', { ascending: false });

      const month = params.get('month');
      if (month && /^\d{4}-\d{2}$/.test(month)) {
        const [y, m] = month.split('-').map(Number);
        query = query
          .gte('match_date', `${month}-01`)
          .lte('match_date', `${month}-${new Date(y, m, 0).getDate()}`);
      }

      return page(
        (check(await query) || []).map((row) => ({
          ...row,
          team_name: row.team?.name || null,
        })),
        params
      );
    }

    if (clean.endsWith('/matches') && method === 'POST') {
      return {
        data: check(
          await supabase
            .from('club_matches')
            .insert({
              ...data,
              club_id: clubId,
              team_id: numeric(data.team_id),
              created_by: current.id,
              our_score: numeric(data.our_score),
              opponent_score: numeric(data.opponent_score),
            })
            .select()
            .single()
        ),
      };
    }

    const matchItem = clean.match(/\/matches\/(\d+)$/);
    if (matchItem && method === 'PATCH') {
      return {
        data: check(
          await supabase
            .from('club_matches')
            .update({
              ...data,
              team_id: numeric(data.team_id),
              our_score: numeric(data.our_score),
              opponent_score: numeric(data.opponent_score),
            })
            .eq('club_id', clubId)
            .eq('id', Number(matchItem[1]))
            .select()
            .single()
        ),
      };
    }

    if (matchItem && method === 'DELETE') {
      check(
        await supabase
          .from('club_matches')
          .delete()
          .eq('club_id', clubId)
          .eq('id', Number(matchItem[1]))
      );
      return {};
    }

    const matchLineup = clean.match(/\/matches\/(\d+)\/lineup$/);
    if (matchLineup && method === 'GET') {
      return {
        data:
          check(
            await supabase
              .from('match_lineups')
              .select('*')
              .eq('club_id', clubId)
              .eq('club_match_id', Number(matchLineup[1]))
              .maybeSingle()
          ) || null,
      };
    }

    if (clean === `/clubs/${clubId}/lineups` && method === 'GET') {
      return {
        data:
          check(
            await supabase
              .from('match_lineups')
              .select('*')
              .eq('club_id', clubId)
              .order('match_date', { ascending: false })
          ) || [],
      };
    }

    if (clean === `/clubs/${clubId}/lineups` && method === 'POST') {
      return {
        data: check(
          await supabase
            .from('match_lineups')
            .insert({
              ...data,
              club_id: clubId,
              team_id: Number(data.team_id),
              club_match_id: numeric(data.club_match_id),
              players: data.players || [],
            })
            .select()
            .single()
        ),
      };
    }

    const lineupItem = clean.match(/\/lineups\/(\d+)$/);
    if (lineupItem && method === 'PATCH') {
      return {
        data: check(
          await supabase
            .from('match_lineups')
            .update({
              ...data,
              team_id: Number(data.team_id),
              players: data.players || [],
            })
            .eq('club_id', clubId)
            .eq('id', Number(lineupItem[1]))
            .select()
            .single()
        ),
      };
    }

    const matchAttendance = clean.match(/\/matches\/(\d+)\/attendance$/);
    if (matchAttendance && method === 'GET') {
      const match = check(
        await supabase
          .from('club_matches')
          .select('team_id')
          .eq('club_id', clubId)
          .eq('id', Number(matchAttendance[1]))
          .single()
      );
      const teamRows = match?.team_id
        ? check(
            await supabase
              .from('team_players')
              .select('player_id,position,jersey_number')
              .eq('club_id', clubId)
              .eq('team_id', match.team_id)
          ) || []
        : [];
      const attendanceRows =
        check(
          await supabase
            .from('match_attendances')
            .select('*')
            .eq('club_id', clubId)
            .eq('match_id', Number(matchAttendance[1]))
        ) || [];

      const ids = [
        ...new Set([
          ...teamRows.map((row) => row.player_id),
          ...attendanceRows.map((row) => row.player_id),
        ]),
      ];
      const players = ids.length
        ? check(
            await supabase
              .from('player_profiles')
              .select('id,full_name,date_of_birth,email')
              .eq('club_id', clubId)
              .in('id', ids)
          ) || []
        : [];

      return {
        data: players.map((player) => ({
          player_id: player.id,
          full_name: player.full_name,
          date_of_birth: player.date_of_birth,
          email: player.email,
          position: teamRows.find((row) => row.player_id === player.id)?.position,
          jersey_number: teamRows.find((row) => row.player_id === player.id)
            ?.jersey_number,
          current_member: teamRows.some((row) => row.player_id === player.id),
          ...(attendanceRows.find((row) => row.player_id === player.id) || {}),
        })),
      };
    }

    if (matchAttendance && method === 'PUT') {
      const source = data.player_id
        ? [data]
        : data.players || data.attendance || [];
      return {
        data: check(
          await supabase.rpc('save_match_attendance', {
            p_club_id: clubId,
            p_match_id: Number(matchAttendance[1]),
            p_entries: source.map((row) => ({
              player_id: Number(row.player_id),
              rsvp: row.rsvp || 'pending',
              attendance: row.attendance || 'unmarked',
            })),
          })
        ),
      };
    }

    const matchStats = clean.match(/\/matches\/(\d+)\/player-stats$/);
    if (matchStats && method === 'GET') {
      const match = check(
        await supabase
          .from('club_matches')
          .select('team_id')
          .eq('club_id', clubId)
          .eq('id', Number(matchStats[1]))
          .single()
      );
      const teamRows = match?.team_id
        ? check(
            await supabase
              .from('team_players')
              .select('player_id,position,jersey_number')
              .eq('club_id', clubId)
              .eq('team_id', match.team_id)
          ) || []
        : [];
      const stats =
        check(
          await supabase
            .from('player_match_stats')
            .select('*')
            .eq('club_id', clubId)
            .eq('match_id', Number(matchStats[1]))
        ) || [];

      const ids = [
        ...new Set([
          ...teamRows.map((row) => row.player_id),
          ...stats.map((row) => row.player_id),
        ]),
      ];
      const players = ids.length
        ? check(
            await supabase
              .from('player_profiles')
              .select('id,full_name,date_of_birth,email')
              .eq('club_id', clubId)
              .in('id', ids)
          ) || []
        : [];

      return {
        data: players.map((player) => ({
          player_id: player.id,
          full_name: player.full_name,
          date_of_birth: player.date_of_birth,
          email: player.email,
          current_team_player: teamRows.some((row) => row.player_id === player.id),
          stat_id: stats.find((row) => row.player_id === player.id)?.id,
          ...(stats.find((row) => row.player_id === player.id) || {}),
        })),
      };
    }

    if (matchStats && method === 'PUT') {
      const source = data.player_id
        ? [data]
        : data.players || data.stats || [];
      const entries = source.map((row) => ({
        club_id: clubId,
        match_id: Number(matchStats[1]),
        player_id: Number(row.player_id),
        goals: Number(row.goals || 0),
        assists: Number(row.assists || 0),
        yellow_cards: Number(row.yellow_cards || 0),
        red_cards: Number(row.red_cards || 0),
        goals_conceded: numeric(row.goals_conceded),
        rating: numeric(row.rating),
      }));
      return {
        data:
          check(
            await supabase
              .from('player_match_stats')
              .upsert(entries, { onConflict: 'match_id,player_id' })
          ) || [],
      };
    }

    const statDelete = clean.match(/\/matches\/(\d+)\/player-stats\/(\d+)$/);
    if (statDelete && method === 'DELETE') {
      check(
        await supabase.rpc('delete_player_match_stat', {
          p_club_id: clubId,
          p_match_id: Number(statDelete[1]),
          p_player_id: Number(statDelete[2]),
        })
      );
      return {};
    }

    const playerStats = clean.match(/\/player-stats$/);
    if (playerStats && method === 'GET') {
      let query = supabase
        .from('player_match_stats')
        .select(
          '*,player:player_profiles(full_name,date_of_birth,email),match:club_matches!inner(status,match_date,team_id,team:teams(name))'
        )
        .eq('club_id', clubId)
        .eq('match.status', 'completed');

      if (params.get('from')) {
        query = query.gte('match.match_date', params.get('from'));
      }
      if (params.get('to')) {
        query = query.lte('match.match_date', params.get('to'));
      }
      if (params.get('team_id')) {
        query = query.eq('match.team_id', Number(params.get('team_id')));
      }

      return { data: statisticsView(check(await query) || []) };
    }

    const costSplit = clean.match(/\/matches\/(\d+)\/cost-split(?:\/(preview))?$/);
    if (costSplit && method === 'GET') {
      const match = check(
        await supabase
          .from('club_matches')
          .select('team_id')
          .eq('club_id', clubId)
          .eq('id', Number(costSplit[1]))
          .single()
      );
      const teamRows = match?.team_id
        ? check(
            await supabase
              .from('team_players')
              .select('player_id')
              .eq('club_id', clubId)
              .eq('team_id', match.team_id)
          ) || []
        : [];
      const attendanceRows =
        check(
          await supabase
            .from('match_attendances')
            .select('player_id,attendance')
            .eq('club_id', clubId)
            .eq('match_id', Number(costSplit[1]))
        ) || [];

      const ids = [
        ...new Set([
          ...teamRows.map((row) => row.player_id),
          ...attendanceRows.map((row) => row.player_id),
        ]),
      ];
      const players = ids.length
        ? check(
            await supabase
              .from('player_profiles')
              .select('id,full_name,date_of_birth,email')
              .eq('club_id', clubId)
              .in('id', ids)
          ) || []
        : [];

      const split = check(
        await supabase
          .from('match_cost_splits')
          .select('*')
          .eq('club_id', clubId)
          .eq('match_id', Number(costSplit[1]))
          .maybeSingle()
      );
      const receivables = split
        ? check(
            await supabase
              .from('match_cost_receivables')
              .select('*,player:player_profiles(full_name,email,date_of_birth)')
              .eq('club_id', clubId)
              .eq('split_id', split.id)
          ) || []
        : [];

      return {
        data: {
          split,
          receivables,
          players: players.map((player) => ({
            ...player,
            player_id: player.id,
            attendance: attendanceRows.find(
              (row) => row.player_id === player.id
            )?.attendance,
          })),
        },
      };
    }

    if (costSplit && method === 'POST') {
      const total = Math.max(
        0,
        Number(data.stadium || 0) +
          Number(data.referee || 0) +
          Number(data.water || 0) +
          Number(data.equipment || 0) +
          Number(data.other || 0) -
          Number(data.sponsorship || 0)
      );
      const splitMethod = data.method || 'equal';
      const sourcePlayers = data.players || [];
      const nonExempt = sourcePlayers.filter((p) => !p.exempt);
      let receivables = [];

      if (splitMethod === 'equal') {
        const count = nonExempt.length;
        const baseShare = count > 0 ? Math.floor(total / count) : 0;
        let remainder = count > 0 ? total - baseShare * count : 0;
        receivables = sourcePlayers.map((p) => {
          if (p.exempt) {
            return {
              player_id: Number(p.player_id),
              amount: 0,
              exempt: true,
              weight: Number(p.weight || 1),
            };
          }
          const extra = remainder > 0 ? 1 : 0;
          if (remainder > 0) remainder--;
          return {
            player_id: Number(p.player_id),
            amount: baseShare + extra,
            exempt: false,
            weight: Number(p.weight || 1),
          };
        });
      } else if (splitMethod === 'weighted') {
        const totalWeight = nonExempt.reduce(
          (sum, p) => sum + Math.max(1, Number(p.weight || 1)),
          0
        );
        let allocated = 0;
        const shares = nonExempt.map((p) => {
          const w = Math.max(1, Number(p.weight || 1));
          const amount =
            totalWeight > 0 ? Math.floor((total * w) / totalWeight) : 0;
          allocated += amount;
          return { player_id: Number(p.player_id), amount, weight: w };
        });

        let remainder = total - allocated;
        const shareMap = new Map();
        for (const s of shares) {
          const extra = remainder > 0 ? 1 : 0;
          if (remainder > 0) remainder--;
          shareMap.set(s.player_id, s.amount + extra);
        }

        receivables = sourcePlayers.map((p) => ({
          player_id: Number(p.player_id),
          amount: p.exempt ? 0 : shareMap.get(Number(p.player_id)) || 0,
          exempt: Boolean(p.exempt),
          weight: Number(p.weight || 1),
        }));
      } else {
        receivables = sourcePlayers.map((row) => ({
          player_id: Number(row.player_id),
          amount: row.exempt ? 0 : Number(row.amount || 0),
          exempt: Boolean(row.exempt),
          weight: Number(row.weight || 1),
        }));
      }

      if (costSplit[2] === 'preview') {
        return { data: { total, receivables } };
      }

      return {
        data: check(
          await supabase.rpc('create_match_cost_split', {
            p_club_id: clubId,
            p_match_id: Number(costSplit[1]),
            p_stadium: Number(data.stadium || 0),
            p_referee: Number(data.referee || 0),
            p_water: Number(data.water || 0),
            p_equipment: Number(data.equipment || 0),
            p_other: Number(data.other || 0),
            p_sponsorship: Number(data.sponsorship || 0),
            p_method: splitMethod,
            p_players: receivables,
          })
        ),
      };
    }

    return null;
  }

  return {
    handleMatchRequest,
  };
}
