export function createDuesController(ctx) {
  async function handleAction(a, el) {
    if (a === 'record-dues' && ctx.currentClub()?.can_manage_finance) {
      const person = ctx.state.dues.find(
        (x) => String(x.player_id) === el.dataset.id
      );
      if (!person) return true;

      return ctx.dialog(
        'Ghi quỹ tháng',
        `${ctx.e(person.name)} · ${ctx.e(ctx.state.duesMonth)}. Áp dụng cho các đội đủ điều kiện; các khoản đã ghi được giữ nguyên.`,
        ctx.select('status', 'Hình thức', [
          ['paid', 'Đã đóng'],
          ['exempt', 'Miễn đóng'],
        ]) +
          ctx
            .field(
              'months',
              'Số tháng liên tiếp (bao gồm tháng đã chọn)',
              1,
              'number',
              true
            )
            .replace('min="0" max="999"', 'min="1" max="24"'),
        (form) =>
          ctx.submit(form, 'dues', async (data) => {
            await ctx.api.post(ctx.base('/dues'), {
              player_id: person.player_id,
              month: ctx.state.duesMonth,
              months: data.months,
              status: data.status,
            });
            await ctx.loadView();
            ctx.toast('Đã ghi quỹ.');
          })
      );
    }

    if (a === 'correct-dues' && ctx.currentClub()?.can_manage_finance) {
      const person = ctx.state.dues.find(
        (x) => String(x.player_id) === el.dataset.id
      );
      const team = person?.teams.find(
        (x) => String(x.team_id) === el.dataset.team
      );
      if (!person || !team) return true;

      const old = ['paid', 'exempt'].includes(team.status)
        ? team.status
        : 'unpaid';

      return ctx.dialog(
        'Sửa trạng thái đóng quỹ',
        `${ctx.e(person.name)} · ${ctx.e(team.name)} · ${ctx.e(ctx.state.duesMonth)} · ${ctx.e(ctx.number(team.amount))} đ. Sổ thu chi sẽ được điều chỉnh tương ứng; thay đổi này có lưu lý do.`,
        ctx.select(
          'status',
          'Trạng thái đúng',
          [
            ['unpaid', 'Chưa đóng'],
            ['paid', 'Đã đóng'],
            ['exempt', 'Miễn đóng'],
          ],
          old
        ) + ctx.field('reason', 'Lý do điều chỉnh', '', 'text', true),
        (form) =>
          ctx.submit(form, 'dues-correction', async (data) => {
            await ctx.api.patch(ctx.base('/dues'), {
              player_id: person.player_id,
              team_id: team.team_id,
              month: ctx.state.duesMonth,
              expected_status: old,
              status: data.status,
              reason: data.reason,
            });
            await ctx.loadView();
            ctx.toast('Đã điều chỉnh trạng thái quỹ.');
          })
      );
    }

    if (a === 'record-team-dues' && ctx.currentClub()?.can_manage_finance) {
      const person = ctx.state.members.find(
        (x) => String(x.id) === el.dataset.id
      );
      if (!person) return true;

      const date = ctx.vietnamCalendarDate();
      const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

      return ctx.dialog(
        'Ghi quỹ thành viên',
        `${ctx.e(person.full_name)} · Khoản ghi áp dụng cho các đội đủ điều kiện và giữ nguyên các khoản đã ghi.`,
        ctx.field('month', 'Tháng bắt đầu', month, 'month', true) +
          ctx.select('status', 'Hình thức', [
            ['paid', 'Đã đóng'],
            ['exempt', 'Miễn đóng'],
          ]) +
          ctx
            .field('months', 'Số tháng liên tiếp', 1, 'number', true)
            .replace('min="0" max="999"', 'min="1" max="24"'),
        (form) =>
          ctx.submit(form, 'dues', async (data) => {
            await ctx.api.post(ctx.base('/dues'), {
              player_id: person.id,
              month: data.month,
              months: data.months,
              status: data.status,
            });
            await ctx.loadView();
            ctx.toast('Đã ghi quỹ.');
          })
      );
    }

    if (a === 'edit-dues-rate' && ctx.currentClub()?.can_manage_finance) {
      const team = ctx.state.teams.find((t) => String(t.id) === el.dataset.id);
      if (!team) return true;

      const today = ctx.vietnamCalendarDate();
      const firstMonth = new Date(
        today.getFullYear(),
        today.getMonth() + (today.getDate() >= 3 ? 1 : 0),
        1
      );
      const month = `${firstMonth.getFullYear()}-${String(firstMonth.getMonth() + 1).padStart(2, '0')}`;

      return ctx.dialog(
        'Chỉnh sửa quỹ đội',
        `Đội ${ctx.e(team.name)}. Mức quỹ áp dụng sớm nhất tháng này nếu chỉnh trước ngày 3, hoặc tháng sau từ ngày 3.`,
        ctx
          .field('dues_amount', 'Mức quỹ mỗi tháng (đồng)', '', 'number', true)
          .replace('min="0" max="999"', 'min="0" max="1000000000000"') +
          ctx.field('dues_month', 'Tháng áp dụng đề xuất', month, 'month', true),
        (form) =>
          ctx.submit(form, 'dues-rate', async (data) => {
            await ctx.api.patch(ctx.base(`/teams/${team.id}/dues-rate`), data);
            await ctx.loadView();
            ctx.toast('Đã cập nhật quỹ đội.');
          })
      );
    }

    return false;
  }

  return {
    handleAction,
  };
}
