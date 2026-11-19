import { check } from './service-helpers.js';

export function createPollService({ supabase }) {
  async function handlePollRequest(clean, method, data, params, clubId, current) {
    if (!clubId) return null;

    if (clean.endsWith('/polls') && method === 'GET') {
      const polls =
        check(
          await supabase
            .from('club_polls')
            .select('*,options:club_poll_options(*)')
            .eq('club_id', clubId)
            .order('created_at', { ascending: false })
        ) || [];

      const electors =
        check(
          await supabase
            .from('club_poll_electors')
            .select('poll_id')
            .eq('club_id', clubId)
            .eq('user_id', current.id)
        ) || [];

      const votes =
        check(
          await supabase
            .from('club_poll_votes')
            .select('poll_id,option_id')
            .eq('club_id', clubId)
            .eq('user_id', current.id)
        ) || [];

      const now = Date.now();
      return {
        data: polls.map((poll) => ({
          ...poll,
          options: (poll.options || []).sort(
            (a, b) => a.sort_order - b.sort_order
          ),
          eligible: electors.some((row) => row.poll_id === poll.id),
          voted: votes.some((row) => row.poll_id === poll.id),
          closed: new Date(poll.deadline).getTime() < now,
          eligible_count: electors.filter((row) => row.poll_id === poll.id)
            .length,
        })),
      };
    }

    if (clean.endsWith('/polls') && method === 'POST') {
      return {
        data: check(
          await supabase.rpc('create_club_poll', {
            p_club_id: clubId,
            p_title: data.title,
            p_description: data.description || null,
            p_deadline: data.deadline,
            p_options: data.options || [],
          })
        ),
      };
    }

    const pollVote = clean.match(/\/polls\/(\d+)\/vote$/);
    if (pollVote && method === 'POST') {
      return {
        data: check(
          await supabase.rpc('cast_club_poll_vote', {
            p_club_id: clubId,
            p_poll_id: Number(pollVote[1]),
            p_option_id: Number(data.option_id),
          })
        ),
      };
    }

    return null;
  }

  return {
    handlePollRequest,
  };
}
