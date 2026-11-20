import { openPollCreate, confirmPollVote } from '../polls.js';

export function createPollController(ctx) {
  async function handleAction(a, el) {
    if (a === 'poll-prev' || a === 'poll-next') {
      ctx.state.pollsPage += a === 'poll-next' ? 1 : -1;
      await ctx.loadView();
      return true;
    }

    if (a === 'poll-new') {
      if (!ctx.requirePermission(ctx.canManageClub() && ctx.currentClub()?.status === 'active', 'Tạo biểu quyết')) return true;
      return openPollCreate({
        api: ctx.api,
        base: ctx.base,
        reload: ctx.loadView,
      });
    }

    if (a === 'poll-vote') {
      const poll = ctx.state.polls.data.find(
        (p) => String(p.id) === el.dataset.id
      );
      const option = poll?.options.find((o) => String(o.id) === el.dataset.option);
      if (poll && option) {
        return confirmPollVote({
          poll,
          option,
          api: ctx.api,
          base: ctx.base,
          reload: ctx.loadView,
        });
      }
    }

    return false;
  }

  return {
    handleAction,
  };
}
