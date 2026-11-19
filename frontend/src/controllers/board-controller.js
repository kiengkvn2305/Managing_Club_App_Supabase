const boardTitles = [
  'Chủ nhiệm',
  'Phó chủ nhiệm',
  'Thủ quỹ',
  'Thư ký',
  'Truyền thông',
  'Hậu cần',
  'Huấn luyện viên',
];

export function createBoardController(ctx) {
  function boardTitleFields(value = '') {
    const titles = [
      ...new Set([
        ...boardTitles,
        ...ctx.state.boardMembers.map((member) => member.title).filter(Boolean),
      ]),
    ];
    const options = [
      ...titles.map((title) => [title, title]),
      ['__custom__', 'Chức danh khác…'],
    ];
    return (
      ctx.select(
        'title_choice',
        'Chức danh',
        options,
        !value || titles.includes(value) ? value || titles[0] : '__custom__'
      ) +
      ctx.field(
        'custom_title',
        'Chức danh khác',
        titles.includes(value) ? '' : value
      )
    );
  }

  function setupBoardTitle(modal) {
    const selectEl = modal.querySelector('[name="title_choice"]');
    const toggle = () => {
      modal.querySelector('[name="custom_title"]').closest('.field').hidden =
        selectEl.value !== '__custom__';
    };
    selectEl.addEventListener('change', toggle);
    toggle();
  }

  function selectedBoardTitle(data) {
    return (
      (data.title_choice === '__custom__'
        ? data.custom_title
        : data.title_choice
      )?.trim() || ''
    );
  }

  function canManage(role) {
    return (
      ctx.canManageClub(role) ||
      role === 'owner' ||
      ctx.currentClub()?.can_manage_finance
    );
  }

  async function handleAction(a, el) {
    if (a === 'board-new' && canManage(ctx.currentRole())) {
      const players = ctx.unpackList(
        await ctx.api.get(ctx.base('/members?per_page=1000'))
      ).rows;
      const assigned = new Set(
        ctx.state.boardMembers.map((m) => String(m.player_id))
      );
      const available = players.filter((p) => !assigned.has(String(p.id)));
      if (!available.length) {
        ctx.toast('Không còn thành viên CLB để thêm vào BCN.');
        return true;
      }

      const fields =
        `<div class="member-picker">${ctx.field('board_search', 'Tìm theo tên hoặc ghi chú', '', 'search')}<label>Sắp xếp <select data-board-sort><option value="asc">Tên A–Z</option><option value="desc">Tên Z–A</option></select></label><div class="member-picker-list" data-board-list>${available.map((p) => `<label data-board-row data-full-name="${ctx.e(p.full_name)}" data-search="${ctx.e([p.full_name, p.notes].filter(Boolean).join(' ').toLocaleLowerCase('vi'))}"><input type="radio" name="player_id" value="${ctx.e(p.id)}"><span><strong>${ctx.e(p.full_name)}</strong><small>${ctx.e([ctx.formatDate(p.date_of_birth), p.email, p.notes].filter(Boolean).join(' · ') || 'Chưa có thông tin bổ sung')}</small></span></label>`).join('')}</div><p data-board-empty hidden>Không tìm thấy thành viên.</p></div>` +
        boardTitleFields();

      const modal = ctx.dialog(
        'Thêm BCN',
        'Chọn thành viên và ghi chức danh; không cần tài khoản riêng.',
        fields,
        (form) =>
          ctx.submit(form, 'board', async (data) => {
            const title = selectedBoardTitle(data);
            if (!data.player_id || !title) {
              throw new Error('Vui lòng chọn thành viên và nhập chức danh.');
            }
            await ctx.api.post(ctx.base('/board-members'), {
              player_id: Number(data.player_id),
              title,
            });
            await ctx.loadView();
            ctx.toast('Đã thêm thành viên BCN.');
          }),
        'Thêm BCN'
      );

      modal.classList.add('member-picker-dialog');
      setupBoardTitle(modal);

      const search = modal.querySelector('[name="board_search"]');
      const filterBoard = () => {
        const query = search.value.trim().toLocaleLowerCase('vi');
        let visible = 0;
        const list = modal.querySelector('[data-board-list]');
        const rows = [...list.querySelectorAll('[data-board-row]')];
        const direction =
          modal.querySelector('[data-board-sort]').value === 'desc' ? -1 : 1;

        rows.forEach((row) => {
          row.hidden = !row.dataset.search.includes(query);
          if (!row.hidden) visible++;
          else row.querySelector('input').checked = false;
        });

        rows.sort(
          (a, b) =>
            direction *
            ctx.compareVietnameseNames(a.dataset.fullName, b.dataset.fullName)
        );
        rows.forEach((row) => list.append(row));
        modal.querySelector('[data-board-empty]').hidden = visible > 0;
      };

      search.addEventListener('input', filterBoard);
      modal
        .querySelector('[data-board-sort]')
        .addEventListener('change', filterBoard);
      filterBoard();
      return modal;
    }

    if (
      ['board-edit', 'board-remove'].includes(a) &&
      canManage(ctx.currentRole())
    ) {
      const member = ctx.state.boardMembers.find(
        (m) => String(m.id) === el.dataset.id
      );
      if (!member) return true;

      if (a === 'board-remove') {
        return ctx.dialog(
          'Bỏ khỏi BCN?',
          `Bỏ ${ctx.e(member.full_name)} khỏi danh sách BCN; hồ sơ thành viên vẫn được giữ. Ưu đãi quỹ kết thúc từ tháng sau, các khoản đã ghi được giữ nguyên.`,
          '',
          (form) =>
            ctx.submit(form, 'board', async () => {
              await ctx.api.delete(ctx.base(`/board-members/${member.id}`));
              await ctx.loadView();
              ctx.toast('Đã cập nhật danh sách BCN.');
            }),
          'Bỏ khỏi BCN'
        );
      }

      const modal = ctx.dialog(
        'Sửa chức danh',
        ctx.e(member.full_name),
        boardTitleFields(member.title),
        (form) =>
          ctx.submit(form, 'board', async (data) => {
            const title = selectedBoardTitle(data);
            if (!title) throw new Error('Vui lòng nhập chức danh.');
            await ctx.api.patch(ctx.base(`/board-members/${member.id}`), {
              title,
            });
            await ctx.loadView();
            ctx.toast('Đã cập nhật chức danh.');
          })
      );
      setupBoardTitle(modal);
      return modal;
    }

    if (a === 'board-shared-dues' && canManage(ctx.currentRole())) {
      if (!ctx.state.teams.length) {
        ctx.toast('Hãy tạo đội bóng trước khi đặt mức quỹ.');
        return true;
      }
      const today = ctx.vietnamCalendarDate();
      const firstMonth = new Date(
        today.getFullYear(),
        today.getMonth() + (today.getDate() >= 3 ? 1 : 0),
        1
      );
      const initialMonth = `${firstMonth.getFullYear()}-${String(firstMonth.getMonth() + 1).padStart(2, '0')}`;
      const fields =
        ctx.select(
          'team_id',
          'Đội bóng',
          ctx.state.teams.map((team) => [team.id, team.name])
        ) +
        ctx
          .field(
            'amount',
            'Số tiền BCN phải đóng mỗi tháng (đ)',
            '',
            'number',
            true
          )
          .replace('min="0" max="999"', 'min="0" max="1000000000000"') +
        ctx.field(
          'effective_month',
          'Áp dụng từ tháng',
          initialMonth,
          'month',
          true
        );

      return ctx.dialog(
        'Ưu đãi quỹ chung BCN',
        'Áp dụng cho mọi thành viên BCN trong đội đã chọn; 0 đồng là không phải đóng. Từ ngày 3, mức mới áp dụng sớm nhất tháng sau. Khoản đã ghi và tháng trước không thay đổi.',
        fields,
        (form) =>
          ctx.submit(
            form,
            'board-dues',
            async (data) => {
              if (!/^\d+$/.test(data.amount) || !data.effective_month) {
                throw new Error(
                  'Vui lòng nhập số tiền và tháng áp dụng hợp lệ.'
                );
              }
              await ctx.api.post(ctx.base('/board-dues-rate'), {
                team_id: Number(data.team_id),
                amount: Number(data.amount),
                effective_month: data.effective_month,
              });
              await ctx.loadView();
              ctx.toast('Đã lưu mức quỹ ưu đãi.');
            },
            'Lưu mức quỹ'
          )
      );
    }

    if (a === 'delete-board-shared-rate' && canManage(ctx.currentRole())) {
      const rate = ctx.state.boardSharedRates.find(
        (r) => String(r.id) === el.dataset.id
      );
      if (!rate) return true;

      return ctx.dialog(
        'Xóa mức ưu đãi BCN?',
        `Xóa mức ưu đãi quỹ ${ctx.e(rate.team_name || '')} (${ctx.number(rate.amount)} đ/tháng) áp dụng từ ${ctx.e(rate.effective_month?.slice(5, 7))}/${ctx.e(rate.effective_month?.slice(0, 4))}. Các kỳ sau sẽ áp dụng theo mức quỹ thông thường của đội.`,
        '',
        (form) =>
          ctx.submit(
            form,
            'board-dues-delete',
            async () => {
              await ctx.api.delete(ctx.base(`/board-dues-rates/${rate.id}`));
              await ctx.loadView();
              ctx.toast('Đã xóa mức ưu đãi BCN.');
            },
            'Xóa mức ưu đãi'
          )
      );
    }

    if (
      ['board-task-new', 'board-task-edit', 'board-task-delete'].includes(a) &&
      canManage(ctx.currentRole())
    ) {
      const task = ctx.state.boardTasks.find(
        (t) => String(t.id) === el.dataset.id
      );
      if (a !== 'board-task-new' && !task) return true;

      if (a === 'board-task-delete') {
        return ctx.dialog(
          'Xóa công việc?',
          `Xóa công việc ${ctx.e(task.title)} khỏi danh sách.`,
          '',
          (form) =>
            ctx.submit(
              form,
              'board-task',
              async () => {
                await ctx.api.delete(ctx.base(`/board-tasks/${task.id}`));
                await ctx.loadView();
                ctx.toast('Đã xóa công việc.');
              },
              'Xóa công việc'
            )
        );
      }

      if (!ctx.state.boardMembers.length) {
        ctx.toast('Hãy thêm thành viên BCN trước khi giao việc.');
        return true;
      }

      const fields =
        ctx.field('title', 'Công việc', task?.title || '', 'text', true) +
        ctx.select(
          'board_member_id',
          'Người phụ trách',
          ctx.state.boardMembers.map((m) => [m.id, `${m.full_name} · ${m.title}`]),
          task?.board_member_id || ctx.state.boardMembers[0].id
        ) +
        ctx.field('due_date', 'Hạn chót', task?.due_date || '', 'date') +
        ctx
          .field('progress', 'Tiến độ (%)', task?.progress ?? 0, 'number', true)
          .replace('min="0" max="999"', 'min="0" max="100"') +
        ctx.field(
          'description',
          'Nội dung / ghi chú',
          task?.description || '',
          'textarea'
        );

      return ctx.dialog(
        task ? 'Cập nhật công việc' : 'Giao việc BCN',
        'Chủ nhiệm cập nhật công việc, hạn chót và tiến độ.',
        fields,
        (form) =>
          ctx.submit(
            form,
            'board-task',
            async (data) => {
              const progress = Number(data.progress);
              if (
                !data.title.trim() ||
                !/^\d+$/.test(data.progress) ||
                progress > 100
              ) {
                throw new Error('Nhập công việc và tiến độ từ 0 đến 100%.');
              }
              const payload = {
                title: data.title.trim(),
                board_member_id: Number(data.board_member_id),
                due_date: data.due_date || null,
                progress,
                description: data.description || null,
              };
              if (task) {
                await ctx.api.patch(ctx.base(`/board-tasks/${task.id}`), payload);
              } else {
                await ctx.api.post(ctx.base('/board-tasks'), payload);
              }
              await ctx.loadView();
              ctx.toast('Đã lưu công việc.');
            },
            task ? 'Lưu thay đổi' : 'Giao việc'
          )
      );
    }

    return false;
  }

  return {
    handleAction,
  };
}
