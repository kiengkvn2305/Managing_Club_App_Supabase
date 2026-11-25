import { dialog, field, select, showErrors, toast } from './components/ui.js';
import { escapeHtml as e, number, formatVietnamDateTime, formatDate } from './utils.js';

function submitOnce(form, operation) {
  const submit = form.querySelector('[type="submit"]');
  if (submit.disabled) return Promise.resolve(false);
  submit.disabled = true;
  return operation()
    .then(() => true)
    .catch((error) => {
      showErrors(form, error.errors || {}, error.message);
      return false;
    })
    .finally(() => {
      if (submit.isConnected) submit.disabled = false;
    });
}

export const MOVEMENT_LABELS = {
  in: 'Nhập',
  out: 'Xuất',
  adjust: 'Kiểm kê',
  assign: 'Cấp phát',
  return: 'Thu hồi',
  damaged: 'Báo hỏng',
  lost: 'Báo mất',
};

export function openInventoryItem({ item, api, base, reload }) {
  const fields =
    field('name', 'Tên trang bị', item?.name || '', 'text', true) +
    field('unit', 'Đơn vị', item?.unit || 'cái', 'text', true) +
    select(
      'kind',
      'Loại',
      [
        ['consumable', 'Vật tư tiêu hao'],
        ['asset', 'Tài sản có thể cấp phát'],
      ],
      item?.kind || 'consumable'
    ) +
    `<details class="inventory-options"><summary>Thông tin bổ sung</summary>${field('category', 'Nhóm', item?.category || '')}${field('low_stock_threshold', 'Cảnh báo khi số lượng còn', item?.low_stock_threshold ?? 0, 'number', true)}${field('notes', 'Ghi chú', item?.notes || '', 'textarea')}</details>`;
  const modal = dialog(
    item ? 'Chỉnh sửa trang bị' : 'Thêm trang bị',
    item ? 'Cập nhật thông tin trang bị.' : 'Sau khi thêm, chọn Nhập / xuất để ghi số lượng.',
    fields,
    (form) =>
      submitOnce(form, async () => {
        const data = Object.fromEntries(new FormData(form));
        data.low_stock_threshold =
          data.low_stock_threshold === '' ? null : Number(data.low_stock_threshold);
        if (item) await api.patch(base(`/inventory/${item.id}`), data);
        else await api.post(base('/inventory'), data);
        await reload();
        toast('Đã lưu vật tư.');
      })
  );
  modal.querySelector('[name="low_stock_threshold"]').max = '1000000';
  return modal;
}

export function openInventoryMovement({ item, api, base, reload, initialType = 'in' }) {
  const isIncident = initialType === 'damaged' || initialType === 'lost';
  const options = isIncident
    ? [
        ['damaged', 'Báo hỏng tại kho (trừ tồn kho khả dụng)'],
        ['lost', 'Báo mất / thất lạc tại kho (trừ tồn kho khả dụng)'],
      ]
    : [
        ['in', 'Nhập kho'],
        ['out', 'Xuất kho'],
        ['adjust', 'Kiểm kê: đặt lại số tồn'],
        ['damaged', 'Báo hỏng tại kho'],
        ['lost', 'Báo mất / thất lạc tại kho'],
      ];

  const fields =
    select('type', 'Nghiệp vụ', options, initialType) +
    field('quantity', 'Số lượng', '', 'number', true) +
    field(
      'reason',
      isIncident ? 'Mô tả tình trạng hỏng / mất & hướng xử lý' : 'Lý do / ghi chú',
      '',
      'textarea',
      true
    );

  const modal = dialog(
    isIncident ? 'Báo hỏng / mất trang bị' : 'Ghi biến động kho',
    `${e(item.name)} · tồn khả dụng hiện tại ${number(item.quantity)} ${e(item.unit)}.${isIncident ? ' Số lượng báo hỏng/mất sẽ được trừ khỏi tồn kho khả dụng và lưu vào báo cáo sự cố.' : ' Với kiểm kê, nhập số tồn thực tế.'}`,
    fields,
    (form) =>
      submitOnce(form, async () => {
        const data = Object.fromEntries(new FormData(form));
        data.quantity = data.quantity === '' ? null : Number(data.quantity);
        await api.post(base(`/inventory/${item.id}/movements`), data);
        await reload();
        toast(
          data.type === 'damaged' || data.type === 'lost'
            ? 'Đã ghi nhận báo cáo hỏng/mất trang bị.'
            : 'Đã ghi biến động kho.'
        );
      }),
    isIncident ? 'Ghi nhận sự cố' : 'Ghi biến động'
  );
  const qtyInput = modal.querySelector('[name="quantity"]');
  qtyInput.min = isIncident ? '1' : '0';
  qtyInput.max = isIncident ? String(Math.max(1, Number(item.quantity) || 1)) : '1000000';
  return modal;
}

