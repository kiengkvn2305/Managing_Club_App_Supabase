import { state as s, currentClub } from '../state.js';
import {
  escapeHtml as e,
  number,
  formatDate,
  canManageClub,
  isCoOwnerOrOwner,
  compareVietnameseNames,
  boardTitleRank,
  initials,
} from '../utils.js';
import { button, empty } from '../components/ui.js';

export function boardPage() {
  const c = currentClub();
  const isOwner = c?.membership_role === 'owner' || c?.is_system_admin;
  const isLeader = isCoOwnerOrOwner(c);
  const canManage = isLeader || canManageClub(c);

  if (!canManage) {
    return `
      <div class="page-top">
        <div>
          <div class="eyebrow">KHÔNG GIAN CÂU LẠC BỘ</div>
          <h1>Thành viên BCN & Phân quyền</h1>
          <p>Thông tin ban chủ nhiệm được bảo vệ theo quyền quản lý.</p>
        </div>
      </div>
      <section class="panel">
        ${empty('Quyền truy cập được bảo vệ', 'Chỉ ban quản lý câu lạc bộ có quyền quản lý BCN và phân quyền.')}
      </section>
    `;
  }

  const sortBoard = (list, sortType = 'title') => {
    const copy = [...list];
    if (sortType === 'name_asc') {
      return copy.sort(
        (a, b) =>
          compareVietnameseNames(a.full_name, b.full_name) ||
          boardTitleRank(a.title) - boardTitleRank(b.title) ||
          (a.id || 0) - (b.id || 0)
      );
    }
    if (sortType === 'name_desc') {
      return copy.sort(
        (a, b) =>
          -1 * compareVietnameseNames(a.full_name, b.full_name) ||
          boardTitleRank(a.title) - boardTitleRank(b.title) ||
          (b.id || 0) - (a.id || 0)
      );
    }
    if (sortType === 'order_asc') {
      return copy.sort((a, b) => (a.id || 0) - (b.id || 0));
    }
    if (sortType === 'order_desc') {
      return copy.sort((a, b) => (b.id || 0) - (a.id || 0));
    }
    // Default: 'title' (theo chức vụ cao -> thấp, sau đó theo tên A-Z)
    return copy.sort(
      (a, b) =>
        boardTitleRank(a.title) - boardTitleRank(b.title) ||
        compareVietnameseNames(a.full_name, b.full_name) ||
        (a.id || 0) - (b.id || 0)
    );
  };

  const sortedBoard = sortBoard(s.boardMembers || [], s.boardSort || 'title');

  const board = sortedBoard.length
    ? `<div class="roster-list">${sortedBoard
        .map((m) => {
          const rank = boardTitleRank(m.title);
          const metaItems = [
            m.date_of_birth ? `Ngày sinh: ${formatDate(m.date_of_birth)}` : '',
            m.email || '',
          ].filter(Boolean);
          return `
        <div class="roster-item ${rank === 1 ? 'rank-leader' : rank === 2 ? 'rank-vice' : ''}">
          <div class="roster-item-left">
            <span class="avatar ${rank === 1 ? 'avatar-gold' : rank === 2 ? 'avatar-emerald' : ''}">${e(initials(m.full_name))}</span>
            <div class="roster-item-main">
              <strong>${e(m.full_name)}</strong>
              <div class="roster-item-meta">
                <span class="badge ${rank === 1 ? 'gold' : rank === 2 ? 'active' : ''}">${e(m.title)}</span>
                ${metaItems.length ? `<small class="roster-meta-text">${e(metaItems.join(' · '))}</small>` : ''}
              </div>
            </div>
          </div>
          <div class="action-chips">
            <button type="button" class="chip-button" data-action="board-edit" data-id="${m.id}">Sửa</button>
            <button type="button" class="chip-button danger" data-action="board-remove" data-id="${m.id}">Bỏ khỏi BCN</button>
          </div>
        </div>`;
        })
        .join('')}</div>`
    : empty(
        'Chưa có thành viên BCN',
        'Chọn thành viên CLB để thêm vào ban chủ nhiệm.'
      );

  const rates = s.boardSharedRates.length
    ? `<div class="roster-list">${s.boardSharedRates
        .map(
          (r) => `
        <div class="roster-item">
          <div class="roster-item-left">
            <div class="roster-item-main">
              <strong>${e(r.team_name)} · ${number(r.amount)} đ/tháng</strong>
              <div class="roster-item-meta">
                <small class="roster-meta-text">Áp dụng từ ${e(r.effective_month.slice(5, 7))}/${e(r.effective_month.slice(0, 4))}</small>
              </div>
            </div>
          </div>
          <div class="action-chips">
            <button type="button" class="chip-button danger" data-action="delete-board-shared-rate" data-id="${r.id}">Xóa</button>
          </div>
        </div>`
        )
        .join('')}</div>`
    : empty(
        'Chưa có mức quỹ chung',
        'Thiết lập mức quỹ ưu đãi cho từng đội.'
      );

  const permissionSummary = (m) => {
    if (m.role === 'owner') return '<span class="badge gold">Toàn quyền (Chủ sở hữu)</span>';
    const perms = m.permissions || {};
    const granted = [];
    if (perms.can_view_finance) granted.push('Xem thu chi');
    if (perms.can_manage_finance) granted.push('Ghi thu chi');
    if (perms.can_manage_roster) granted.push('Quản lý nhân sự');
    if (perms.can_manage_inventory) granted.push('Quản lý kho');
    if (perms.can_manage_activities) granted.push('Quản lý hoạt động');
    if (perms.can_manage_attendance) granted.push('Quản lý điểm danh');
    if (perms.can_manage_club) granted.push('Quản lý CLB');
    if (!granted.length) return '<span class="badge inactive">Quyền mặc định</span>';
    return `<span class="badge">${e(granted.join(', '))}</span>`;
  };

  const sortMemberships = (list, sortType = 'role') => {
    const copy = [...list];
    if (sortType === 'name_asc') {
      return copy.sort((a, b) => compareVietnameseNames(a.name || a.email, b.name || b.email));
    }
    if (sortType === 'name_desc') {
      return copy.sort((a, b) => -1 * compareVietnameseNames(a.name || a.email, b.name || b.email));
    }
    if (sortType === 'order_asc') {
      return copy.sort((a, b) => (a.id || 0) - (b.id || 0));
    }
    if (sortType === 'order_desc') {
      return copy.sort((a, b) => (b.id || 0) - (a.id || 0));
    }
    // Default: 'role' (owner trước, sau đó theo chức vụ, số quyền, tên)
    return copy.sort((a, b) => {
      const aIsOwner = a.role === 'owner' ? -1 : 0;
      const bIsOwner = b.role === 'owner' ? -1 : 0;
      if (aIsOwner !== bIsOwner) return aIsOwner - bIsOwner;
      const rankDiff = boardTitleRank(a.title) - boardTitleRank(b.title);
      if (rankDiff !== 0) return rankDiff;
      const aPerms = Object.values(a.permissions || {}).filter(Boolean).length;
      const bPerms = Object.values(b.permissions || {}).filter(Boolean).length;
      if (bPerms !== aPerms) return bPerms - aPerms;
      return compareVietnameseNames(a.name || a.email, b.name || b.email) || (a.id || 0) - (b.id || 0);
    });
  };

  const sortedMemberships = sortMemberships(s.clubMemberships || [], s.membershipsSort || 'role');

  const membershipsList = sortedMemberships.length
    ? `<div class="roster-list">${sortedMemberships
        .map((m) => {
          const displayName = m.name || m.email || `Thành viên #${m.id}`;
          return `
        <div class="roster-item ${m.role === 'owner' ? 'rank-leader' : ''}">
          <div class="roster-item-left">
            <span class="avatar ${m.role === 'owner' ? 'avatar-gold' : ''}">${e(initials(displayName))}</span>
            <div class="roster-item-main">
              <strong>${e(displayName)}</strong>
              <small class="roster-meta-text">${e(m.email || '')}${m.title ? ` · Chức danh: ${e(m.title)}` : ''} · Vai trò: ${e(m.role)}</small>
              <div class="roster-item-meta">${permissionSummary(m)}</div>
            </div>
          </div>
          <div class="action-chips">
            ${isLeader && m.role !== 'owner' ? `<button type="button" class="chip-button" data-action="edit-permissions" data-id="${m.id}">Chức vụ & Phân quyền</button>` : ''}
            ${m.role === 'owner' ? `<span class="badge gold">Chủ nhiệm tối cao</span>` : ''}
            ${isOwner && m.role !== 'owner' ? `<button type="button" class="chip-button secondary" data-action="transfer-ownership" data-id="${m.user_id}" data-name="${e(m.name || m.email)}">Trao quyền Chủ nhiệm</button>` : ''}
            ${isLeader && m.role !== 'owner' ? `<button type="button" class="chip-button danger" data-action="remove-club-member" data-id="${m.id}" data-name="${e(m.name || m.email)}" title="Xóa tài khoản khỏi CLB và BCN">Xóa khỏi CLB</button>` : ''}
          </div>
        </div>`;
        })
        .join('')}</div>`
    : empty('Chưa có tài khoản thành viên', 'Mời thành viên tham gia để phân quyền sử dụng.');

  return `
    <div class="page-top">
      <div>
        <div class="eyebrow">KHÔNG GIAN CÂU LẠC BỘ</div>
        <h1>Thành viên BCN & Phân quyền</h1>
        <p>Danh sách ban chủ nhiệm và quản lý quyền hạn của từng tài khoản thành viên trong CLB.</p>
      </div>
      <div class="page-actions">
        ${button('invite', 'Mời tài khoản', 'mail', 'secondary')}
        ${button('board-new', 'Thêm BCN')}
      </div>
    </div>

    <section class="panel">
      <div class="panel-head" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;">
        <div>
          <h2>Tài khoản thành viên & Phân quyền chi tiết (${sortedMemberships.length})</h2>
          <p>Chủ nhiệm CLB có toàn quyền cấp hoặc giới hạn từng chức năng cho từng thành viên, hoặc trao lại quyền Chủ nhiệm cho người khác.</p>
        </div>
        <div style="display:flex;align-items:center;gap:8px;">
          <label style="margin:0;display:flex;align-items:center;gap:6px;font-size:13px;font-weight:600;color:var(--muted);white-space:nowrap;">
            <span>Sắp xếp:</span>
            <select data-memberships-sort aria-label="Sắp xếp Tài khoản & Phân quyền" style="margin:0;padding:5px 10px;height:34px;font-size:13px;border-radius:6px;border:1px solid var(--line);background:var(--surface);color:var(--text);font-weight:500;">
              <option value="role" ${(s.membershipsSort || 'role') === 'role' ? 'selected' : ''}>Chủ nhiệm & Chức vụ đầu</option>
              <option value="name_asc" ${s.membershipsSort === 'name_asc' ? 'selected' : ''}>Theo tên (A → Z)</option>
              <option value="name_desc" ${s.membershipsSort === 'name_desc' ? 'selected' : ''}>Theo tên (Z → A)</option>
              <option value="order_asc" ${s.membershipsSort === 'order_asc' ? 'selected' : ''}>Theo thứ tự (Cũ → Mới)</option>
              <option value="order_desc" ${s.membershipsSort === 'order_desc' ? 'selected' : ''}>Theo thứ tự (Mới → Cũ)</option>
            </select>
          </label>
        </div>
      </div>
      ${membershipsList}
    </section>

    <section class="panel">
      <div class="panel-head">
        <div>
          <h2>Mã mời & Lời mời tham gia CLB (${(s.clubInvitations || []).length})</h2>
          <p class="muted">Mã mời được tạo sẵn kèm chức vụ và quyền hạn. Người nhận chỉ cần nhập mã tại mục "Nhận lời mời" (#accept).</p>
        </div>
        ${button('invite', 'Tạo mã mời mới', 'plus', 'secondary')}
      </div>
      ${(() => {
        const list = s.clubInvitations || [];
        if (!list.length) {
          return '<div class="panel-body"><p class="muted">Chưa có mã mời nào. Bấm "Tạo mã mời mới" để tạo mã và cấp sẵn quyền hạn để test.</p></div>';
        }
        return `
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Mã mời</th>
                  <th>Email nhận</th>
                  <th>Chức vụ & Quyền</th>
                  <th class="tabular-nums">Hạn dùng</th>
                  <th class="text-center">Trạng thái</th>
                  <th class="text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                ${list
                  .map((inv) => {
                    const code = inv.invite_code || inv.token || 'INV';
                    const permsCount = Object.values(inv.permissions || {}).filter(
                      Boolean
                    ).length;
                    const isExpired =
                      inv.status === 'expired' ||
                      (inv.expires_at && new Date(inv.expires_at) < new Date());
                    const isActive = inv.status === 'pending' && !isExpired;
                    const statusMap = {
                      pending: isExpired
                        ? '<span class="badge muted">Hết hạn</span>'
                        : '<span class="badge active">Đang chờ</span>',
                      accepted: '<span class="badge">Đã tham gia</span>',
                      expired: '<span class="badge muted">Hết hạn</span>',
                      revoked: '<span class="badge injured">Đã hủy</span>',
                    };
                    const statusBadge =
                      isExpired && inv.status === 'pending'
                        ? '<span class="badge muted">Hết hạn</span>'
                        : statusMap[inv.status] ||
                          `<span class="badge">${e(inv.status)}</span>`;
                    return `
                    <tr>
                      <td><strong style="font-family:monospace;letter-spacing:1px;font-size:1rem;color:var(--primary);">${e(code)}</strong></td>
                      <td>${inv.email ? `<span>${e(inv.email)}</span>` : '<span class="badge secondary" style="font-size:0.75rem;">Dùng chung (Test)</span>'}</td>
                      <td>
                        <strong>${e(inv.title || 'Thành viên')}</strong>
                        ${permsCount ? `<br><small class="muted">${permsCount} quyền tùy chỉnh</small>` : ''}
                      </td>
                      <td class="tabular-nums">${e(formatDate(String(inv.expires_at || '').slice(0, 10)))}</td>
                      <td class="text-center">${statusBadge}</td>
                      <td class="text-right">
                        <div style="display:inline-flex;gap:0.35rem;justify-content:flex-end;">
                          ${isActive ? `<button type="button" class="text-button" data-action="copy-code" data-code="${e(code)}" title="Sao chép mã">Chép mã</button>` : ''}
                          ${canManage ? `<button type="button" class="text-button danger" data-action="revoke-invitation" data-id="${inv.id}" title="${isActive ? 'Hủy và xóa vĩnh viễn mã này' : 'Xóa mã khỏi hệ thống'}">Xóa</button>` : ''}
                        </div>
                      </td>
                    </tr>
                  `;
                  })
                  .join('')}
              </tbody>
            </table>
          </div>
        `;
      })()}
    </section>

    <section class="panel">
      <div class="panel-head" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;">
        <div>
          <h2>Ban chủ nhiệm (${sortedBoard.length})</h2>
          <p>Chức danh dùng để ghi nhận nhân sự, không tự cấp quyền đăng nhập.</p>
        </div>
        <div style="display:flex;align-items:center;gap:8px;">
          <label style="margin:0;display:flex;align-items:center;gap:6px;font-size:13px;font-weight:600;color:var(--muted);white-space:nowrap;">
            <span>Sắp xếp:</span>
            <select data-board-members-sort aria-label="Sắp xếp danh sách Ban chủ nhiệm" style="margin:0;padding:5px 10px;height:34px;font-size:13px;border-radius:6px;border:1px solid var(--line);background:var(--surface);color:var(--text);font-weight:500;">
              <option value="title" ${(s.boardSort || 'title') === 'title' ? 'selected' : ''}>Theo chức vụ (Cao → Thấp)</option>
              <option value="name_asc" ${s.boardSort === 'name_asc' ? 'selected' : ''}>Theo tên (A → Z)</option>
              <option value="name_desc" ${s.boardSort === 'name_desc' ? 'selected' : ''}>Theo tên (Z → A)</option>
              <option value="order_asc" ${s.boardSort === 'order_asc' ? 'selected' : ''}>Theo thứ tự (Cũ → Mới)</option>
              <option value="order_desc" ${s.boardSort === 'order_desc' ? 'selected' : ''}>Theo thứ tự (Mới → Cũ)</option>
            </select>
          </label>
        </div>
      </div>
      ${board}
    </section>

    <section class="panel">
      <div class="panel-head">
        <div>
          <h2>Công việc Ban chủ nhiệm (${(s.boardTasks || []).length})</h2>
          <p>Phân công và theo dõi tiến độ các đầu việc điều hành câu lạc bộ.</p>
        </div>
        ${button('board-task-new', 'Giao việc BCN')}
      </div>
      ${
        (s.boardTasks || []).length
          ? `<div class="roster-list">${(s.boardTasks || [])
              .map(
                (t) => `
        <div class="roster-item">
          <div class="roster-item-left">
            <div class="roster-item-main">
              <strong>${e(t.title)}</strong>
              <div class="roster-item-meta">
                <span class="badge ${Number(t.progress) >= 100 ? 'active' : ''}">${number(t.progress || 0)}%</span>
                <small class="roster-meta-text">${e(t.assignee_name || 'BCN')}${t.assignee_title ? ` (${e(t.assignee_title)})` : ''}${t.due_date ? ` · Hạn: ${e(formatDate(t.due_date))}` : ''}</small>
              </div>
              ${t.description ? `<small class="muted" style="display:block;margin-top:4px;">${e(t.description)}</small>` : ''}
            </div>
          </div>
          <div class="action-chips">
            <button type="button" class="chip-button" data-action="board-task-edit" data-id="${t.id}">Cập nhật</button>
            <button type="button" class="chip-button danger" data-action="board-task-delete" data-id="${t.id}">Xóa</button>
          </div>
        </div>`
              )
              .join('')}</div>`
          : empty('Chưa có công việc BCN', 'Tạo đầu việc và phân công cho thành viên Ban chủ nhiệm.')
      }
    </section>

    <section class="panel">
      <div class="panel-head">
        <div>
          <h2>Ưu đãi quỹ chung cho BCN</h2>
          <p>Mỗi đội có một mức áp dụng cho toàn bộ thành viên BCN.</p>
        </div>
        ${button('board-shared-dues', 'Đặt mức quỹ')}
      </div>
      ${rates}
    </section>
  `;
}
