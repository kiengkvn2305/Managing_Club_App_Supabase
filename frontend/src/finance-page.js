import { formatDate, formatVietnamDateTime } from './utils.js';
import { state as s, currentClub } from './state.js';
import { escapeHtml as e, number } from './utils.js';
import { button, empty } from './components/ui.js';
import { plannedExpensesPanel } from './planned-expenses.js';

const money = (value) => `${number(value || 0)} đ`;

const pagination = (meta, prefix) => `
  <div class="table-footer">
    <span>${number(meta.total || 0)} mục</span>
    <div>
      <button class="icon-button" data-action="${prefix}-prev" aria-label="Trang trước" ${meta.current_page <= 1 ? 'disabled' : ''}>←</button>
      ${meta.current_page || 1} / ${meta.last_page || 1}
      <button class="icon-button" data-action="${prefix}-next" aria-label="Trang sau" ${meta.current_page >= meta.last_page ? 'disabled' : ''}>→</button>
    </div>
  </div>
`;

function chartMarkup(chart) {
  if (!chart.length) {
    return empty('Chưa có dữ liệu', 'Các khoản thu chi trong kỳ sẽ xuất hiện trên biểu đồ.');
  }

  const points = new Map();
  for (const row of chart) {
    const v = points.get(row.period) || { income: 0, expense: 0 };
    v[row.type] = Number(row.total);
    points.set(row.period, v);
  }

  const entries = [];
  const [year, month] = s.financeMonth.split('-').map(Number);
  const count = s.financePeriod === 'year' ? 12 : new Date(year, month, 0).getDate();

  for (let i = 1; i <= count; i++) {
    const n = String(i).padStart(2, '0');
    const key = s.financePeriod === 'year' ? `${s.financeYear}-${n}` : `${s.financeMonth}-${n}`;
    entries.push([key, points.get(key) || { income: 0, expense: 0 }]);
  }

  const width = 840;
  const height = 300;
  const left = 116;
  const right = 810;
  const top = 30;
  const bottom = 244;

  const highest = Math.max(1, ...entries.flatMap(([, v]) => [v.income, v.expense]));
  const power = 10 ** Math.floor(Math.log10(highest));
  const scaled = highest / power;
  const ceiling = (scaled <= 1 ? 1 : scaled <= 2 ? 2 : scaled <= 5 ? 5 : 10) * power;

  const x = (i) => left + ((right - left) * i) / Math.max(1, entries.length - 1);
  const y = (value) => bottom - (value / ceiling) * (bottom - top);

  const grid = Array.from({ length: 5 }, (_, i) => {
    const value = (ceiling * i) / 4;
    const position = y(value);
    return `<line x1="${left}" x2="${right}" y1="${position}" y2="${position}" class="finance-chart-grid"/><text x="${left - 12}" y="${position + 4}" text-anchor="end">${e(money(Math.round(value)))}</text>`;
  }).join('');

  const lines = ['income', 'expense']
    .map(
      (type) => `
    <polyline class="finance-chart-line ${type}" points="${entries.map(([, v], i) => `${x(i)},${y(v[type])}`).join(' ')}"/>
    ${entries
      .map(
        ([period, v], i) => `
      <circle class="finance-chart-point ${type}" cx="${x(i)}" cy="${y(v[type])}" r="3.5">
        <title>${e(period)} · ${type === 'income' ? 'Thu' : 'Chi'}: ${e(money(v[type]))}</title>
      </circle>`
      )
      .join('')}`
    )
    .join('');

  const ticks = entries
    .map(([period], i) =>
      s.financePeriod === 'year' || i === 0 || i === entries.length - 1 || (i + 1) % 5 === 0
        ? `<text x="${x(i)}" y="270" text-anchor="middle">${e(period.slice(-2))}</text>`
        : ''
    )
    .join('');

  return `
    <div class="finance-chart-scroll">
      <svg class="finance-line-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Biểu đồ đường thu chi theo ${s.financePeriod === 'year' ? 'tháng' : 'ngày'}, đơn vị đồng">
        <text x="${left}" y="15">Số tiền (đ)</text>
        ${grid}
        ${lines}
        ${ticks}
        <text x="${right}" y="292" text-anchor="end">${s.financePeriod === 'year' ? 'Tháng' : 'Ngày'}</text>
      </svg>
    </div>
    <div class="finance-chart-legend">
      <span>● Thu</span>
      <span>● Chi</span>
    </div>
    <details>
      <summary>Xem số liệu biểu đồ</summary>
      <div class="table-wrap">
        <table>
          <thead>
            <tr><th>Thời gian</th><th class="text-right">Thu</th><th class="text-right">Chi</th></tr>
          </thead>
          <tbody>
            ${entries.map(([p, v]) => `<tr><td class="tabular-nums">${e(p)}</td><td class="text-right tabular-nums">${e(money(v.income))}</td><td class="text-right tabular-nums">${e(money(v.expense))}</td></tr>`).join('')}
          </tbody>
        </table>
      </div>
    </details>
  `;
}

