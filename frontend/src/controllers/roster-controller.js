import { openLineup, openCaptain } from '../lineups.js';
import {
  downloadMemberTemplate,
  parseMembers,
  exportMembers,
} from '../spreadsheets.js';
import { reviewImport } from '../import-review.js';
import { avatar, imageUrl } from '../images.js';

export function createRosterController(ctx) {
  function editMember(member = { status: 'active' }) {
    const fields =
      ctx.field('full_name', 'Họ và tên', member.full_name, 'text', true) +
      ctx.field('email', 'Email', member.email, 'email') +
      ctx.field('phone', 'Số điện thoại', member.phone, 'tel') +
      ctx.field('date_of_birth', 'Ngày sinh', member.date_of_birth, 'date') +
      ctx.select(
        'preferred_foot',
        'Chân thuận',
        [
          ['', 'Chưa cập nhật'],
          ['right', 'Phải'],
          ['left', 'Trái'],
          ['both', 'Hai chân'],
        ],
        member.preferred_foot
      ) +
      ctx.select(
        'status',
        'Trạng thái',
        ['active', 'inactive', 'injured'].map((x) => [
          x,
          {
            active: 'Đang hoạt động',
            inactive: 'Tạm ngưng',
            injured: 'Chấn thương',
          }[x],
        ]),
        member.status
      ) +
      ctx.field('notes', 'Ghi chú', member.notes, 'textarea');

    ctx.dialog(
      member.id ? 'Chỉnh sửa thành viên' : 'Thêm thành viên',
      'Hồ sơ cầu thủ không tự cấp quyền truy cập tài khoản.',
      fields,
      (form) =>
        ctx.submit(form, 'member', async (data) => {
          for (const k of Object.keys(data)) {
            if (data[k] === '') data[k] = null;
          }
          if (member.id) {
            await ctx.api.patch(ctx.base(`/members/${member.id}`), data);
          } else {
            await ctx.api.post(ctx.base('/members'), data);
          }
          await ctx.loadView();
          ctx.toast('Đã lưu hồ sơ thành viên.');
        })
    );
  }

  function editTeam() {
    ctx.dialog(
      'Tạo đội bóng',
      'Sắp xếp đội hình sân 5, 7 hoặc 11 người.',
      ctx.field('name', 'Tên đội bóng', '', 'text', true) +
        ctx.select(
          'format',
          'Loại sân',
          (ctx.currentClub().formats || [ctx.currentClub().format]).map((v) => [
            v,
            `Sân ${v} người`,
          ]),
          (ctx.currentClub().formats || [ctx.currentClub().format])[0]
        ),
      (form) =>
        ctx.submit(form, 'team', async (data) => {
          await ctx.api.post(ctx.base('/teams'), data);
          await ctx.loadView();
          ctx.toast('Đã tạo đội bóng.');
        })
    );
  }

  async function renameTeam(team) {
    const candidates = ctx.unpackList(
      await ctx.api.get(ctx.base('/team-manager-candidates'))
    ).rows;
    const managerFields = `<fieldset class="field format-options"><legend>Người quản lý đội</legend>${candidates.map((m) => `<label><input type="checkbox" name="manager_ids" value="${m.id}" ${(team.managers || []).some((x) => String(x.id) === String(m.id)) ? 'checked' : ''}> ${ctx.e(m.name)}</label>`).join('') || 'Chưa có tài khoản thành viên.'}</fieldset>`;
    const today = ctx.vietnamCalendarDate();
    const month = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
    const duesInfo = team.monthly_dues
      ? `<p>Mức quỹ gần nhất: ${ctx.e(Number(team.monthly_dues.amount).toLocaleString('vi-VN'))} đ/tháng, từ ${ctx.e(team.monthly_dues.effective_month.slice(0, 7))}.</p>`
      : '<p>Đội chưa thiết lập mức quỹ.</p>';
    const duesFields = ctx.currentClub()?.can_manage_finance
      ? duesInfo +
        ctx
          .field(
            'dues_amount',
            'Mức quỹ mới mỗi tháng (đồng; để trống nếu không đổi)',
            '',
            'number'
          )
          .replace('min="0" max="999"', 'min="0" max="1000000000000"') +
        ctx.field('dues_month', 'Tháng áp dụng đề xuất', month, 'month')
      : '';

    ctx.dialog(
      'Chỉnh sửa đội bóng',
      'Mức quỹ mới áp dụng sớm nhất trong tháng này nếu chỉnh trước ngày 3; từ ngày 3 áp dụng sớm nhất tháng sau.',
      ctx.field('name', 'Tên đội bóng', team.name, 'text', true) +
        ctx.select(
          'format',
          'Loại sân',
          (ctx.currentClub().formats || [ctx.currentClub().format]).map((v) => [
            v,
            `Sân ${v} người`,
          ]),
          team.format
        ) +
        managerFields +
        duesFields,
      (form) =>
        ctx.submit(form, 'team-rename', async (data) => {
          if (!data.name) throw new Error('Vui lòng nhập tên đội bóng.');
          const managerIds = [
            ...form.querySelectorAll('[name="manager_ids"]:checked'),
          ].map((x) => Number(x.value));
          await ctx.api.patch(ctx.base(`/teams/${team.id}`), {
            name: data.name,
            format: data.format,
            membership_ids: managerIds,
            ...(data.dues_amount !== undefined && data.dues_amount !== ''
              ? {
                  dues_amount: data.dues_amount,
                  dues_month: data.dues_month,
                }
              : {}),
          });
          await ctx.loadView();
          ctx.toast('Đã đổi tên đội bóng.');
        })
    );
  }

  function invite() {
    let roles = ['member'];
    if (['owner', 'co_owner'].includes(ctx.currentRole())) {
      roles.push(
        'general_manager',
        'treasurer',
        'hr_manager',
        'equipment_manager',
        'sporting_manager'
      );
    }
    if (ctx.currentRole() === 'owner') roles.push('co_owner');

    let created;
    const el = ctx.dialog(
      'Mời tham gia câu lạc bộ',
      'Tạo liên kết và chia sẻ riêng với người nhận. Không gửi email tự động.',
      ctx.field('email', 'Email người nhận', '', 'email', true) +
        ctx.select(
          'role',
          'Vai trò',
          roles.map((r) => [r, ctx.roleLabel(r)]),
          'member'
        ),
      (form) =>
        ctx.submit(form, 'invitation', async (data) => {
          created = (await ctx.api.post(ctx.base('/invitations'), data)).data;
        }),
      'Tạo lời mời'
    );

    el.addEventListener(
      'close',
      () => {
        if (!created) return;
        const link = `${location.origin}${location.pathname}#accept?token=${encodeURIComponent(created.token)}`;
        const result = ctx.dialog(
          'Lời mời đã sẵn sàng',
          'Sao chép liên kết này và gửi riêng cho người nhận. Hiệu lực 7 ngày.',
          ctx.field('link', 'Liên kết nhận lời mời', link),
          async () => true,
          'Đóng'
        );
        result.querySelector('input').readOnly = true;
        result.querySelector('input').select();
      },
      { once: true }
    );
  }

  async function handleAction(a, el) {
    if (a === 'new-member' && ctx.canManageRoster(ctx.currentRole())) {
      return editMember();
    }

    if (a === 'edit-member' && ctx.canManageRoster(ctx.currentRole())) {
      const m = ctx.state.members.find((x) => String(x.id) === el.dataset.id);
      if (m) return editMember(m);
    }

    if (a === 'delete-member' && ctx.canManageRoster(ctx.currentRole())) {
      const m = ctx.state.members.find((x) => String(x.id) === el.dataset.id);
      if (!m) return true;
      return ctx.dialog(
        'Xóa hồ sơ thành viên?',
        `Bạn sắp xóa hồ sơ của ${ctx.e(m.full_name)}. Tài khoản và quyền truy cập được quản lý riêng.`,
        '',
        (form) =>
          ctx.submit(form, 'delete', async () => {
            await ctx.api.delete(ctx.base(`/members/${m.id}`));
            if (ctx.state.members.length === 1 && ctx.state.filters.page > 1) {
              ctx.state.filters.page--;
            }
            await ctx.loadView();
            ctx.toast('Đã xóa hồ sơ.');
          }),
        'Xác nhận xóa'
      );
    }

    if (a === 'view-member') {
      const m = ctx.state.members.find((x) => String(x.id) === el.dataset.id);
      if (!m) return true;
      const details = [
        ['Họ tên', m.full_name],
        ['Email', m.email],
        ['Điện thoại', m.phone],
        ['Ngày sinh', ctx.formatDate(m.date_of_birth)],
        ['Chân thuận', m.preferred_foot],
        ['Trạng thái', m.status],
        [
          'Đội bóng',
          (m.teams || [])
            .map(
              (t) =>
                `${t.name}${t.jersey_number == null ? '' : ` #${t.jersey_number}`}`
            )
            .join(', '),
        ],
        ['Ghi chú', m.notes],
      ];
      const removeButton =
        ctx.state.route === 'team-roster'
          ? '<div class="lineup-editor"><button type="button" class="button secondary" data-remove-from-team>Xóa khỏi đội bóng</button></div>'
          : '';
      const modal = ctx.dialog(
        'Hồ sơ thành viên',
        'Thông tin và các đội bóng trong câu lạc bộ.',
        `<div class="lineup-editor profile-image-actions">${avatar(m.full_name, imageUrl('player', m.id, m.avatar_version, ctx.state.clubId))}<button type="button" class="button secondary" data-change-player-image>Đổi ảnh đại diện</button></div><dl class="details lineup-editor">${details.map(([label, value]) => `<div><dt>${ctx.e(label)}</dt><dd>${ctx.e(value ?? 'Chưa cập nhật')}</dd></div>`).join('')}</dl>${removeButton}`,
        async () => true,
        'Đóng'
      );
      modal
        .querySelector('[data-remove-from-team]')
        ?.addEventListener('click', () => {
          modal.close();
          handleAction('remove-team-player', {
            dataset: { action: 'remove-team-player', id: String(m.id) },
          }).catch((error) => ctx.toast(error.message, true));
        });
      modal
        .querySelector('[data-change-player-image]')
        ?.addEventListener('click', () => {
          modal.close();
          ctx.clubController.editImage('player', m);
        });
      return modal;
    }

    if (a === 'invite-member' && ctx.canManageClub(ctx.currentRole())) {
      return invite();
    }

    if (a === 'new-team' && ctx.canManageRoster(ctx.currentRole())) {
      return editTeam();
    }

    if (a === 'rename-team' && ctx.canManageRoster(ctx.currentRole())) {
      const team = ctx.state.teams.find((t) => String(t.id) === el.dataset.id);
      if (team) return renameTeam(team);
    }

    if (a === 'delete-team' && ctx.canManageRoster(ctx.currentRole())) {
      const team = ctx.state.teams.find((t) => String(t.id) === el.dataset.id);
      if (!team) return true;
      return ctx.dialog(
        'Xóa đội bóng?',
        `Xóa ${ctx.e(team.name)} sẽ xóa các đội hình trận đấu của đội. Hồ sơ cầu thủ được giữ lại nhưng không còn thuộc đội này.`,
        '',
        (form) =>
          ctx.submit(form, 'delete', async () => {
            await ctx.api.delete(ctx.base(`/teams/${team.id}`));
            await ctx.loadView();
            ctx.toast('Đã xóa đội bóng.');
          }),
        'Xác nhận xóa đội'
      );
    }

    if (a === 'edit-title' && (ctx.currentRole() === 'owner' || ctx.canManageClub(ctx.currentRole()))) {
      const member = ctx.state.clubMemberships.find(
        (m) => String(m.id) === el.dataset.id
      );
      if (!member) return true;
      const preset = [
        'Thành viên',
        'HLV',
        'Chủ nhiệm CLB',
        'Phó chủ nhiệm CLB',
        'Thủ quỹ',
        'Thư ký',
        'Media',
        'Truyền thông',
        ...ctx.state.clubMemberships.map((m) => m.title).filter(Boolean),
      ];
      const choices = [...new Set(preset)];
      const modal = ctx.dialog(
        'Vai trò thành viên',
        `Chọn chức danh cho ${ctx.e(member.name)}. Chủ nhiệm, phó chủ nhiệm, thủ quỹ và HLV có thể xem sổ thu chi; thủ quỹ được ghi khoản thu chi.`,
        ctx.select(
          'title_choice',
          'Vai trò',
          [
            ...choices.map((v) => [v, v]),
            ['__custom__', 'Thêm vai trò khác…'],
          ],
          member.title ||
            (member.role === 'owner' ? 'Chủ nhiệm CLB' : 'Thành viên')
        ) + ctx.field('custom_title', 'Vai trò khác', ''),
        (form) =>
          ctx.submit(form, 'title', async (data) => {
            const title =
              data.title_choice === '__custom__'
                ? data.custom_title
                : data.title_choice;
            if (!title) throw new Error('Vui lòng nhập vai trò.');
            await ctx.api.patch(ctx.base(`/club-memberships/${member.id}`), {
              title,
            });
            await ctx.loadView();
            ctx.toast('Đã cập nhật vai trò.');
          })
      );
      const toggle = () => {
        modal.querySelector('[name="custom_title"]').closest('.field').hidden =
          modal.querySelector('[name="title_choice"]').value !== '__custom__';
      };
      modal
        .querySelector('[name="title_choice"]')
        .addEventListener('change', toggle);
      toggle();
      return modal;
    }

    if (
      (a === 'new-lineup' || a === 'edit-lineup' || a === 'match-lineup') &&
      ctx.canManageRoster(ctx.currentRole())
    ) {
      const rows = [];
      let pageNumber = 1;
      let lastPage = 1;
      do {
        const result = ctx.unpackList(
          await ctx.api.get(
            ctx.base(`/members?per_page=100&page=${pageNumber}`)
          )
        );
        rows.push(...result.rows);
        lastPage = result.meta.last_page || 1;
        pageNumber++;
      } while (pageNumber <= lastPage);

      if (a === 'match-lineup') {
        const match = [
          ...ctx.state.matches.data,
          ...ctx.state.matchCalendar,
        ].find((m) => String(m.id) === el.dataset.id);
        if (
          !match?.team_id ||
          !ctx.state.teams.some((t) => String(t.id) === String(match.team_id))
        ) {
          ctx.toast('Đội bóng của trận không còn hoạt động.', true);
          return true;
        }
        const lineup = (
          await ctx.api.get(ctx.base(`/matches/${match.id}/lineup`))
        ).data;
        return openLineup({
          teams: ctx.state.teams,
          players: rows,
          lineup,
          linkedMatch: match,
          api: ctx.api,
          base: ctx.base,
          reload: ctx.loadView,
        });
      }

      return openLineup({
        teams: ctx.state.teams,
        players: rows,
        lineup: ctx.state.lineups.find((x) => String(x.id) === el.dataset.id),
        api: ctx.api,
        base: ctx.base,
        reload: ctx.loadView,
      });
    }

    if (a === 'team-members') {
      ctx.state.teamRosterPage = 1;
      ctx.state.teamRosterSort = 'full_name';
      ctx.state.teamRosterDirection = 'asc';
      ctx.state.teamRosterSearch = '';
      ctx.state.teamDuesFilter = '';
      location.hash = `team-roster?id=${encodeURIComponent(el.dataset.id)}`;
      return true;
    }

    if (a === 'reset') {
      ctx.state.filters = { q: '', team_id: '', status: '', page: 1 };
      await ctx.loadView();
      return true;
    }

    if (a === 'prev' || a === 'next') {
      ctx.state.filters.page += a === 'next' ? 1 : -1;
      await ctx.loadView();
      return true;
    }

    if (a === 'team-captain' && ctx.canManageRoster(ctx.currentRole())) {
      const team = ctx.state.teams.find((t) => String(t.id) === el.dataset.id);
      if (team) {
        return openCaptain({
          team,
          api: ctx.api,
          base: ctx.base,
          reload: ctx.loadView,
          canManage: ctx.canManageRoster(ctx.currentRole()),
        });
      }
    }

    if (a === 'select-team-players' && ctx.canManageRoster(ctx.currentRole())) {
      const team = ctx.state.teams.find((t) => String(t.id) === el.dataset.id);
      if (team) {
        return openLineup({
          team,
          api: ctx.api,
          base: ctx.base,
          reload: ctx.loadView,
        });
      }
    }

    if (a === 'set-team-captain' && ctx.canManageRoster(ctx.currentRole())) {
      const team = ctx.state.teams.find(
        (t) => String(t.id) === ctx.state.teamRosterId
      );
      if (!team) return true;
      const captain =
        String(team.captain_id) === el.dataset.id
          ? null
          : Number(el.dataset.id);
      await ctx.api.patch(ctx.base(`/teams/${team.id}/captain`), {
        captain_id: captain,
      });
      await ctx.loadView();
      ctx.toast(captain ? 'Đã chọn đội trưởng.' : 'Đã bỏ chọn đội trưởng.');
      return true;
    }

    if (a === 'edit-team-position' && ctx.canManageRoster(ctx.currentRole())) {
      const member = ctx.state.members.find(
        (m) => String(m.id) === el.dataset.id
      );
      const team = ctx.state.teams.find(
        (t) => String(t.id) === ctx.state.teamRosterId
      );
      if (!member || !team) return true;

      const current =
        (member.teams || []).find((t) => String(t.id) === String(team.id))
          ?.position || '';
      const positions = {
        '5': ['GK', 'FIXO', 'ALA', 'PIVOT'],
        '7': ['GK', 'CB', 'LB', 'RB', 'CDM', 'CM', 'CAM', 'LM', 'RM', 'ST'],
        '11': [
          'GK',
          'CB',
          'LB',
          'RB',
          'CDM',
          'CM',
          'CAM',
          'LM',
          'RM',
          'LW',
          'RW',
          'ST',
          'CF',
        ],
      };
      const choices = (positions[String(team.format)] || []).map((v) => [v, v]);
      const legacy = current && !choices.some(([id]) => id === current);

      return ctx.dialog(
        'Vị trí của đội',
        `${ctx.e(member.full_name)} · ${ctx.e(team.name)} · Sân ${ctx.e(team.format)}${legacy ? ` · Vị trí cũ ${ctx.e(current)} không còn phù hợp, hãy chọn lại.` : ''}`,
        ctx.select(
          'position',
          'Vị trí',
          [['', 'Chưa chọn'], ...choices],
          legacy ? '' : current
        ),
        (form) =>
          ctx.submit(form, 'team-position', async (data) => {
            await ctx.api.patch(
              ctx.base(`/teams/${team.id}/players/${member.id}/position`),
              { position: data.position || null }
            );
            await ctx.loadView();
            ctx.toast('Đã cập nhật vị trí.');
          })
      );
    }

    if (a === 'edit-team-jersey' && ctx.canManageRoster(ctx.currentRole())) {
      const member = ctx.state.members.find(
        (m) => String(m.id) === el.dataset.id
      );
      const team = ctx.state.teams.find(
        (t) => String(t.id) === ctx.state.teamRosterId
      );
      if (!member || !team) return true;

      const jersey = (member.teams || []).find(
        (t) => String(t.id) === String(team.id)
      )?.jersey_number;

      return ctx.dialog(
        'Số áo của đội',
        `${ctx.e(member.full_name)} · ${ctx.e(team.name)}. Để trống nếu chưa chọn.`,
        ctx.field('jersey_number', 'Số áo', jersey ?? '', 'number'),
        (form) =>
          ctx.submit(form, 'jersey', async (data) => {
            await ctx.api.patch(
              ctx.base(`/teams/${team.id}/players/${member.id}/jersey`),
              {
                jersey_number:
                  data.jersey_number === '' ? null : data.jersey_number,
              }
            );
            await ctx.loadView();
            ctx.toast('Đã cập nhật số áo.');
          })
      );
    }

    if (a === 'remove-team-player' && ctx.canManageRoster(ctx.currentRole())) {
      const member = ctx.state.members.find(
        (m) => String(m.id) === el.dataset.id
      );
      const team = ctx.state.teams.find(
        (t) => String(t.id) === ctx.state.teamRosterId
      );
      if (!member || !team) return true;

      return ctx.dialog(
        'Xóa khỏi đội bóng?',
        `${ctx.e(member.full_name)} sẽ rời ${ctx.e(team.name)} nhưng hồ sơ vẫn còn trong CLB và các đội khác. Số áo và vị trí ở đội này sẽ bị xóa.`,
        '',
        (form) =>
          ctx.submit(
            form,
            'remove-player',
            async () => {
              await ctx.api.delete(
                ctx.base(`/teams/${team.id}/players/${member.id}`)
              );
              if (
                ctx.state.members.length === 1 &&
                ctx.state.teamRosterPage > 1
              ) {
                ctx.state.teamRosterPage--;
              }
              await ctx.loadView();
              ctx.toast('Đã xóa thành viên khỏi đội.');
            },
            'Xóa khỏi đội'
          )
      );
    }

    if (a === 'import-members' && ctx.canManageRoster(ctx.currentRole())) {
      let pendingImport;
      const info = `<div class="lineup-editor"><p>Chỉ dùng file .xlsx theo mẫu, tối đa 500 dòng và 5 MB. Cột <strong>full_name</strong> bắt buộc; email không được trùng; ngày sinh theo dd/mm/yyyy. Số điện thoại đặt dạng Text. Không đổi thứ tự cột hoặc dùng công thức.</p><p>Tải mẫu để xem đầy đủ vị trí, chân thuận và trạng thái hợp lệ. Sau khi nhập, hãy chọn thành viên vào đội và đặt số áo tại đội.</p><button type="button" class="button secondary" data-download-template>Tải mẫu Excel</button><div class="field"><label for="member-file">File thành viên (.xlsx)</label><input id="member-file" type="file" name="member_file" accept=".xlsx" required></div></div>`;

      const modal = ctx.dialog(
        'Nhập thành viên từ Excel',
        'Kiểm tra dữ liệu trước khi nhập; nếu có lỗi, không dòng nào được lưu.',
        info,
        (form) =>
          ctx.submit(
            form,
            'member-import',
            async () => {
              const rows = await parseMembers(
                form.elements.member_file.files[0]
              );
              try {
                const result = await ctx.api.post(
                  ctx.base('/members/import/preview'),
                  { players: rows }
                );
                pendingImport = { rows, preview: result.data };
              } catch (error) {
                const messages = Object.entries(error.errors || {}).map(
                  ([key, value]) => {
                    const m = /^players\.(\d+)\.(.+)$/.exec(key);
                    return m
                      ? `Dòng ${rows.sourceRows[Number(m[1])]}, ${m[2]}: ${Array.isArray(value) ? value[0] : value}`
                      : `${key}: ${Array.isArray(value) ? value[0] : value}`;
                  }
                );
                throw new Error(
                  messages.length ? messages.join(' | ') : error.message
                );
              }
            },
            'Kiểm tra file'
          )
      );

      modal
        .querySelector('[data-download-template]')
        .addEventListener('click', () =>
          downloadMemberTemplate().catch((error) =>
            ctx.toast(error.message, true)
          )
        );

      modal.addEventListener(
        'close',
        () => {
          if (pendingImport) {
            reviewImport({
              ...pendingImport,
              api: ctx.api,
              base: ctx.base,
              reload: ctx.loadView,
            });
          }
        },
        { once: true }
      );
      return;
    }

    if (a === 'export-members') {
      const q = new URLSearchParams(
        ctx.state.route === 'team-roster'
          ? { team_id: ctx.state.teamRosterId, per_page: '1000' }
          : { per_page: '1000' }
      );
      const rows = ctx.unpackList(
        await ctx.api.get(ctx.base(`/members?${q}`))
      ).rows;
      await exportMembers(rows, {
        team: ctx.state.teams.find(
          (t) => String(t.id) === ctx.state.teamRosterId
        ),
      });
      ctx.toast('Đã xuất danh sách thành viên.');
      return true;
    }

    if (a === 'roster-prev' || a === 'roster-next') {
      ctx.state.teamRosterPage += a === 'roster-next' ? 1 : -1;
      await ctx.loadView();
      return true;
    }

    return false;
  }

  return {
    editMember,
    editTeam,
    renameTeam,
    invite,
    handleAction,
  };
}
