import { setupImageCropper } from '../image-crop.js';
import { imageUrl } from '../images.js';

export function createClubController(ctx) {
  function editClub(edit = false) {
    const c = edit ? ctx.currentClub() : {};
    const fields =
      ctx.field('name', 'Tên câu lạc bộ', c.name, 'text', true) +
      ctx.field('city', 'Thành phố', c.city) +
      ctx.field('home_ground', 'Sân nhà', c.home_ground) +
      ctx.field('activity_start_date', 'Ngày bắt đầu hoạt động CLB', c.activity_start_date || (c.created_at ? c.created_at.slice(0, 10) : ''), 'date') +
      `<fieldset class="field format-options"><legend>Loại sân *</legend>${['5', '7', '11'].map((v) => `<label><input type="checkbox" name="formats" value="${v}" ${(c.formats || [c.format || '7']).includes(v) ? 'checked' : ''}> Sân ${v} người</label>`).join('')}</fieldset>` +
      (edit
        ? ctx.select(
            'status',
            'Trạng thái',
            [
              ['active', 'Đang hoạt động'],
              ['archived', 'Lưu trữ'],
            ],
            c.status
          )
        : '') +
      ctx.field('description', 'Giới thiệu', c.description, 'textarea');

    ctx.dialog(
      edit ? 'Chỉnh sửa câu lạc bộ' : 'Tạo câu lạc bộ mới',
      'Bạn có thể quản lý nhiều câu lạc bộ trong một tài khoản.',
      fields,
      (form) =>
        ctx.submit(form, 'club', async (data) => {
          data.formats = [
            ...form.querySelectorAll('[name="formats"]:checked'),
          ].map((input) => input.value);
          if (!data.formats.length) {
            throw new Error('Vui lòng chọn ít nhất một loại sân.');
          }
          data.activity_start_date = data.activity_start_date || null;
          const result = edit
            ? await ctx.api.patch(ctx.base(), data)
            : await ctx.api.post('/clubs', data);
          ctx.state.clubId = result.data.id;
          ctx.state.route = 'club';
          history.replaceState(null, '', location.pathname + '#club');
          await ctx.loadApp();
          ctx.toast('Đã lưu câu lạc bộ.');
        })
    );
  }

  function editImage(kind, member) {
    const club = ctx.currentClub();
    const config =
      kind === 'account'
        ? {
            path: '/auth/avatar',
            title: 'Ảnh đại diện tài khoản',
            version: ctx.state.user.avatar_version,
          }
        : kind === 'player'
          ? {
              path: `/clubs/${encodeURIComponent(club.id)}/members/${encodeURIComponent(member.id)}/avatar`,
              title: `Ảnh đại diện · ${ctx.e(member.full_name)}`,
              version: member.avatar_version,
              removable: member.has_custom_avatar,
            }
          : {
              path: `/clubs/${encodeURIComponent(club.id)}/images/${kind === 'background' ? 'background' : 'avatar'}`,
              title: kind === 'background' ? 'Ảnh nền CLB' : 'Ảnh đại diện CLB',
              version:
                kind === 'background'
                  ? club.background_version
                  : club.avatar_version,
            };

    const url = imageUrl(kind, member?.id, config.version, club?.id);
    const fields = `<div class="image-picker"><div class="image-preview ${kind === 'background' ? 'image-preview-wide' : ''}">${url ? `<img src="${ctx.e(url)}" alt="Ảnh hiện tại">` : '<span>Chưa có ảnh</span>'}</div><div class="field"><label for="f-image">Chọn ảnh JPG, PNG hoặc WEBP</label><input id="f-image" name="image" type="file" accept="image/jpeg,image/png,image/webp" required><small data-error="image"></small><small>Tối đa 5 MB. ${kind === 'background' ? 'Ảnh nền sẽ được phủ màu để nội dung dễ đọc.' : ''}</small></div><div class="crop-editor" data-crop-editor><canvas hidden aria-label="Xem trước vùng ảnh đã cắt"></canvas><p data-crop-message>Chọn một ảnh để điều chỉnh khung hình.</p><div class="crop-controls" data-crop-controls hidden><label>Phóng to <input type="range" data-crop-zoom min="1" max="3" step="0.01" value="1"></label><label>Điều chỉnh ngang <input type="range" data-crop-x min="-100" max="100" value="0"></label><label>Điều chỉnh dọc <input type="range" data-crop-y min="-100" max="100" value="0"></label></div></div>${(config.removable ?? Boolean(config.version)) ? '<button type="button" class="text-button danger" data-delete-image>Xóa ảnh hiện tại</button>' : ''}</div>`;

    const refresh = async () => {
      if (kind === 'account') {
        ctx.state.user = (await ctx.api.get('/auth/user')).data;
        await ctx.loadView();
      } else if (kind === 'player') {
        await ctx.loadView();
      } else {
        await ctx.loadApp();
      }
    };

    let cropper;
    const modal = ctx.dialog(
      config.title,
      'Chọn ảnh và điều chỉnh vùng hiển thị trước khi lưu.',
      fields,
      (form) =>
        ctx.submit(form, 'image', async () => {
          const file = form.elements.image.files[0];
          if (
            !file ||
            !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) ||
            file.size > 5 * 1024 * 1024
          ) {
            throw new Error('Chọn ảnh JPG, PNG hoặc WEBP tối đa 5 MB.');
          }
          const cropped = await cropper.exportFile();
          const data = new FormData();
          data.append('image', cropped);
          await ctx.api.post(config.path, data);
          await refresh();
          ctx.toast('Đã cập nhật ảnh.');
        })
    );

    cropper = setupImageCropper(
      modal.querySelector('[data-crop-editor]'),
      modal.querySelector('[name="image"]'),
      { background: kind === 'background' }
    );

    modal
      .querySelector('[data-delete-image]')
      ?.addEventListener('click', async (event) => {
        event.currentTarget.disabled = true;
        try {
          await ctx.api.delete(config.path);
          await refresh();
          modal.close();
          ctx.toast('Đã xóa ảnh.');
        } catch (error) {
          ctx.showErrors(
            modal.querySelector('form'),
            error.errors || {},
            error.message
          );
          event.currentTarget.disabled = false;
        }
      });

    modal.addEventListener('close', () => cropper.destroy(), { once: true });
    return modal;
  }

  async function handleAction(a, el) {
    if (a === 'new-club') return editClub();

    if (a === 'edit-club') {
      if (!ctx.requirePermission(ctx.canManageClub(), 'Chỉnh sửa CLB')) return true;
      return editClub(true);
    }

    if (a === 'edit-account-avatar') return editImage('account');
    if (a === 'edit-club-avatar') {
      if (!ctx.requirePermission(ctx.canManageClub(), 'Đổi ảnh đại diện CLB')) return true;
      return editImage('club');
    }
    if (a === 'edit-club-background') {
      if (!ctx.requirePermission(ctx.canManageClub(), 'Đổi ảnh nền CLB')) return true;
      return editImage('background');
    }
    if (a === 'edit-player-avatar') {
      if (!ctx.requirePermission(ctx.canManageRoster(), 'Đổi ảnh cầu thủ')) return true;
      const member = ctx.state.members.find(
        (x) => String(x.id) === el.dataset.id
      );
      if (member) return editImage('player', member);
    }
    if (a === 'edit-my-player-avatar' && ctx.state.myPlayer) {
      return editImage('player', ctx.state.myPlayer);
    }

    if (a === 'transfer-ownership') {
      const isOwner = ctx.currentRole() === 'owner' || ctx.currentClub()?.is_system_admin;
      if (!ctx.requirePermission(isOwner, 'Chuyển giao quyền Chủ nhiệm')) return true;
      const candidates = ctx.unpackList(
        await ctx.api.get(ctx.base('/club-memberships'))
      ).rows.filter((m) => m.role !== 'owner');

      if (!candidates.length) {
        ctx.toast('Chưa có thành viên nào khác trong CLB để chuyển quyền.', true);
        return true;
      }

      const warningNotice = `
        <div class="lineup-editor" style="grid-column:1/-1;">
          <p class="notice danger-notice">
            <strong>CẢNH BÁO NGUY HIỂM:</strong> Khi bạn chuyển giao quyền Chủ nhiệm, bạn sẽ trở thành thành viên thông thường và <strong>MẤT TOÀN BỘ QUYỀN HẠN CỦA CHỦ NHIỆM CLB</strong>. Quyền lực tối cao sẽ được chuyển giao hoàn toàn cho người được chọn.
          </p>
          ${ctx.select(
            'target_user_id',
            'Chọn thành viên nhận quyền Chủ nhiệm',
            candidates.map((m) => [m.user_id, `${m.name || m.email} (${m.email})`]),
            candidates[0].user_id
          )}
          <div class="field" style="margin-top:12px;">
            <label for="f-confirm-transfer">Nhập chữ <strong>XÁC NHẬN</strong> để đồng ý chuyển giao quyền:</label>
            <input id="f-confirm-transfer" name="confirm_text" type="text" required placeholder="XÁC NHẬN" autocomplete="off">
          </div>
        </div>
      `;

      return ctx.dialog(
        'Chuyển giao quyền Chủ nhiệm CLB',
        'Trao lại toàn bộ quyền hành của Chủ nhiệm CLB cho một thành viên khác.',
        warningNotice,
        (form) =>
          ctx.submit(form, 'transfer-ownership', async (data) => {
            if (data.confirm_text !== 'XÁC NHẬN') {
              throw new Error('Vui lòng nhập chính xác chữ "XÁC NHẬN" để xác nhận thao tác.');
            }
            await ctx.api.post(ctx.base('/transfer-ownership'), {
              new_owner_user_id: data.target_user_id,
              my_new_role: 'member',
            });
            await ctx.loadApp();
            await ctx.loadView();
            ctx.toast('Đã chuyển giao quyền Chủ nhiệm CLB thành công. Bạn hiện là thành viên thường.');
          }),
        'Xác nhận chuyển quyền'
      );
    }

    if (a === 'change-password') {
      return ctx.dialog(
        'Đổi mật khẩu',
        'Nhập mật khẩu hiện tại và mật khẩu mới. Các phiên cơ sở dữ liệu khác sẽ được thu hồi; phiên đã được bảo vệ sẽ cần đăng nhập lại.',
        ctx.field('current_password', 'Mật khẩu hiện tại', '', 'password', true) +
          ctx
            .field('password', 'Mật khẩu mới', '', 'password', true)
            .replace('autocomplete="current-password"', 'autocomplete="new-password"') +
          ctx
            .field(
              'password_confirmation',
              'Nhập lại mật khẩu mới',
              '',
              'password',
              true
            )
            .replace('autocomplete="current-password"', 'autocomplete="new-password"'),
        (form) =>
          ctx.submit(form, 'change-password', async (data) => {
            await ctx.api.patch('/auth/password', data);
            ctx.toast('Đã đổi mật khẩu.');
          })
      );
    }

    if (a === 'claim-player' && ctx.state.canClaimPlayer) {
      return ctx.dialog(
        'Liên kết hồ sơ thành viên?',
        'Hồ sơ có email đã xác minh của bạn sẽ được liên kết với tài khoản này trong CLB hiện tại.',
        '',
        (form) =>
          ctx.submit(
            form,
            'claim-player',
            async () => {
              await ctx.api.post(ctx.base('/my-player/claim'), {});
              await ctx.loadView();
              ctx.toast('Đã liên kết hồ sơ thành viên.');
            },
            'Liên kết'
          )
      );
    }

    if (a === 'unlink-player' && ctx.state.myPlayer) {
      return ctx.dialog(
        'Bỏ liên kết hồ sơ?',
        'Hồ sơ vẫn thuộc CLB, nhưng tài khoản này sẽ không còn quyền tự đổi ảnh hồ sơ đó.',
        '',
        (form) =>
          ctx.submit(
            form,
            'unlink-player',
            async () => {
              await ctx.api.delete(ctx.base('/my-player/claim'));
              await ctx.loadView();
              ctx.toast('Đã bỏ liên kết hồ sơ.');
            },
            'Bỏ liên kết'
          )
      );
    }

    if (a === 'delete-club' && ctx.currentRole() === 'owner') {
      const club = ctx.currentClub();
      return ctx.dialog(
        'Xóa câu lạc bộ?',
        `Xóa ${ctx.e(club.name)} sẽ ẩn câu lạc bộ với tất cả thành viên. Dữ liệu được giữ trong hệ thống; hiện chưa có chức năng tự khôi phục trên giao diện.`,
        '',
        (form) =>
          ctx.submit(
            form,
            'delete',
            async () => {
              await ctx.api.delete(ctx.base());
              ctx.state.clubId = null;
              ctx.state.route = 'dashboard';
              history.replaceState(null, '', location.pathname + '#dashboard');
              await ctx.loadApp();
              ctx.toast('Đã xóa câu lạc bộ.');
            },
            'Xác nhận xóa CLB'
          )
      );
    }

    if (a === 'leave-club') {
      const club = ctx.currentClub();
      if (!club) return true;
      const isOwner = club.membership_role === 'owner';
      if (isOwner) {
        ctx.toast('Chủ nhiệm không thể tự rời CLB. Hãy chuyển quyền Chủ nhiệm trước.', true);
        return true;
      }
      const promptMsg = isOwner
        ? `Bạn đang là Chủ nhiệm của "${ctx.e(club.name)}". Nếu bạn rời CLB, quyền Chủ nhiệm sẽ được tự động chuyển cho thành viên khác (hoặc CLB sẽ được lưu trữ nếu không còn thành viên nào khác). Bạn có chắc chắn muốn rời CLB không?`
        : `Bạn có chắc chắn muốn rời khỏi câu lạc bộ "${ctx.e(club.name)}"? Bạn sẽ không còn quyền truy cập dữ liệu và hoạt động của CLB này nữa.`;

      return ctx.dialog(
        'Rời câu lạc bộ?',
        promptMsg,
        '',
        (form) =>
          ctx.submit(
            form,
            'leave',
            async () => {
              await ctx.api.post(ctx.base('/leave'));
              ctx.state.clubId = null;
              ctx.state.route = 'dashboard';
              history.replaceState(null, '', location.pathname + '#dashboard');
              await ctx.loadApp();
              ctx.toast(`Đã rời câu lạc bộ "${club.name}".`);
            },
            'Xác nhận rời CLB'
          ),
        'Xác nhận rời CLB'
      );
    }

    return false;
  }

  return {
    editClub,
    editImage,
    handleAction,
  };
}
