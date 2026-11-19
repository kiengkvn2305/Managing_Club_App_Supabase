import { openMatch } from '../matches.js';
import { openMatchAttendance } from '../match-attendance.js';
import {
  openPlayerMatchStats,
  openPlayerStatsSummary,
} from '../player-stats.js';

export function createMatchController(ctx) {
  async function handleAction(a, el) {
    if (
      (a === 'new-match' || a === 'edit-match') &&
      ctx.canManageRoster(ctx.currentRole())
    ) {
      return openMatch({
        match:
          a === 'edit-match'
            ? [
                ...ctx.state.matches.data,
                ...ctx.state.matchCalendar,
              ].find((m) => String(m.id) === el.dataset.id)
            : null,
        state: ctx.state,
        api: ctx.api,
        base: ctx.base,
        reload: ctx.loadView,
      });
    }

    if (a === 'match-attendance' && ctx.canManageRoster(ctx.currentRole())) {
      const match = [
        ...ctx.state.matches.data,
        ...ctx.state.matchCalendar,
      ].find((m) => String(m.id) === el.dataset.id);
      if (match) {
        return openMatchAttendance({ match, api: ctx.api, base: ctx.base });
      }
    }

    if (a === 'match-player-stats' && ctx.canManageRoster(ctx.currentRole())) {
      const match = [
        ...ctx.state.matches.data,
        ...ctx.state.matchCalendar,
      ].find((m) => String(m.id) === el.dataset.id);
      if (match) {
        return openPlayerMatchStats({ match, api: ctx.api, base: ctx.base });
      }
    }

    if (a === 'stats-summary' && ctx.canManageRoster(ctx.currentRole())) {
      return openPlayerStatsSummary({
        api: ctx.api,
        base: ctx.base,
        teams: ctx.state.teams,
      });
    }

    if (a === 'matches-prev' || a === 'matches-next') {
      ctx.state.matchesPage += a === 'matches-next' ? 1 : -1;
      await ctx.loadView();
      return true;
    }

    return false;
  }

  return {
    handleAction,
  };
}
