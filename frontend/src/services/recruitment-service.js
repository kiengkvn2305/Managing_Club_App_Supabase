import { check, page } from './service-helpers.js';

export function createRecruitmentService({ supabase }) {
  async function handleRecruitmentRequest(clean, method, data, params, clubId) {
    if (!clubId) return null;

    if (clean.endsWith('/recruitment/posts') && method === 'GET') {
      return page(
        check(
          await supabase
            .from('recruitment_posts')
            .select('*')
            .eq('club_id', clubId)
            .order('created_at', { ascending: false })
        ) || [],
        params
      );
    }

    if (clean.endsWith('/recruitment/posts') && method === 'POST') {
      return {
        data: check(
          await supabase
            .from('recruitment_posts')
            .insert({
              club_id: clubId,
              title: data.title,
              position: data.position || null,
              requirements: data.requirements || null,
              deadline: data.deadline || null,
              status: data.status || 'draft',
            })
            .select()
            .single()
        ),
      };
    }

    const recruitmentPost = clean.match(/\/recruitment\/posts\/(\d+)$/);
    if (recruitmentPost && method === 'PATCH') {
      return {
        data: check(
          await supabase
            .from('recruitment_posts')
            .update(data)
            .eq('club_id', clubId)
            .eq('id', Number(recruitmentPost[1]))
            .select()
            .single()
        ),
      };
    }

    const applications = clean.match(
      /\/recruitment\/posts\/(\d+)\/applications$/
    );
    if (applications && method === 'GET') {
      let b = supabase
        .from('recruitment_applications')
        .select('*')
        .eq('club_id', clubId)
        .eq('post_id', Number(applications[1]))
        .order('created_at', { ascending: false });
      if (params.get('status')) {
        b = b.eq('status', params.get('status'));
      }
      return page(check(await b) || [], params);
    }

    if (applications && method === 'POST') {
      return {
        data: check(
          await supabase
            .from('recruitment_applications')
            .insert({
              ...data,
              club_id: clubId,
              post_id: Number(applications[1]),
            })
            .select()
            .single()
        ),
      };
    }

    const application = clean.match(
      /\/recruitment\/posts\/(\d+)\/applications\/(\d+)$/
    );
    if (application && method === 'PATCH') {
      return {
        data: check(
          await supabase
            .from('recruitment_applications')
            .update(data)
            .eq('club_id', clubId)
            .eq('post_id', Number(application[1]))
            .eq('id', Number(application[2]))
            .select()
            .single()
        ),
      };
    }

    const promoteApp = clean.match(
      /\/recruitment\/applications\/(\d+)\/promote$/
    );
    if (promoteApp && method === 'POST') {
      return {
        data: check(
          await supabase.rpc('promote_recruitment_application', {
            p_club_id: clubId,
            p_application_id: Number(promoteApp[1]),
          })
        ),
      };
    }

    return null;
  }

  return {
    handleRecruitmentRequest,
  };
}