export async function showInventoryHistory({ item, api, base }) {
  let page = 1;
  const render = async () => {
    const result = await api.get(base(`/inventory/${item.id}/movements?page=${page}`));
    const rows = result.data
      .map(
        (m) => `
      <tr>
        <td class="tabular-nums">${e(formatVietnamDateTime(m.created_at))}</td>
        <td><span class="badge ${m.type === 'damaged' || m.type === 'lost' ? 'injured' : m.type === 'in' || m.type === 'return' ? 'active' : ''}">${e(MOVEMENT_LABELS[m.type] || m.type)}</span></td>
        <td class="tabular-nums">${m.change > 0 ? '+' : ''}${number(m.change)}</td>
        <td class="tabular-nums">${number(m.balance_after)}</td>
        <td>${e(m.reason)}</td>
      </tr>`
      )
      .join('');
    const host = document.createElement('dialog');
    host.setAttribute('aria-label', 'Lịch sử kho');
    host.innerHTML = `<div class="dialog-head"><div><h2>Lịch sử · ${e(item.name)}</h2><p>Lịch sử biến động và sự cố không thể sửa hoặc xóa.</p></div><button type="button" class="icon-button" data-close aria-label="Đóng">×</button></div><div class="dialog-body">${rows ? `<div class="table-wrap"><table><thead><tr><th>Thời gian</th><th>Nghiệp vụ</th><th>Thay đổi</th><th>Tồn sau</th><th>Lý do</th></tr></thead><tbody>${rows}</tbody></table></div>` : '<p>Chưa có biến động.</p>'}<div class="table-footer"><button class="icon-button" data-prev ${page <= 1 ? 'disabled' : ''}>←</button> ${page} / ${result.last_page} <button class="icon-button" data-next ${page >= result.last_page ? 'disabled' : ''}>→</button></div></div>`;
    document.body.append(host);
    host.querySelector('[data-close]').onclick = () => host.close();
    host.querySelector('[data-prev]').onclick = async () => {
      page--;
      host.close();
      await render();
    };
    host.querySelector('[data-next]').onclick = async () => {
      page++;
      host.close();
      await render();
    };
    host.addEventListener('close', () => host.remove(), { once: true });
    host.showModal();
  };
  try {
    await render();
  } catch (error) {
    toast(error.message, true);
  }
}

export async function showInventoryIncidentsReport({ api, base }) {
  try {
    const result = await api.get(base('/inventory/incidents'));
    const report = result.data || { damaged_count: 0, lost_count: 0, data: [] };
    const rows = (report.data || [])
      .map(
        (m) => `
      <tr>
        <td class="tabular-nums">${e(formatVietnamDateTime(m.created_at))}</td>
        <td><strong>${e(m.item_name || '—')}</strong></td>
        <td><span class="badge injured">${e(MOVEMENT_LABELS[m.type] || m.type)}</span></td>
        <td>${e(m.player_name || 'Tại kho CLB')}</td>
        <td class="tabular-nums">${m.change !== 0 ? `${number(Math.abs(m.change))} ${e(m.unit || '')}` : 'Khi mượn'}</td>
        <td>${e(m.reason || '—')}</td>
      </tr>`
      )
      .join('');

    const host = document.createElement('dialog');
    host.setAttribute('aria-label', 'Báo cáo hỏng mất trang bị');
    host.innerHTML = `
      <div class="dialog-head">
        <div>
          <h2>Báo cáo hỏng / mất thiết bị</h2>
          <p>Tổng hợp toàn bộ sự cố hỏng hóc và thất lạc trang bị của câu lạc bộ.</p>
        </div>
        <button type="button" class="icon-button" data-close aria-label="Đóng">×</button>
      </div>
      <div class="dialog-body">
        <div class="stats-grid" style="margin-bottom:14px;">
          <section class="stat stat-expense">
            <div><span>Lượt báo hỏng</span></div>
            <strong class="tabular-nums">${number(report.damaged_count || 0)}</strong>
          </section>
          <section class="stat stat-expense">
            <div><span>Lượt báo mất</span></div>
            <strong class="tabular-nums">${number(report.lost_count || 0)}</strong>
          </section>
        </div>
        ${
          rows
            ? `<div class="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Thời gian</th>
                      <th>Trang bị</th>
                      <th>Loại sự cố</th>
                      <th>Nguồn ghi nhận</th>
                      <th>Số lượng</th>
                      <th>Chi tiết / xử lý</th>
                    </tr>
                  </thead>
                  <tbody>${rows}</tbody>
                </table>
              </div>`
            : '<p class="muted">Chưa có sự cố hỏng hoặc mất trang bị nào được ghi nhận.</p>'
        }
      </div>
    `;
    document.body.append(host);
    host.querySelector('[data-close]').onclick = () => host.close();
    host.addEventListener('close', () => host.remove(), { once: true });
    host.showModal();
  } catch (error) {
    toast(error.message, true);
  }
}

