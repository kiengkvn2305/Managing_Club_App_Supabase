import { check, SupabaseApiError } from './service-helpers.js';

export function createActivityService({ supabase }) {
  async function handleActivityRequest(clean, method, data, params, clubId, current) {
    if (!clubId) return null;

    if (clean.endsWith('/activities') && method === 'GET') {
      const [a, t, w, b, p] = await Promise.all([
        supabase
          .from('club_celebrations')
          .select('*')
          .eq('club_id', clubId)
          .order('event_date', { ascending: false }),
        supabase
          .from('team_trainings')
          .select('*')
          .eq('club_id', clubId)
          .order('training_date', { ascending: false }),
        supabase
          .from('club_awards')
          .select('*')
          .eq('club_id', clubId)
          .order('award_year', { ascending: false }),
        supabase
          .from('player_profiles')
          .select('id,full_name,date_of_birth')
          .eq('club_id', clubId)
          .not('date_of_birth', 'is', null),
        supabase
          .from('player_profiles')
          .select('id,full_name,status')
          .eq('club_id', clubId)
          .order('full_name', { ascending: true }),
      ]);

      return {
        data: {
          celebrations: check(a) || [],
          trainings: check(t) || [],
          awards: check(w) || [],
          birthdays: (check(b) || []).map((x) => ({
            id: x.id,
            name: x.full_name,
            date_of_birth: x.date_of_birth,
          })),
          players: (check(p) || []).map((x) => ({
            id: x.id,
            full_name: x.full_name,
            status: x.status,
          })),
        },
      };
    }

    const activity = clean.match(/\/activities\/(celebrations|trainings|awards)$/);
    if (activity && method === 'POST') {
      const type = activity[1];
      const table = {
        celebrations: 'club_celebrations',
        trainings: 'team_trainings',
        awards: 'club_awards',
      }[type];

      const payload = { ...data, club_id: clubId, submitted_by: current?.id || null };
      if (type === 'trainings') {
        const team = check(
          await supabase
            .from('teams')
            .select('name')
            .eq('club_id', clubId)
            .eq('id', Number(data.team_id))
            .single()
        );
        payload.team_id = Number(data.team_id);
        payload.team_name = team.name;
        payload.attendance = [];
      }
      if (type === 'awards') {
        const playerId = Number(data.player_id);
        const awardYear = Number(data.award_year);
        const title = String(data.title || '').trim();
        if (!playerId) {
          throw new SupabaseApiError('Vui lòng chọn thành viên được khen thưởng.', 422);
        }
        if (!title) {
          throw new SupabaseApiError('Vui lòng nhập danh hiệu khen thưởng.', 422);
        }
        const player = check(
          await supabase
            .from('player_profiles')
            .select('full_name')
            .eq('club_id', clubId)
            .eq('id', playerId)
            .single()
        );
        payload.player_id = playerId;
        payload.player_name = player.full_name;
        payload.award_year = awardYear || new Date().getFullYear();
        payload.title = title;
        payload.gift = String(data.gift || '').trim() || null;
        payload.notes = String(data.notes || '').trim() || null;
      }

      return {
        data: check(
          await supabase.from(table).insert(payload).select().single()
        ),
      };
    }

    const activityItem = clean.match(
      /\/activities\/(celebrations|trainings|awards)\/(\d+)$/
    );
    if (activityItem && method === 'PATCH') {
      const type = activityItem[1];
      const table = {
        celebrations: 'club_celebrations',
        trainings: 'team_trainings',
        awards: 'club_awards',
      }[type];

      let updatePayload = { ...data };
      if (type === 'awards') {
        updatePayload = {};
        if (data.title != null) updatePayload.title = String(data.title).trim();
        if (data.award_year != null) updatePayload.award_year = Number(data.award_year);
        if (data.gift !== undefined) updatePayload.gift = String(data.gift || '').trim() || null;
        if (data.notes !== undefined) updatePayload.notes = String(data.notes || '').trim() || null;
        if (data.player_id) {
          const playerId = Number(data.player_id);
          const player = check(
            await supabase
              .from('player_profiles')
              .select('full_name')
              .eq('club_id', clubId)
              .eq('id', playerId)
              .single()
          );
          updatePayload.player_id = playerId;
          updatePayload.player_name = player.full_name;
        }
      }

      return {
        data: check(
          await supabase
            .from(table)
            .update(updatePayload)
            .eq('club_id', clubId)
            .eq('id', Number(activityItem[2]))
            .select()
            .single()
        ),
      };
    }

    if (activityItem && method === 'DELETE') {
      const table = {
        celebrations: 'club_celebrations',
        trainings: 'team_trainings',
        awards: 'club_awards',
      }[activityItem[1]];
      check(
        await supabase
          .from(table)
          .delete()
          .eq('club_id', clubId)
          .eq('id', Number(activityItem[2]))
      );
      return {};
    }

    const activityApproval = clean.match(
      /\/activities\/(celebrations|trainings|awards)\/(\d+)\/approve$/
    );
    if (activityApproval && method === 'PATCH') {
      const table = {
        celebrations: 'club_celebrations',
        trainings: 'team_trainings',
        awards: 'club_awards',
      }[activityApproval[1]];
      return {
        data: check(
          await supabase
            .from(table)
            .update({ approval_status: 'approved' })
            .eq('club_id', clubId)
            .eq('id', Number(activityApproval[2]))
            .select()
            .single()
        ),
      };
    }

    const trainingAttendance = clean.match(
      /\/activities\/trainings\/(\d+)\/attendance$/
    );
    if (trainingAttendance && method === 'PATCH') {
      return {
        data: check(
          await supabase
            .from('team_trainings')
            .update({ attendance: data.players || [] })
            .eq('club_id', clubId)
            .eq('id', Number(trainingAttendance[1]))
            .select()
            .single()
        ),
      };
    }

    return null;
  }

  return {
    handleActivityRequest,
  };
}
