import { escapeHtml as e, number } from './utils.js';
import { button, empty } from './components/ui.js';

export function inventoryPage({
  inventory = {},
  canManage = false,
  search = '',
  lowStock = false,
  archived = false,
} = {}) {
  const {
    data = [],
    current_page = 1,
    last_page = 1,
    total = 0,
    summary = {},
  } = inventory;

  const lowStockCount =
    summary.low_stock_count ??
    data.filter((x) => !x.archived && x.quantity <= x.low_stock_threshold).length;
  const incidentCount = Number(summary.incident_count || 0);

  return `
    <div class="page-top">
      <div>
        <div class="eyebrow">QUẢN LÝ</div>
        <h1>Kho trang bị</h1>
        <p>Quản lý danh mục, nhập/xuất, cấp phát thành viên và báo cáo hỏng/mất thiết bị.</p>
      </div>
      <div class="page-actions">
        ${button('inventory-incidents-report', incidentCount ? `Báo cáo hỏng / mất (${number(incidentCount)})` : 'Báo cáo hỏng / mất', 'flag', 'secondary')}
        ${canManage ? button('inventory-new', 'Thêm trang bị') : ''}
      </div>
    </div>

    <div class="stats-grid inventory-kpi-grid">
      <section class="stat">
        <div><span>Danh mục trang bị</span></div>
        <strong class="tabular-nums">${number(summary.total_items ?? total)}</strong>
      </section>
      <section class="stat ${lowStockCount > 0 ? 'stat-expense' : 'stat-income'}">
        <div><span>Cảnh báo tồn thấp</span></div>
        <strong class="tabular-nums">${number(lowStockCount)}</strong>
      </section>
      <section class="stat">
        <div><span>Sự cố hỏng / mất</span></div>
        <strong class="tabular-nums">${number(incidentCount)}</strong>
      </section>
    </div>

    <section class="panel">
      <form class="filters" data-form="inventory-filter">
        <label>Tìm trang bị <input name="search" placeholder="Nhập tên trang bị" value="${e(search)}"></label>
        <label><input name="low_stock" type="checkbox" value="1" ${lowStock ? 'checked' : ''}> Sắp hết</label>
        <label><input name="archived" type="checkbox" value="1" ${archived ? 'checked' : ''}> Đã lưu trữ</label>
        <button class="button secondary">Xem</button>
      </form>
      ${
        data.length
          ? `<div class="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Trang bị</th>
                    <th class="text-right">Số lượng còn</th>
                    <th>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  ${data
                    .map(
                      (item) => `
                    <tr>
                      <td>
                        <strong>${e(item.name)}</strong>
                        ${item.category ? `<br><small>${e(item.category)}</small>` : ''}
                      </td>
                      <td class="text-right tabular-nums font-bold">
                        ${number(item.quantity)} ${e(item.unit)}
                        ${item.quantity <= item.low_stock_threshold ? ' · <span class="badge injured">Tồn thấp</span>' : ''}
                      </td>
                      <td>
                        ${
                          canManage
                            ? item.archived
                              ? `<button class="text-button" data-action="inventory-restore" data-id="${item.id}">Khôi phục</button>`
                              : `<button class="text-button" data-action="inventory-move" data-id="${item.id}">Nhập / xuất</button> <button class="text-button danger" data-action="inventory-incident" data-id="${item.id}">Báo hỏng / mất</button> <button class="text-button" data-action="inventory-edit" data-id="${item.id}">Sửa</button> `
                            : ''
                        }
                        <details class="inventory-more">
                          <summary>Chi tiết</summary>
                          <p>Loại: ${item.kind === 'asset' ? 'Tài sản' : 'Tiêu hao'} · Cảnh báo khi còn ${number(item.low_stock_threshold)} ${e(item.unit)}</p>
                          ${item.notes ? `<p>Ghi chú: ${e(item.notes)}</p>` : ''}
                          <button class="text-button" data-action="inventory-history" data-id="${item.id}">Lịch sử</button>
                          ${item.kind === 'asset' ? ` <button class="text-button" data-action="inventory-assignments" data-id="${item.id}">Cấp phát / thu hồi</button>` : ''}
                          ${canManage && !item.archived ? ` <button class="text-button" data-action="inventory-archive" data-id="${item.id}">Lưu trữ</button>` : ''}
                        </details>
                      </td>
                    </tr>`
                    )
                    .join('')}
                </tbody>
              </table>
            </div>
            <div class="table-footer">
              <span>${number(total)} trang bị</span>
              <div>
                <button class="icon-button" data-action="inventory-prev" aria-label="Trang trước" ${current_page <= 1 ? 'disabled' : ''}>←</button>
                ${current_page} / ${last_page}
                <button class="icon-button" data-action="inventory-next" aria-label="Trang sau" ${current_page >= last_page ? 'disabled' : ''}>→</button>
              </div>
            </div>`
          : empty(
              'Chưa có trang bị phù hợp',
              canManage
                ? 'Thêm trang bị hoặc thay đổi bộ lọc.'
                : 'Hãy thay đổi bộ lọc để tìm trang bị.'
            )
      }
    </section>
  `;
}