export async function showInventoryAssignments({ item, api, base, reload, canManage }) {
  let page = 1;
  const render = async () => {
    const result = await api.get(base(`/inventory/${item.id}/assignments?page=${page}`));
    const host = document.createElement('dialog');
    host.setAttribute('aria-label', 'Cấp phát trang bị');
    const rows = result.data
      .map(
        (a) => `
      <tr>
        <td>${e(a.player_name)}</td>
        <td class="tabular-nums">${e(formatVietnamDateTime(a.created_at))}</td>
        <td class="tabular-nums">${number(a.quantity)}</td>
        <td class="tabular-nums">${number(a.remaining)}</td>
        <td>
          ${
            canManage && !item.archived && a.remaining > 0
              ? `<div class="team-actions">
                  <button type="button" class="text-button" data-return="${a.id}">Thu hồi</button>
                  <button type="button" class="text-button danger" data-incident="${a.id}">Báo hỏng / mất</button>
                </div>`
              : '—'
          }
        </td>
      </tr>`
      )
      .join('');
    host.innerHTML = `<div class="dialog-head"><div><h2>Cấp phát · ${e(item.name)}</h2><p>Theo dõi số lượng đang mượn, thu hồi về kho hoặc xử lý hỏng/mất.</p></div><button type="button" class="icon-button" data-close aria-label="Đóng">×</button></div><div class="dialog-body">${canManage && !item.archived ? '<button type="button" class="button" data-assign>Cấp phát mới</button>' : ''}${rows ? `<div class="table-wrap"><table><thead><tr><th>Thành viên</th><th>Thời gian</th><th>Đã cấp</th><th>Còn mượn</th><th>Thao tác</th></tr></thead><tbody>${rows}</tbody></table></div>` : '<p>Chưa có cấp phát.</p>'}<div class="table-footer"><button class="icon-button" data-prev aria-label="Trang trước" ${page <= 1 ? 'disabled' : ''}>←</button> ${page} / ${result.last_page} <button class="icon-button" data-next aria-label="Trang sau" ${page >= result.last_page ? 'disabled' : ''}>→</button></div></div>`;
    document.body.append(host);
    host.querySelector('[data-close]').onclick = () => host.close();
    const refresh = async () => {
      host.close();
      await reload();
      await render();
    };
    host.querySelector('[data-assign]')?.addEventListener('click', () =>
      openInventoryAssignment({ item, api, base, refresh })
    );
    host.querySelectorAll('[data-return]').forEach((btn) =>
      btn.addEventListener('click', () => {
        const assignment = result.data.find((a) => String(a.id) === btn.dataset.return);
        const formFields =
          field('quantity', 'Số lượng thu hồi về kho', '', 'number', true) +
          field('reason', 'Lý do / ghi chú', '', 'textarea', true);
        const modal = dialog(
          'Thu hồi trang bị',
          `${e(assignment.player_name)} · còn mượn ${number(assignment.remaining)} ${e(item.unit)}. Số lượng thu hồi sẽ cộng lại vào tồn kho.`,
          formFields,
          (form) =>
            submitOnce(form, async () => {
              const data = Object.fromEntries(new FormData(form));
              data.quantity = data.quantity === '' ? null : Number(data.quantity);
              await api.post(
                base(`/inventory/${item.id}/assignments/${assignment.id}/return`),
                data
              );
              await refresh();
              toast('Đã thu hồi trang bị.');
            }),
          'Thu hồi'
        );
        modal.querySelector('[name="quantity"]').min = '1';
        modal.querySelector('[name="quantity"]').max = String(assignment.remaining);
      })
    );
    host.querySelectorAll('[data-incident]').forEach((btn) =>
      btn.addEventListener('click', () => {
        const assignment = result.data.find((a) => String(a.id) === btn.dataset.incident);
        const formFields =
          select(
            'incident_type',
            'Loại sự cố',
            [
              ['damaged', 'Bị hỏng (không thể tái sử dụng)'],
              ['lost', 'Bị mất / thất lạc'],
            ],
            'damaged'
          ) +
          field('quantity', 'Số lượng hỏng / mất', '1', 'number', true) +
          field('reason', 'Nguyên nhân & hướng xử lý (đền bù / thanh lý)', '', 'textarea', true);
        const modal = dialog(
          'Báo hỏng / mất thiết bị đang mượn',
          `${e(assignment.player_name)} · đang giữ ${number(assignment.remaining)} ${e(item.unit)}. Số lượng này sẽ giảm khỏi phần đang mượn nhưng KHÔNG cộng lại vào tồn kho sử dụng được.`,
          formFields,
          (form) =>
            submitOnce(form, async () => {
              const data = Object.fromEntries(new FormData(form));
              data.quantity = data.quantity === '' ? null : Number(data.quantity);
              await api.post(
                base(`/inventory/${item.id}/assignments/${assignment.id}/incident`),
                data
              );
              await refresh();
              toast('Đã ghi nhận xử lý hỏng/mất thiết bị.');
            }),
          'Ghi nhận sự cố'
        );
        modal.querySelector('[name="quantity"]').min = '1';
        modal.querySelector('[name="quantity"]').max = String(assignment.remaining);
      })
    );
    host.querySelector('[data-prev]').onclick = async () => {
      page--;
      host.close();
      await render();
    };
    host.querySelector('[data-next]').onclick = async () => {
      page++;
      host.close();
      await render();
    };
    host.addEventListener('close', () => host.remove(), { once: true });
    host.showModal();
  };
  try {
    await render();
  } catch (error) {
    toast(error.message, true);
  }
}

