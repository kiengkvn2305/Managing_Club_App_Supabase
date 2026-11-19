export function createDiscoveryController(ctx) {
  async function handleAction(a, el) {
    if (a === 'discover-prev' || a === 'discover-next') {
      ctx.state.discoveryPage += a === 'discover-next' ? 1 : -1;
      await ctx.loadView();
      return true;
    }

    if (a === 'friendlies-prev' || a === 'friendlies-next') {
      ctx.state.friendlyPage += a === 'friendlies-next' ? 1 : -1;
      await ctx.loadView();
      return true;
    }

    if (a === 'invite-friendly' && ctx.canManageClub(ctx.currentRole())) {
      const target = ctx.state.discovery.data.find(
        (c) => String(c.id) === el.dataset.id
      );
      if (!target) return true;

      const today = new Date();
      const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

      return ctx.dialog(
        'Mời giao hữu',
        `${ctx.e(ctx.currentClub().name)} gửi lời mời đến ${ctx.e(target.name)}. CLB nhận có thể chấp nhận hoặc từ chối.`,
        ctx.field('match_date', 'Ngày dự kiến', date, 'date', true) +
          ctx.field('match_time', 'Giờ dự kiến', '', 'time') +
          ctx.field('location', 'Địa điểm dự kiến', '') +
          ctx.field('message', 'Lời nhắn', '', 'textarea'),
        (form) =>
          ctx.submit(form, 'friendly', async (data) => {
            await ctx.api.post(ctx.base('/friendlies'), {
              target_club_id: target.id,
              match_date: data.match_date,
              match_time: data.match_time || null,
              location: data.location || null,
              message: data.message || null,
            });
            ctx.state.friendlyPage = 1;
            await ctx.loadView();
            ctx.toast('Đã gửi lời mời giao hữu trong ứng dụng.');
          })
      );
    }

    if (a === 'friendly-response' && ctx.canManageClub(ctx.currentRole())) {
      const item = ctx.state.friendlies.data.find(
        (x) => String(x.id) === el.dataset.id
      );
      const status = el.dataset.status;
      if (!item || !['accepted', 'rejected', 'cancelled'].includes(status)) {
        return true;
      }
      const label = {
        accepted: 'Chấp nhận',
        rejected: 'Từ chối',
        cancelled: 'Hủy',
      }[status];

      return ctx.dialog(
        `${label} lời mời?`,
        'Lời mời sẽ được cập nhật cho cả hai CLB.',
        '',
        (form) =>
          ctx.submit(
            form,
            'friendly-response',
            async () => {
              await ctx.api.patch(ctx.base(`/friendlies/${item.id}`), { status });
              await ctx.loadView();
              ctx.toast('Đã cập nhật lời mời.');
            },
            label
          )
      );
    }

    return false;
  }

  return {
    handleAction,
  };
}
