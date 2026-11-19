import { check } from './service-helpers.js';

export function createActivityService({ supabase }) {
  async function handleActivityRequest(clean, method, data, params, clubId, current) {
    if (!clubId) return null;

    if (clean.endsWith('/activities') && method === 'GET') {
      const [a, t, w, b] = await Promise.all([
        supabase.from('club_celebrations').select('*').eq('club_id', clubId),
        supabase.from('team_trainings').select('*').eq('club_id', clubId),
        supabase.from('club_awards').select('*').eq('club_id', clubId),
        supabase
          .from('player_profiles')
          .select('id,full_name,date_of_birth')
          .eq('club_id', clubId)
          .not('date_of_birth', 'is', null),
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
        },
      };
    }

    const activity = clean.match(/\/activities\/(celebrations|trainings|awards)$/);
    if (activity && method === 'POST') {
      const table = {
        celebrations: 'club_celebrations',
        trainings: 'team_trainings',
        awards: 'club_awards',
      }[activity[1]];

      const payload = { ...data, club_id: clubId, submitted_by: current.id };
      if (activity[1] === 'trainings') {
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
      if (activity[1] === 'awards') {
        const player = check(
          await supabase
            .from('player_profiles')
            .select('full_name')
            .eq('club_id', clubId)
            .eq('id', Number(data.player_id))
            .single()
        );
        payload.player_id = Number(data.player_id);
        payload.player_name = player.full_name;
        payload.award_year = Number(data.award_year);
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
      const table = {
        celebrations: 'club_celebrations',
        trainings: 'team_trainings',
        awards: 'club_awards',
      }[activityItem[1]];
      return {
        data: check(
          await supabase
            .from(table)
            .update(data)
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
