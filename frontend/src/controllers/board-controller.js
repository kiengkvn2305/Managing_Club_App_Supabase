import { matchesSearch, formatDate } from '../utils.js';

const boardTitles = [
  'Chủ nhiệm',
  'Phó chủ nhiệm',
  'Thủ quỹ',
  'Thư ký',
  'Truyền thông',
  'Đối ngoại',
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
    const c = ctx.currentClub();
    return Boolean(
      c?.is_system_admin ||
        role === 'owner' ||
        c?.membership_role === 'owner' ||
        c?.membership_role === 'co_owner' ||
        c?.is_co_owner ||
        ctx.canManageClub(c || role)
    );
  }

  function canManageBoardDues(role) {
    const c = ctx.currentClub();
    return Boolean(
      c?.is_system_admin ||
        role === 'owner' ||
        c?.membership_role === 'owner' ||
        ctx.canManageClub(c || role) ||
        c?.can_manage_finance
    );
  }

  async function handleAction(a, el) {
    if (a === 'board-new') {
      if (!ctx.requirePermission(canManage(ctx.currentRole()), 'Thêm thành viên Ban chủ nhiệm')) return true;
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

      const footLabel = (f) =>
        ({ right: 'Chân phải', left: 'Chân trái', both: 'Hai chân' })[f] || (f ? String(f) : '');

      const fields =
        `<div class="member-picker"><div class="filters picker-toolbar"><input type="search" name="board_search" placeholder="Tìm theo họ tên, ngày sinh, email hoặc ghi chú…" aria-label="Tìm thành viên BCN"><select data-board-sort aria-label="Sắp xếp"><option value="asc">Tên A–Z</option><option value="desc">Tên Z–A</option><option value="dob">Theo ngày sinh</option><option value="notes">Theo ghi chú</option><option value="foot">Theo chân thuận</option></select></div><div class="member-picker-list" data-board-list>${available.map((p) => `<label data-board-row data-full-name="${ctx.e(p.full_name)}" data-dob="${ctx.e(p.date_of_birth || '')}" data-notes="${ctx.e(p.notes || '')}" data-foot="${ctx.e(p.preferred_foot || '')}" data-search="${ctx.e([p.full_name, p.date_of_birth, formatDate(p.date_of_birth), p.email, p.phone, p.notes, p.preferred_foot].filter(Boolean).join(' '))}"><input type="radio" name="player_id" value="${ctx.e(p.id)}"><span style="flex:1;min-width:0;"><strong>${ctx.e(p.full_name)}</strong><small>${ctx.e([p.date_of_birth ? `NS: ${ctx.formatDate(p.date_of_birth)}` : '', p.preferred_foot ? footLabel(p.preferred_foot) : '', p.email, p.notes ? `Ghi chú: ${p.notes}` : ''].filter(Boolean).join(' · ') || 'Chưa có thông tin bổ sung')}</small></span></label>`).join('')}</div><p data-board-empty hidden class="picker-empty">Không tìm thấy thành viên phù hợp.</p></div>` +
        boardTitleFields();

      const modal = ctx.dialog(
        'Thêm thành viên Ban chủ nhiệm',
        'Chọn hồ sơ thành viên trong CLB và gán chức danh BCN.',
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
        const query = search.value.trim();
        let visible = 0;
        const list = modal.querySelector('[data-board-list]');
        const rows = [...list.querySelectorAll('[data-board-row]')];
        const sortVal = modal.querySelector('[data-board-sort]').value;

        rows.forEach((row) => {
          row.hidden = !matchesSearch(row.dataset.search, query);
          if (!row.hidden) visible++;
        });

        rows.sort((a, b) => {
          if (sortVal === 'asc') return ctx.compareVietnameseNames(a.dataset.fullName, b.dataset.fullName);
          if (sortVal === 'desc') return -1 * ctx.compareVietnameseNames(a.dataset.fullName, b.dataset.fullName);
          if (sortVal === 'dob') return (a.dataset.dob || '9999').localeCompare(b.dataset.dob || '9999') || ctx.compareVietnameseNames(a.dataset.fullName, b.dataset.fullName);
          if (sortVal === 'notes') return (b.dataset.notes ? 1 : 0) - (a.dataset.notes ? 1 : 0) || ctx.compareVietnameseNames(a.dataset.fullName, b.dataset.fullName);
          if (sortVal === 'foot') return (a.dataset.foot || '').localeCompare(b.dataset.foot || '') || ctx.compareVietnameseNames(a.dataset.fullName, b.dataset.fullName);
          return 0;
        });
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

    if (['board-edit', 'board-remove'].includes(a)) {
      if (!ctx.requirePermission(canManage(ctx.currentRole()), 'Cập nhật Ban chủ nhiệm')) return true;
      const member = ctx.state.boardMembers.find(
        (m) => String(m.id) === el.dataset.id
      );
      if (!member) return true;

      if (a === 'board-remove') {
        return ctx.dialog(
          'Xóa khỏi BCN?',
          `Xóa ${ctx.e(member.full_name)} khỏi danh sách Ban Chủ Nhiệm. Bản ghi BCN sẽ được xóa hoàn toàn khỏi cơ sở dữ liệu. Hồ sơ thành viên và cầu thủ vẫn được giữ lại.`,
          '',
          (form) =>
            ctx.submit(form, 'board', async () => {
              await ctx.api.delete(ctx.base(`/board-members/${member.id}`));
              await ctx.loadView();
              ctx.toast('Đã xóa thành viên khỏi Ban Chủ Nhiệm.');
            }),
          'Xác nhận xóa khỏi BCN'
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

    if (a === 'board-shared-dues') {
      if (!ctx.requirePermission(canManageBoardDues(ctx.currentRole()), 'Đặt mức quỹ ưu đãi BCN')) return true;
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

    if (a === 'delete-board-shared-rate') {
      if (!ctx.requirePermission(canManageBoardDues(ctx.currentRole()), 'Xóa mức quỹ ưu đãi BCN')) return true;
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
