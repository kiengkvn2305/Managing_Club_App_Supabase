import { openLineup, openCaptain } from '../lineups.js';
import {
  downloadMemberTemplate,
  parseMembers,
  exportMembers,
} from '../spreadsheets.js';
import { reviewImport } from '../import-review.js';
import { avatar, imageUrl } from '../images.js';
import { currentAcademicYear, TITLE_PRESETS, footLabel as formatFootLabel, statusLabel, matchesSearch, isCoOwnerOrOwner, formatMonth } from '../utils.js';

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
        ['active', 'inactive', 'injured', 'graduated'].map((x) => [
          x,
          {
            active: 'Đang hoạt động',
            inactive: 'Tạm ngưng',
            injured: 'Chấn thương',
            graduated: 'Đã ra trường',
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

    const initialManagerIds = new Set((team.managers || []).map((x) => String(x.id)));

    // Partition: pre-selected managers at the top on open!
    const selectedCandidates = candidates.filter((m) => initialManagerIds.has(String(m.id)));
    const unselectedCandidates = candidates.filter((m) => !initialManagerIds.has(String(m.id)));
    selectedCandidates.sort((a, b) => ctx.compareVietnameseNames(a.name || a.full_name, b.name || b.full_name));
    unselectedCandidates.sort((a, b) => ctx.compareVietnameseNames(a.name || a.full_name, b.name || b.full_name));
    const orderedCandidates = [...selectedCandidates, ...unselectedCandidates];

    const footLabel = (f) =>
      ({ right: 'Chân phải', left: 'Chân trái', both: 'Hai chân' })[f] || (f ? String(f) : '');

    const sortOptions = `
      <div style="display:grid;grid-template-columns:1fr auto;gap:8px;align-items:center;margin-bottom:8px;">
        <input type="search" data-mgr-search placeholder="Tìm người quản lý theo tên, ghi chú..." style="margin:0;">
        <select data-mgr-sort style="margin:0;">
          <option value="name_asc">Tên A–Z</option>
          <option value="name_desc">Tên Z–A</option>
          <option value="notes">Theo ghi chú</option>
          <option value="foot">Theo chân thuận</option>
        </select>
      </div>
    `;

    const managerRows = orderedCandidates.map((m) => {
      const isChecked = initialManagerIds.has(String(m.id));
      const displayName = m.name || m.full_name || `Thành viên #${m.id}`;
      const details = [
        m.title ? `Chức danh: ${m.title}` : '',
        m.role ? `Vai trò: ${ctx.roleLabel(m.role)}` : '',
        m.date_of_birth ? `NS: ${ctx.formatDate(m.date_of_birth)}` : '',
        m.preferred_foot ? footLabel(m.preferred_foot) : '',
        m.notes ? `Ghi chú: ${m.notes}` : '',
        m.email || '',
      ].filter(Boolean).join(' · ');

      const searchBlob = [displayName, m.email, m.title, m.notes, m.preferred_foot, m.date_of_birth, m.date_of_birth ? ctx.formatDate(m.date_of_birth) : ''].filter(Boolean).join(' ');

      return `
        <label data-mgr-row
          data-id="${ctx.e(m.id)}"
          data-full-name="${ctx.e(displayName)}"
          data-notes="${ctx.e(m.notes || '')}"
          data-foot="${ctx.e(m.preferred_foot || '')}"
          data-search="${ctx.e(searchBlob)}"
          class="picker-card-row"
        >
          <input type="checkbox" name="manager_ids" value="${ctx.e(m.id)}" ${isChecked ? 'checked' : ''}>
          <span style="flex:1;min-width:0;">
            <strong>${ctx.e(displayName)}</strong>
            <small style="display:block;color:var(--muted);">${ctx.e(details || 'Thành viên CLB')}</small>
          </span>
        </label>
      `;
    }).join('') || '<p>Chưa có tài khoản thành viên.</p>';

    const managerFields = `
      <fieldset class="field" style="grid-column:1/-1;">
        <legend>Người quản lý đội (Có thể chọn nhiều người từ bất kỳ thành viên nào trong CLB)</legend>
        ${sortOptions}
        <div data-mgr-list class="member-picker-list" style="max-height:220px;">
          ${managerRows}
        </div>
      </fieldset>
    `;

    const today = ctx.vietnamCalendarDate();
    const month = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
    const duesInfo = team.monthly_dues
      ? `<p>Mức quỹ gần nhất: ${ctx.e(Number(team.monthly_dues.amount).toLocaleString('vi-VN'))} đ/tháng, từ ${ctx.e(formatMonth(team.monthly_dues.effective_month))}.</p>`
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

    const modal = ctx.dialog(
      'Chỉnh sửa đội bóng',
      'Người quản lý đội có thể là bất kỳ thành viên nào trong CLB (được chọn nhiều người quản lý). Mức quỹ mới áp dụng sớm nhất trong tháng này nếu chỉnh trước ngày 3; từ ngày 3 áp dụng sớm nhất tháng sau.',
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
          ctx.toast('Đã cập nhật thông tin đội bóng.');
        })
    );

    const mgrList = modal.querySelector('[data-mgr-list]');
    const mgrSearch = modal.querySelector('[data-mgr-search]');
    const mgrSort = modal.querySelector('[data-mgr-sort]');

    const filterMgrs = (shouldSort = false) => {
      const q = (mgrSearch.value || '').trim();
      const sortVal = mgrSort.value;
      const rows = [...mgrList.querySelectorAll('[data-mgr-row]')];
      rows.forEach((row) => {
        row.hidden = Boolean(q && !matchesSearch(row.dataset.search, q));
      });
      if (shouldSort) {
        rows.sort((a, b) => {
          if (sortVal === 'name_asc') return ctx.compareVietnameseNames(a.dataset.fullName, b.dataset.fullName);
          if (sortVal === 'name_desc') return -1 * ctx.compareVietnameseNames(a.dataset.fullName, b.dataset.fullName);
          if (sortVal === 'notes') return (b.dataset.notes ? 1 : 0) - (a.dataset.notes ? 1 : 0) || ctx.compareVietnameseNames(a.dataset.fullName, b.dataset.fullName);
          if (sortVal === 'foot') return (a.dataset.foot || '').localeCompare(b.dataset.foot || '') || ctx.compareVietnameseNames(a.dataset.fullName, b.dataset.fullName);
          return 0;
        });
        rows.forEach((r) => mgrList.append(r));
      }
    };

    mgrSearch.addEventListener('input', () => filterMgrs(false));
    mgrSort.addEventListener('change', () => filterMgrs(true));

    return modal;
  }

  function invite() {
    const club = ctx.currentClub();
    if (!club) {
      ctx.toast('Vui lòng chọn hoặc tạo câu lạc bộ trước khi tạo mã mời.', true);
      return false;
    }

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

    let created;
    const titleOptions = [
      ['Thành viên', 'Thành viên (Mặc định)'],
      ['Phó chủ nhiệm CLB', 'Phó chủ nhiệm CLB (Đầy đủ quyền)'],
      ['Thủ quỹ', 'Thủ quỹ (Sổ thu chi & Đóng quỹ)'],
      ['Truyền thông', 'Truyền thông (Hoạt động CLB)'],
      ['Đối ngoại', 'Đối ngoại (Hoạt động CLB)'],
      ['Trưởng ban chuyên môn / HLV', 'Trưởng ban chuyên môn / HLV'],
      ['Phụ trách hậu cần / Trang thiết bị', 'Phụ trách hậu cần / Trang thiết bị'],
      ['Ủy viên BCN / Cán sự', 'Ủy viên BCN / Cán sự'],
      ['__custom__', 'Chức danh khác (Tự nhập)...'],
    ];

    const fields =
      `<div class="form-notice" style="margin-bottom:1rem;padding:0.75rem 1rem;background:var(--accent-surface,#f0f7ff);border:1px solid var(--accent-border,#cce4ff);border-radius:8px;font-size:0.9rem;">
        <strong>💡 Mẹo test phân quyền:</strong> Bạn có thể <em>để trống ô Email</em> để tạo <strong>Mã mời dùng chung</strong>. Bất kỳ tài khoản nào nhập mã mời này đều sẽ nhận đúng chức vụ và quyền hạn đã chọn để bạn test ngay lập tức!
      </div>` +
      ctx.field('email', 'Email người nhận (Không bắt buộc nếu tạo mã test)', '', 'email') +
      ctx.select('title_choice', 'Chức vụ dự kiến trao', titleOptions, 'Thành viên') +
      `<div id="f-invite-custom-title-wrap" style="display:none;">${ctx.field('custom_title', 'Tên chức danh tùy chỉnh', '', 'text')}</div>` +
      `<fieldset class="field" style="margin-top:1rem;border:1px solid var(--border);padding:1rem;border-radius:8px;">
        <legend style="font-weight:600;padding:0 0.5rem;">Cấp quyền hạn chi tiết (Tự động tick theo chức vụ)</legend>
        <div id="invite-preset-hint" style="margin-bottom:0.75rem;font-size:0.85rem;color:var(--muted);">Chọn chức vụ ở trên để tự động tick quyền mẫu, hoặc tùy chỉnh bên dưới:</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(220px, 1fr));gap:0.5rem;">
          <label><input type="checkbox" name="can_view_finance"> <strong>Xem sổ thu chi</strong><br><small class="muted">Xem giao dịch, quỹ và số dư</small></label>
          <label><input type="checkbox" name="can_manage_finance"> <strong>Quản lý thu chi & quỹ</strong><br><small class="muted">Tạo giao dịch, thu quỹ, sửa quỹ</small></label>
          <label><input type="checkbox" name="can_manage_roster"> <strong>Quản lý thành viên & đội</strong><br><small class="muted">Thêm/sửa thành viên, xếp đội bóng</small></label>
          <label><input type="checkbox" name="can_manage_inventory"> <strong>Quản lý kho trang bị</strong><br><small class="muted">Nhập/xuất, bàn giao thiết bị</small></label>
          <label><input type="checkbox" name="can_manage_activities"> <strong>Quản lý hoạt động CLB</strong><br><small class="muted">Dịp lễ, sinh nhật, khen thưởng</small></label>
          <label><input type="checkbox" name="can_manage_attendance"> <strong>Quản lý điểm danh</strong><br><small class="muted">Tạo lịch tập, bấm điểm danh</small></label>
          <label><input type="checkbox" name="can_manage_club"> <strong>Quản trị thông tin CLB</strong><br><small class="muted">Đổi thông tin CLB, ảnh đại diện và ảnh nền</small></label>
        </div>
      </fieldset>`;

    const el = ctx.dialog(
      'Mời tham gia câu lạc bộ & Phân quyền',
      'Tạo mã mời và cấp quyền hạn cho thành viên mới.',
      fields,
      (form) =>
        ctx.submit(form, 'invitation', async (data) => {
          const titleChoice = form.querySelector('[name="title_choice"]')?.value || 'Thành viên';
          const title =
            titleChoice === '__custom__'
              ? (form.querySelector('[name="custom_title"]')?.value || 'Thành viên').trim()
              : titleChoice;
          const permissions = {
            can_view_finance: Boolean(form.elements.can_view_finance?.checked),
            can_manage_finance: Boolean(form.elements.can_manage_finance?.checked),
            can_manage_roster: Boolean(form.elements.can_manage_roster?.checked),
            can_manage_inventory: Boolean(form.elements.can_manage_inventory?.checked),
            can_manage_activities: Boolean(form.elements.can_manage_activities?.checked),
            can_manage_attendance: Boolean(form.elements.can_manage_attendance?.checked),
            can_manage_club: Boolean(form.elements.can_manage_club?.checked),
          };
          let role = 'member';
          if (titleChoice === 'Phó chủ nhiệm CLB') role = 'co_owner';
          else if (titleChoice === 'Thủ quỹ') role = 'treasurer';
          else if (titleChoice === 'Trưởng ban chuyên môn / HLV') role = 'sporting_manager';
          else if (titleChoice === 'Phụ trách hậu cần / Trang thiết bị') role = 'equipment_manager';

          created = (
            await ctx.api.post(ctx.base('/invitations'), {
              email: data.email ? String(data.email).trim().toLowerCase() : null,
              role,
              title,
              permissions,
            })
          ).data;
        }),
      'Tạo mã mời'
    );

    const titleSelect = el.querySelector('[name="title_choice"]');
    const customWrap = el.querySelector('#f-invite-custom-title-wrap');
    const hintMsg = el.querySelector('#invite-preset-hint');

    titleSelect?.addEventListener('change', () => {
      const val = titleSelect.value;
      if (customWrap) customWrap.style.display = val === '__custom__' ? 'block' : 'none';
      if (TITLE_PRESETS[val]) {
        const p = TITLE_PRESETS[val];
        Object.keys(p).forEach((k) => {
          const cb = el.querySelector(`[name="${k}"]`);
          if (cb) cb.checked = p[k];
        });
        if (hintMsg) {
          hintMsg.textContent = `✓ Đã tự động áp dụng các quyền mẫu của "${val}". Bạn có thể điều chỉnh thêm bên dưới.`;
        }
      }
    });

    el.addEventListener(
      'close',
      () => {
        if (!created) return;
        const code = created.invite_code || created.token;
        const link = `${location.origin}${location.pathname}#accept?token=${encodeURIComponent(code)}`;
        const permsList = Object.entries(created.permissions || {})
          .filter(([, v]) => v)
          .map(([k]) => {
            const labels = {
              can_view_finance: 'Xem thu chi',
              can_manage_finance: 'Quản lý thu chi & quỹ',
              can_manage_roster: 'Quản lý thành viên & đội',
              can_manage_inventory: 'Quản lý kho trang bị',
              can_manage_activities: 'Quản lý hoạt động',
              can_manage_attendance: 'Quản lý điểm danh',
              can_manage_club: 'Quản trị CLB',
            };
            return labels[k] || k;
          });

        const resultHtml = `
          <div style="text-align:center;padding:1rem 0;">
            <div style="font-size:0.85rem;color:var(--muted);text-transform:uppercase;letter-spacing:1px;margin-bottom:0.5rem;">MÃ MỜI THAM GIA CLB</div>
            <div style="font-size:2rem;font-weight:700;letter-spacing:2px;color:var(--primary,#0066cc);padding:0.75rem;background:var(--surface,#f5f5f5);border:2px dashed var(--border,#ccc);border-radius:8px;user-select:all;margin-bottom:1rem;">
              ${ctx.e(code)}
            </div>
            <p style="margin-bottom:1rem;color:var(--text);">Chức vụ: <strong>${ctx.e(created.title || 'Thành viên')}</strong>${permsList.length ? `<br><small class="muted">Quyền được cấp: ${ctx.e(permsList.join(', '))}</small>` : ''}</p>
            <div class="field" style="text-align:left;margin-bottom:1rem;">
              <label>Liên kết nhận lời mời trực tiếp:</label>
              <input type="text" readonly value="${ctx.e(link)}" style="width:100%;" onclick="this.select()">
            </div>
            <div style="display:flex;gap:0.5rem;justify-content:center;flex-wrap:wrap;">
              <button type="button" class="button" data-copy-val="${ctx.e(code)}">Sao chép mã mời</button>
              <button type="button" class="button secondary" data-copy-val="${ctx.e(link)}">Sao chép liên kết</button>
            </div>
            <p style="margin-top:1.25rem;font-size:0.85rem;color:var(--muted);background:var(--accent-surface,#f0f7ff);padding:0.75rem;border-radius:6px;">
              💡 <strong>Cách test phân quyền:</strong> Mở trình duyệt ẩn danh (Incognito) hoặc đăng nhập tài khoản khác, vào mục <strong>"Nhập mã tham gia" (#accept)</strong> và dán mã <strong>${ctx.e(code)}</strong> vào là xong!
            </p>
          </div>
        `;
        const resultModal = ctx.dialog(
          'Mã mời đã sẵn sàng!',
          'Chia sẻ mã mời hoặc liên kết này cho người nhận.',
          resultHtml,
          async () => true,
          'Hoàn tất'
        );
        resultModal.querySelectorAll('[data-copy-val]').forEach((btn) => {
          btn.addEventListener('click', async () => {
            try {
              if (navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(btn.dataset.copyVal);
              } else {
                throw new Error('No clipboard API');
              }
            } catch {
              const temp = document.createElement('textarea');
              temp.value = btn.dataset.copyVal;
              temp.style.position = 'fixed';
              temp.style.opacity = '0';
              document.body.appendChild(temp);
              temp.select();
              document.execCommand('copy');
              temp.remove();
            }
            const orig = btn.textContent;
            btn.textContent = '✓ Đã sao chép!';
            setTimeout(() => (btn.textContent = orig), 2000);
          });
        });
        ctx.loadView();
      },
      { once: true }
    );

    return el;
  }

  async function handleAction(a, el) {
    if (a === 'new-member') {
      if (!ctx.requirePermission(ctx.canManageRoster(), 'Thêm thành viên')) return true;
      return editMember();
    }

    if (a === 'edit-member') {
      if (!ctx.requirePermission(ctx.canManageRoster(), 'Sửa hồ sơ thành viên')) return true;
      const m = ctx.state.members.find((x) => String(x.id) === el.dataset.id);
      if (m) return editMember(m);
    }

    if (a === 'delete-member') {
      if (!ctx.requirePermission(ctx.canManageRoster(), 'Xóa hồ sơ thành viên')) return true;
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
        ['Chân thuận', formatFootLabel(m.preferred_foot)],
        ['Trạng thái', statusLabel(m.status)],
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
      const canManage = ctx.canManageRoster();
      const removeButton =
        ctx.state.route === 'team-roster' && canManage
          ? '<div class="lineup-editor"><button type="button" class="button secondary" data-remove-from-team>Xóa khỏi đội bóng</button></div>'
          : '';
      const modal = ctx.dialog(
        'Hồ sơ thành viên',
        'Thông tin và các đội bóng trong câu lạc bộ.',
        `<div class="lineup-editor profile-image-actions">${avatar(m.full_name, imageUrl('player', m.id, m.avatar_version, ctx.state.clubId))}${canManage ? '<button type="button" class="button secondary" data-change-player-image>Đổi ảnh đại diện</button>' : ''}</div><dl class="details lineup-editor">${details.map(([label, value]) => `<div><dt>${ctx.e(label)}</dt><dd>${ctx.e(value ?? 'Chưa cập nhật')}</dd></div>`).join('')}</dl>${removeButton}`,
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

    if (a === 'invite' || a === 'invite-member') {
      const allowed =
        ctx.currentRole() === 'owner' ||
        ctx.currentClub()?.is_system_admin ||
        ctx.state.user?.is_system_admin ||
        ctx.canManageClub() ||
        ctx.canManageRoster();
      if (!ctx.requirePermission(allowed, 'Mời thành viên')) return true;
      invite();
      return true;
    }

    if (a === 'new-team') {
      if (!ctx.requirePermission(ctx.canManageRoster(), 'Tạo đội bóng')) return true;
      return editTeam();
    }

    if (a === 'rename-team') {
      if (!ctx.requirePermission(ctx.canManageRoster(), 'Chỉnh sửa đội bóng')) return true;
      const team = ctx.state.teams.find((t) => String(t.id) === el.dataset.id);
      if (team) return renameTeam(team);
    }

    if (a === 'delete-team') {
      if (!ctx.requirePermission(ctx.canManageRoster(), 'Xóa đội bóng')) return true;
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

    if (a === 'edit-title') {
      const isPrivileged = ctx.currentRole() === 'owner' || ctx.currentClub()?.is_system_admin || ctx.canManageClub();
      if (!ctx.requirePermission(isPrivileged, 'Sửa vai trò thành viên')) return true;
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

    if (a === 'edit-permissions') {
      const canEditPerms = isCoOwnerOrOwner(ctx.currentClub());
      if (!ctx.requirePermission(canEditPerms, 'Phân quyền thành viên')) return true;
      const member = (ctx.state.clubMemberships || []).find(
        (m) => String(m.id) === el.dataset.id
      );
      if (!member) return true;
      const perms = member.permissions || {};
      const currentTitle = member.title || (member.role === 'owner' ? 'Chủ nhiệm CLB' : 'Thành viên');

      const presetTitles = [
        'Phó chủ nhiệm CLB',
        'Thủ quỹ',
        'Truyền thông',
        'Đối ngoại',
        'Trưởng ban chuyên môn / HLV',
        'Phụ trách hậu cần / Trang thiết bị',
        'Ủy viên BCN / Cán sự',
        'Thành viên',
      ];

      const isKnownTitle = presetTitles.includes(currentTitle);

      const titleSelectHtml = `
        <div class="field" style="grid-column:1/-1;">
          <label for="f-perm-title">Chức vụ / Vai trò</label>
          <select id="f-perm-title" name="title_choice">
            ${presetTitles.map((t) => `<option value="${ctx.e(t)}" ${t === currentTitle ? 'selected' : ''}>${ctx.e(t)}</option>`).join('')}
            <option value="__custom__" ${!isKnownTitle && currentTitle ? 'selected' : ''}>Chức danh khác (tự nhập)…</option>
          </select>
          <div id="f-perm-custom-wrap" class="field" style="margin-top:8px;${isKnownTitle || !currentTitle ? 'display:none;' : ''}">
            <label for="f-perm-custom-title">Tên chức danh khác</label>
            <input id="f-perm-custom-title" name="custom_title" type="text" value="${ctx.e(!isKnownTitle ? currentTitle : '')}" placeholder="Nhập tên chức danh...">
          </div>
          <small id="preset-hint-msg" style="color:var(--primary);display:block;margin-top:6px;">Khi chọn chức vụ, các quyền mẫu sẽ được tự động chọn. Bạn có thể tự do tick/bỏ tick để điều chỉnh.</small>
        </div>
      `;

      const permFields = `
        ${titleSelectHtml}
        <fieldset class="field" style="grid-column:1/-1;">
          <legend>Quyền hạn tài khoản của ${ctx.e(member.name)}</legend>
          <div style="display:grid;gap:10px;margin-top:8px;">
            <label style="display:flex;align-items:center;gap:10px;cursor:pointer;">
              <input type="checkbox" name="can_view_finance" ${perms.can_view_finance ? 'checked' : ''}>
              <span><strong>Xem quỹ & thu chi</strong> <small style="display:block;color:var(--muted);">Xem số dư quỹ, các khoản thu chi và báo cáo tài chính</small></span>
            </label>
            <label style="display:flex;align-items:center;gap:10px;cursor:pointer;">
              <input type="checkbox" name="can_manage_finance" ${perms.can_manage_finance ? 'checked' : ''}>
              <span><strong>Quản lý & ghi sổ thu chi</strong> <small style="display:block;color:var(--muted);">Ghi nhận khoản thu chi, sửa mức quỹ đội bóng và quỹ BCN</small></span>
            </label>
            <label style="display:flex;align-items:center;gap:10px;cursor:pointer;">
              <input type="checkbox" name="can_manage_roster" ${perms.can_manage_roster ? 'checked' : ''}>
              <span><strong>Quản lý nhân sự & đội bóng</strong> <small style="display:block;color:var(--muted);">Thêm/sửa/xóa hồ sơ thành viên, đội bóng, xếp cầu thủ và đội hình</small></span>
            </label>
            <label style="display:flex;align-items:center;gap:10px;cursor:pointer;">
              <input type="checkbox" name="can_manage_inventory" ${perms.can_manage_inventory ? 'checked' : ''}>
              <span><strong>Quản lý kho tài sản & trang bị</strong> <small style="display:block;color:var(--muted);">Thêm đồ dùng, ghi nhận nhập/xuất kho và gán đồ cho thành viên</small></span>
            </label>
            <label style="display:flex;align-items:center;gap:10px;cursor:pointer;">
              <input type="checkbox" name="can_manage_activities" ${perms.can_manage_activities ? 'checked' : ''}>
              <span><strong>Quản lý hoạt động & sự kiện</strong> <small style="display:block;color:var(--muted);">Tạo và quản lý dịp lễ, sinh nhật và khen thưởng CLB</small></span>
            </label>
            <label style="display:flex;align-items:center;gap:10px;cursor:pointer;">
              <input type="checkbox" name="can_manage_attendance" ${perms.can_manage_attendance ? 'checked' : ''}>
              <span><strong>Quản lý điểm danh & lịch tập</strong> <small style="display:block;color:var(--muted);">Tạo lịch tập, bấm điểm danh buổi tập và theo dõi chuyên cần</small></span>
            </label>
            <label style="display:flex;align-items:center;gap:10px;cursor:pointer;">
              <input type="checkbox" name="can_manage_club" ${perms.can_manage_club ? 'checked' : ''}>
              <span><strong>Quản lý thông tin CLB & cài đặt</strong> <small style="display:block;color:var(--muted);">Sửa thông tin CLB, ảnh đại diện/ảnh nền và bài tuyển quân</small></span>
            </label>
          </div>
        </fieldset>
      `;

      const modal = ctx.dialog(
        'Phân quyền & Chức vụ',
        `Thiết lập chức vụ và quyền hạn cho ${ctx.e(member.name)} (${ctx.e(member.email)}).`,
        permFields,
        (form) =>
          ctx.submit(form, 'member-permissions', async () => {
            const titleChoice = form.elements.title_choice.value;
            const chosenTitle = (titleChoice === '__custom__'
              ? form.elements.custom_title?.value
              : titleChoice)?.trim() || 'Thành viên';

            await ctx.api.patch(ctx.base(`/club-memberships/${member.id}`), {
              title: chosenTitle,
            });

            const updatedPerms = {
              can_view_finance: form.elements.can_view_finance.checked,
              can_manage_finance: form.elements.can_manage_finance.checked,
              can_manage_roster: form.elements.can_manage_roster.checked,
              can_manage_inventory: form.elements.can_manage_inventory.checked,
              can_manage_activities: form.elements.can_manage_activities.checked,
              can_manage_attendance: form.elements.can_manage_attendance.checked,
              can_manage_club: form.elements.can_manage_club.checked,
            };
            await ctx.api.patch(
              ctx.base(`/club-memberships/${member.id}/permissions`),
              { permissions: updatedPerms }
            );
            await ctx.loadApp();
            await ctx.loadView();
            ctx.toast(`Đã cập nhật chức vụ và quyền hạn cho ${member.name}.`);
          }),
        'Lưu phân quyền'
      );

      const titleSelect = modal.querySelector('[name="title_choice"]');
      const customWrap = modal.querySelector('#f-perm-custom-wrap');
      const hintMsg = modal.querySelector('#preset-hint-msg');

      titleSelect.addEventListener('change', () => {
        const val = titleSelect.value;
        customWrap.style.display = val === '__custom__' ? 'block' : 'none';
        if (TITLE_PRESETS[val]) {
          const p = TITLE_PRESETS[val];
          Object.keys(p).forEach((k) => {
            const cb = modal.querySelector(`[name="${k}"]`);
            if (cb) cb.checked = p[k];
          });
          hintMsg.textContent = `✓ Đã tự động áp dụng các quyền mẫu của "${val}". Bạn có thể tick/bỏ tick để điều chỉnh thêm.`;
        }
      });

      return modal;
    }

    if (a === 'transfer-ownership') {
      const isOwner = ctx.currentRole() === 'owner' || ctx.currentClub()?.is_system_admin;
      if (!ctx.requirePermission(isOwner, 'Chuyển giao quyền Chủ nhiệm')) return true;
      const targetUserId = el.dataset.id;
      const targetName = el.dataset.name || 'thành viên này';

      const warningNotice = `
        <div class="lineup-editor" style="grid-column:1/-1;">
          <p class="notice danger-notice">
            <strong>CẢNH BÁO NGUY HIỂM:</strong> Khi bạn chuyển giao quyền Chủ nhiệm cho <strong>${ctx.e(targetName)}</strong>, bạn sẽ trở thành thành viên thông thường và <strong>MẤT TOÀN BỘ QUYỀN HẠN CỦA CHỦ NHIỆM CLB</strong>. Quyền lực tối cao sẽ được chuyển giao hoàn toàn cho người nhận.
          </p>
          <div class="field" style="margin-top:12px;">
            <label for="f-confirm-transfer">Nhập chữ <strong>XÁC NHẬN</strong> để đồng ý chuyển giao quyền:</label>
            <input id="f-confirm-transfer" name="confirm_text" type="text" required placeholder="XÁC NHẬN" autocomplete="off">
          </div>
        </div>
      `;

      return ctx.dialog(
        'Chuyển giao quyền Chủ nhiệm CLB',
        `Trao quyền Chủ nhiệm CLB cho ${ctx.e(targetName)}.`,
        warningNotice,
        (form) =>
          ctx.submit(form, 'transfer-ownership', async (data) => {
            if (data.confirm_text !== 'XÁC NHẬN') {
              throw new Error('Vui lòng nhập chính xác chữ "XÁC NHẬN" để xác nhận thao tác.');
            }
            await ctx.api.post(ctx.base('/transfer-ownership'), {
              new_owner_user_id: targetUserId,
              my_new_role: 'member',
            });
            await ctx.loadApp();
            await ctx.loadView();
            ctx.toast(`Đã chuyển giao quyền Chủ nhiệm CLB cho ${targetName}. Bạn hiện là thành viên thường.`);
          }),
        'Xác nhận chuyển quyền'
      );
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

    if (a === 'team-captain') {
      if (!ctx.requirePermission(ctx.canManageRoster(), 'Chọn đội trưởng')) return true;
      const targetTeamId = el.dataset.id || ctx.state.teamRosterId;
      const team = ctx.state.teams.find((t) => String(t.id) === String(targetTeamId));
      if (team) {
        const players = ctx.unpackList(
          await ctx.api.get(ctx.base(`/members?team_id=${encodeURIComponent(team.id)}&per_page=1000`))
        ).rows;
        return openCaptain({
          team,
          players,
          api: ctx.api,
          base: ctx.base,
          reload: ctx.loadView,
          canManage: ctx.canManageRoster(),
        });
      }
    }

    if (a === 'select-team-players') {
      if (!ctx.requirePermission(ctx.canManageRoster(), 'Chọn thành viên vào đội')) return true;
      const targetTeamId = el.dataset.id || ctx.state.teamRosterId;
      const team = ctx.state.teams.find((t) => String(t.id) === String(targetTeamId));
      if (!team) return true;

      const players = ctx.unpackList(
        await ctx.api.get(ctx.base('/members?per_page=1000'))
      ).rows;

      if (!players || players.length === 0) {
        ctx.toast('Câu lạc bộ chưa có hồ sơ thành viên nào. Vui lòng thêm hồ sơ thành viên vào CLB trước khi xếp đội.', true);
        return true;
      }

      const initialSelected = players
        .filter((p) => (p.teams || []).some((t) => String(t.id) === String(team.id)))
        .map((p) => p.id);

      return ctx.openMemberPickerModal({
        title: `Chọn thành viên vào đội ${team.name}`,
        description: `Sân ${team.format} người · Tích chọn các thành viên thuộc đội bóng này.`,
        items: players,
        initialSelectedIds: initialSelected,
        multi: true,
        name: 'player_ids',
        onSubmit: async (selectedIds) => {
          await ctx.api.patch(ctx.base(`/teams/${team.id}/players`), {
            player_ids: selectedIds.map(Number),
          });
          await ctx.loadView();
          ctx.toast(`Đã cập nhật ${selectedIds.length} thành viên cho đội ${team.name}.`);
          return true;
        },
        submitLabel: 'Lưu danh sách đội',
      });
    }

    if (a === 'set-team-captain') {
      if (!ctx.requirePermission(ctx.canManageRoster(), 'Chọn đội trưởng')) return true;
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

    if (a === 'edit-team-position') {
      if (!ctx.requirePermission(ctx.canManageRoster(), 'Sửa vị trí cầu thủ')) return true;
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

    if (a === 'edit-team-jersey') {
      if (!ctx.requirePermission(ctx.canManageRoster(), 'Sửa số áo cầu thủ')) return true;
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

    if (a === 'remove-team-player') {
      if (!ctx.requirePermission(ctx.canManageRoster(), 'Xóa khỏi đội')) return true;
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

    if (a === 'import-members') {
      if (!ctx.requirePermission(ctx.canManageRoster(), 'Nhập thành viên từ Excel')) return true;
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
      await exportMembers(
        rows,
        ctx.state.teamRosterId || '',
        ctx.currentClub()
      );
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