function openInventoryAssignment({ item, api, base, refresh }) {
  const fields =
    `<div class="field"><label for="assignment-search">Tìm tên hoặc ghi chú</label><input id="assignment-search" type="search" autocomplete="off"><label for="assignment-order">Sắp xếp</label><select id="assignment-order"><option value="asc">Tên A–Z</option><option value="desc">Tên Z–A</option></select><button type="button" class="button secondary" data-search>Tìm</button><div><button type="button" class="icon-button" data-prev aria-label="Trang trước">←</button> <span data-page></span> <button type="button" class="icon-button" data-next aria-label="Trang sau">→</button></div></div><div class="field"><label for="f-player_id">Thành viên *</label><select id="f-player_id" name="player_id" required></select><small data-error="player_id"></small></div>` +
    field('quantity', 'Số lượng', '', 'number', true) +
    field('reason', 'Lý do / ghi chú', '', 'textarea', true);
  const modal = dialog(
    'Cấp phát trang bị',
    `${e(item.name)}. Tìm theo tên, sau đó chọn thành viên.`,
    fields,
    (form) =>
      submitOnce(form, async () => {
        const data = Object.fromEntries(new FormData(form));
        data.quantity = data.quantity === '' ? null : Number(data.quantity);
        await api.post(base(`/inventory/${item.id}/assignments`), data);
        await refresh();
        toast('Đã cấp phát trang bị.');
      }),
    'Cấp phát'
  );
  modal.querySelector('[name="quantity"]').max = '1000000';
  let page = 1,
    search = '',
    last = 1,
    serial = 0;
  const load = async () => {
    const current = ++serial;
    const selectEl = modal.querySelector('[name="player_id"]');
    selectEl.innerHTML = '<option value="">Đang tải thành viên...</option>';
    selectEl.disabled = true;
    try {
      const result = await api.get(
        base(
          `/inventory/members?search=${encodeURIComponent(search)}&page=${page}&direction=${modal.querySelector('#assignment-order').value}`
        )
      );
      if (current !== serial || !modal.isConnected) return;
      last = result.last_page;
      selectEl.disabled = false;
      selectEl.innerHTML =
        '<option value="">Chọn thành viên</option>' +
        result.data
          .map(
            (p) =>
              `<option value="${p.id}">${e([p.full_name, formatDate(p.date_of_birth), p.email, (p.team_labels || []).join(', ') || 'Chưa xếp đội'].filter(Boolean).join(' · '))}</option>`
          )
          .join('');
      modal.querySelector('[data-page]').textContent = `${page} / ${last}`;
      modal.querySelector('[data-prev]').disabled = page <= 1;
      modal.querySelector('[data-next]').disabled = page >= last;
    } catch (error) {
      if (current === serial && modal.isConnected) {
        selectEl.disabled = false;
        selectEl.innerHTML = '<option value="">Không tải được thành viên</option>';
        toast(error.message, true);
      }
    }
  };
  modal.querySelector('[data-search]').onclick = () => {
    search = modal.querySelector('#assignment-search').value.trim();
    page = 1;
    load();
  };
  modal.querySelector('#assignment-order').onchange = () => {
    page = 1;
    load();
  };
  modal.querySelector('[data-prev]').onclick = () => {
    if (page > 1) {
      page--;
      load();
    }
  };
  modal.querySelector('[data-next]').onclick = () => {
    if (page < last) {
      page++;
      load();
    }
  };
  load();
}
