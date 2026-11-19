import { activityAction } from '../activities.js';
import { openAttendanceReport } from '../attendance-report.js';

export function createActivityController(ctx) {
  async function handleAction(a, el) {
    if (
      [
        'new-celebration',
        'new-training',
        'new-award',
        'attendance',
        'edit-activity',
        'delete-activity',
        'approve-activity',
      ].includes(a) &&
      ctx.currentClub()?.can_manage_activities
    ) {
      return activityAction(a, el.dataset.id, {
        state: ctx.state,
        api: ctx.api,
        base: ctx.base,
        reload: ctx.loadView,
      });
    }

    if (a === 'attendance-report' && ctx.canManageRoster(ctx.currentRole())) {
      return openAttendanceReport({
        teams: ctx.state.teams,
        trainings: ctx.state.activities.trainings || [],
        api: ctx.api,
        base: ctx.base,
      });
    }

    if (a === 'edit-birthday' && ctx.currentRole() === 'owner') {
      const member = (
        await ctx.api.get(ctx.base(`/members/${el.dataset.id}`))
      ).data;
      return ctx.rosterController.editMember(member);
    }

    if (a === 'birthday-prev' || a === 'birthday-next') {
      ctx.state.birthdayPage += a === 'birthday-next' ? 1 : -1;
      ctx.render();
      return true;
    }

    return false;
  }

  return {
    handleAction,
  };
}
