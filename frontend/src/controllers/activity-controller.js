import { activityAction } from '../activities.js';
import { openAttendanceReport } from '../attendance-report.js';
import { vietnamToday, canManageAttendance, isCoOwnerOrOwner } from '../utils.js';

export function createActivityController(ctx) {
  async function handleAction(a, el) {
    if (['new-training', 'attendance'].includes(a)) {
      if (
        !ctx.requirePermission(
          canManageAttendance(ctx.currentClub()),
          'quản lý lịch tập và điểm danh'
        )
      ) {
        return true;
      }
      return activityAction(a, el.dataset.id, {
        state: ctx.state,
        api: ctx.api,
        base: ctx.base,
        reload: ctx.loadView,
      });
    }

    if (
      [
        'new-celebration',
        'new-award',
        'edit-activity',
        'delete-activity',
        'approve-activity',
      ].includes(a)
    ) {
      const isTrainingTarget = String(el?.dataset?.id || '').startsWith('trainings:');
      const allowed = isTrainingTarget
        ? canManageAttendance(ctx.currentClub())
        : Boolean(
            isCoOwnerOrOwner(ctx.currentClub()) ||
              ctx.currentClub()?.can_manage_activities
          );
      if (
        !ctx.requirePermission(
          allowed,
          isTrainingTarget ? 'quản lý lịch tập và điểm danh' : 'quản lý hoạt động và khen thưởng'
        )
      ) {
        return true;
      }
      return activityAction(a, el.dataset.id, {
        state: ctx.state,
        api: ctx.api,
        base: ctx.base,
        reload: ctx.loadView,
      });
    }

    if (a === 'attendance-report') {
      if (!ctx.requirePermission(Boolean(ctx.currentClub()), 'Xem tiến độ điểm danh')) return true;
      return openAttendanceReport({
        teams: ctx.state.teams,
        trainings: ctx.state.activities.trainings || [],
        api: ctx.api,
        base: ctx.base,
      });
    }

    if (a === 'edit-birthday') {
      if (!ctx.requirePermission(ctx.canManageRoster(), 'Sửa thông tin thành viên')) return true;
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

    if (a === 'training-today') {
      ctx.state.trainingFilterDate = vietnamToday();
      ctx.render();
      return true;
    }

    if (a === 'training-all') {
      ctx.state.trainingFilterDate = '';
      ctx.state.trainingFilterTeam = '';
      ctx.render();
      return true;
    }

    if (a === 'training-select-date') {
      ctx.state.trainingFilterDate = el.dataset.date || '';
      ctx.render();
      return true;
    }

    return false;
  }

  return {
    handleAction,
  };
}