export function financePage() {
  if (!currentClub()?.can_view_finance) {
    return `
      <div class="page-top">
        <div>
          <div class="eyebrow">KHÔNG GIAN CÂU LẠC BỘ</div>
          <h1>Sổ thu chi CLB</h1>
          <p>Thông tin được bảo vệ theo quyền truy cập.</p>
        </div>
      </div>
      <section class="panel">
        ${empty('Quyền truy cập được bảo vệ', 'Bạn không có quyền xem sổ thu chi.')}
      </section>
    `;
  }

  const ledger = s.finance;
  const summary = ledger.summary || {};
  const meta = ledger.meta || {};
  const adjustments = ledger.adjustments || { data: [], meta: {} };
  const change =
    summary.change == null
      ? '—'
      : `${summary.change > 0 ? '+' : ''}${money(summary.change)}`;
  const status = { unpaid: 'Chưa đóng', paid: 'Đã đóng', exempt: 'Miễn đóng' };

  return `
    <div class="page-top">
      <div>
        <div class="eyebrow">KHÔNG GIAN CÂU LẠC BỘ</div>
        <h1>Sổ thu chi CLB</h1>
        <p>Theo dõi dòng tiền và số dư của câu lạc bộ.</p>
      </div>
      <div class="page-actions">
        ${button('export-finance', 'Xuất Excel', 'arrow', 'secondary')}
        ${currentClub()?.can_manage_finance ? button('new-finance', 'Ghi thu chi') : ''}
      </div>
    </div>

    <section class="panel">
      <form class="filters" data-form="finance-filter">
        <label>Xem theo
          <select name="period" data-finance-period>
            <option value="month" ${s.financePeriod === 'month' ? 'selected' : ''}>Tháng</option>
            <option value="year" ${s.financePeriod === 'year' ? 'selected' : ''}>Năm</option>
          </select>
        </label>
        <label data-finance-month ${s.financePeriod === 'year' ? 'hidden' : ''}>Tháng
          <input type="month" name="month" value="${e(s.financeMonth)}" required>
        </label>
        <label data-finance-year ${s.financePeriod === 'month' ? 'hidden' : ''}>Năm
          <input type="number" name="year" min="1901" max="9998" value="${e(s.financeYear)}" required>
        </label>
        <button class="button secondary">Xem</button>
      </form>
    </section>

    <div class="stats-grid">
      ${[
        ['Tổng thu trong kỳ', money(summary.income)],
        ['Tổng chi trong kỳ', money(summary.expense)],
        ['Còn lại đến cuối kỳ', money(summary.remaining)],
        [`Chênh lệch so với ${s.financePeriod === 'year' ? 'năm' : 'tháng'} trước`, change],
      ]
        .map(
          ([label, value]) => `
        <section class="stat">
          <div><span>${e(label)}</span></div>
          <strong>${e(value)}</strong>
        </section>`
        )
        .join('')}
    </div>

    ${plannedExpensesPanel()}

    <section class="panel">
      <div class="panel-head">
        <div>
          <h2>Biến động thu chi</h2>
          <p>${s.financePeriod === 'year' ? 'Theo từng tháng trong năm' : 'Theo từng ngày trong tháng'} · Chênh lệch là (thu − chi) kỳ này so với kỳ trước.</p>
        </div>
      </div>
      <div class="panel-body">
        ${chartMarkup(ledger.chart || [])}
      </div>
    </section>

    <section class="panel">
      <div class="panel-head">
        <h2>Khoản thu chi</h2>
      </div>
      ${
        ledger.data?.length
          ? `
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Ngày</th>
                <th>Nội dung</th>
                <th>Danh mục</th>
                <th>Người thu / chi</th>
                <th>Ghi chú</th>
                <th class="text-center">Loại</th>
                <th class="text-right">Số tiền</th>
                <th class="text-center">Ảnh xác nhận</th>
              </tr>
            </thead>
            <tbody>
              ${ledger.data
                .map(
                  (item) => `
                <tr>
                  <td class="tabular-nums">${e(formatDate(item.occurred_on))}</td>
                  <td><strong>${e(item.description)}</strong></td>
                  <td>${e(item.category || '—')}</td>
                  <td>${e(item.paid_by || '—')}</td>
                  <td class="truncate" style="max-width:180px;" title="${e(item.notes || '')}">${e(item.notes || '—')}</td>
                  <td class="text-center"><span class="badge ${item.type === 'income' ? 'active' : 'injured'}">${item.type === 'income' ? 'Thu' : 'Chi'}</span></td>
                  <td class="text-right tabular-nums font-bold">${e(money(item.amount))}</td>
                  <td class="text-center">${item.receipt_url ? `<a class="text-link" href="${e(item.receipt_url)}" target="_blank" rel="noopener noreferrer">Xem ảnh</a>` : '—'}</td>
                </tr>`
                )
                .join('')}
            </tbody>
          </table>
        </div>
        ${pagination(meta, 'finance')}
      `
          : empty('Chưa có khoản thu chi', 'Không có khoản nào trong kỳ đã chọn.')
      }
    </section>

    <section class="panel">
      <div class="panel-head">
        <div>
          <h2>Điều chỉnh trạng thái quỹ</h2>
          <p>Các lần điều chỉnh được ghi theo ngày sửa; khoản thu gốc đã được cập nhật, nên không cộng thêm lần nữa.</p>
        </div>
      </div>
      ${
        adjustments.data?.length
          ? `
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Ngày điều chỉnh</th>
                <th>Thành viên</th>
                <th>Đội</th>
                <th class="text-center">Tháng quỹ</th>
                <th class="text-center">Thay đổi</th>
                <th class="text-right">Số tiền</th>
                <th>Lý do</th>
              </tr>
            </thead>
            <tbody>
              ${adjustments.data
                .map(
                  (a) => `
                <tr>
                  <td class="tabular-nums">${e(formatVietnamDateTime(a.created_at))}</td>
                  <td><strong>${e(a.player_name || '—')}</strong></td>
                  <td>${e(a.team_name || '—')}</td>
                  <td class="text-center tabular-nums">${e(a.month.slice(0, 7))}</td>
                  <td class="text-center">${e(status[a.old_status] || a.old_status)} → ${e(status[a.new_status] || a.new_status)}</td>
                  <td class="text-right tabular-nums font-bold">${e(money(a.amount))}</td>
                  <td>${e(a.reason)}</td>
                </tr>`
                )
                .join('')}
            </tbody>
          </table>
        </div>
        ${pagination(adjustments.meta, 'finance-adjust')}
      `
          : empty('Chưa có điều chỉnh', 'Các lần sửa trạng thái quỹ trong kỳ sẽ hiển thị tại đây.')
      }
    </section>
  `;
}
