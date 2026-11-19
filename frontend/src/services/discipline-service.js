import { check, page } from './service-helpers.js';

export function createDisciplineService({ supabase }) {
  async function handleDisciplineRequest(clean, method, data, params, clubId) {
    if (!clubId) return null;

    if (clean.endsWith('/discipline') && method === 'GET') {
      return page(
        check(
          await supabase
            .from('discipline_cases')
            .select('*,player:player_profiles(full_name)')
            .eq('club_id', clubId)
            .order('incident_date', { ascending: false })
        ) || [],
        params,
        25
      );
    }

    if (clean.endsWith('/discipline') && method === 'POST') {
      return {
        data: check(
          await supabase.rpc('create_discipline_case', {
            p_club_id: clubId,
            p_player_id: Number(data.player_id),
            p_incident_date: data.incident_date,
            p_title: data.title,
            p_description: data.description,
            p_status: data.status,
            p_decision: data.decision || null,
            p_fine_amount:
              data.fine_amount === '' ? null : Number(data.fine_amount),
          })
        ),
      };
    }

    const disciplineItem = clean.match(/\/discipline\/(\d+)$/);
    if (disciplineItem && method === 'PATCH') {
      check(
        await supabase.rpc('update_discipline_case', {
          p_club_id: clubId,
          p_case_id: Number(disciplineItem[1]),
          p_player_id: Number(data.player_id),
          p_incident_date: data.incident_date,
          p_title: data.title,
          p_description: data.description,
          p_status: data.status,
          p_decision: data.decision || null,
          p_fine_amount:
            data.fine_amount === '' ? null : Number(data.fine_amount),
          p_reason: data.reason,
        })
      );
      return {};
    }

    const disciplineHistory = clean.match(/\/discipline\/(\d+)\/history$/);
    if (disciplineHistory && method === 'GET') {
      return page(
        check(
          await supabase
            .from('discipline_case_history')
            .select('*,actor:profiles(name)')
            .eq('club_id', clubId)
            .eq('case_id', Number(disciplineHistory[1]))
            .order('created_at', { ascending: false })
        ) || [],
        params,
        25
      );
    }

    return null;
  }

  return {
    handleDisciplineRequest,
  };
}
