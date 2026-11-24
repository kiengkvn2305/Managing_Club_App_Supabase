import { state as s, currentClub } from './state.js';
import { escapeHtml as e, number, formatMonth } from './utils.js';
import { button, empty } from './components/ui.js';

export function plannedExpensesPanel() {
  const items = s.plannedExpenses || [], canEdit = currentClub()?.can_manage_finance;
  return `<section class="panel"><div class="panel-head"><div><h2>Khoản chi dự kiến hằng tháng</h2><p>Các khoản lặp lại để lập kế hoạch; không tự ghi chi hoặc trừ số dư.</p></div>${canEdit ? button('new-planned-expense', 'Thêm khoản dự kiến') : ''}</div>${items.length ? `<div class="table-wrap"><table><thead><tr><th>Tháng</th><th>Nội dung</th><th>Số tiền dự kiến</th><th>Ghi chú</th>${canEdit ? '<th>Thao tác</th>' : ''}</tr></thead><tbody>${items.map((item) => `<tr><td class="tabular-nums">${e(formatMonth(item.month))}</td><td>${e(item.description)}</td><td>${item.amount == null ? 'Chưa xác định' : `${e(number(item.amount))} đ`}</td><td>${e(item.notes || '—')}</td>${canEdit ? `<td><button class="text-button" data-action="edit-planned-expense" data-id="${item.id}" data-month="${e(item.month)}">Sửa từ tháng này</button><button class="text-button danger" data-action="stop-planned-expense" data-id="${item.id}" data-month="${e(item.month)}">Dừng từ tháng này</button></td>` : ''}</tr>`).join('')}</tbody></table></div>` : empty('Chưa có khoản chi dự kiến', 'Thêm khoản lặp lại như tiền sân hoặc trang thiết bị.')}</section>`;
}
