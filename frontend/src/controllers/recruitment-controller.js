import {
  openRecruitmentPost,
  showRecruitmentApplications,
} from '../recruitment.js';

export function createRecruitmentController(ctx) {
  async function handleAction(a, el) {
    if (a === 'recruitment-prev' || a === 'recruitment-next') {
      ctx.state.recruitmentPage += a === 'recruitment-next' ? 1 : -1;
      await ctx.loadView();
      return true;
    }

    if (
      a === 'recruitment-new' &&
      ctx.canManageRoster(ctx.currentRole()) &&
      ctx.currentClub()?.status === 'active'
    ) {
      return openRecruitmentPost({
        api: ctx.api,
        base: ctx.base,
        reload: ctx.loadView,
      });
    }

    if (
      ['recruitment-edit', 'recruitment-applications'].includes(a) &&
      ctx.canManageRoster(ctx.currentRole())
    ) {
      const post = ctx.state.recruitment.data.find(
        (p) => String(p.id) === el.dataset.id
      );
      if (!post) return true;

      const canManage = ctx.currentClub()?.status === 'active';
      if (a === 'recruitment-edit' && canManage) {
        return openRecruitmentPost({
          post,
          api: ctx.api,
          base: ctx.base,
          reload: ctx.loadView,
        });
      }

      if (a === 'recruitment-applications') {
        return showRecruitmentApplications({
          post,
          api: ctx.api,
          base: ctx.base,
          canManage,
        });
      }
    }

    return false;
  }

  return {
    handleAction,
  };
}
