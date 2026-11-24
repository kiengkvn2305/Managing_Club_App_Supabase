import { formatDate, formatMonth, formatVietnamDateTime, escapeHtml as e, number } from './utils.js';
import { state as s, currentClub } from './state.js';
import { button, empty, icon } from './components/ui.js';
import { plannedExpensesPanel } from './planned-expenses.js';

const money = (value) => `${number(value || 0)} đ`;

function compactMoney(value) {
  const n = Math.abs(Number(value) || 0);
  const sign = Number(value) < 0 ? '-' : '';
  if (n === 0) return '0';
  if (n >= 1_000_000_000) {
    const v = (n / 1_000_000_000).toFixed(n % 1_000_000_000 === 0 ? 0 : 1).replace('.', ',');
    return `${sign}${v} tỷ`;
  }
  if (n >= 1_000_000) {
    const v = (n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1).replace('.', ',');
    return `${sign}${v} tr`;
  }
  if (n >= 10_000) {
    const v = Math.round(n / 1_000);
    return `${sign}${number(v)}k`;
  }
  return `${sign}${number(Math.round(n))} đ`;
}

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
    return empty('Chưa có dữ liệu biểu đồ', 'Các khoản thu chi phát sinh trong kỳ sẽ được tổng hợp trực quan tại đây.');
  }

  const points = new Map();
  for (const row of chart) {
    const v = points.get(row.period) || { income: 0, expense: 0 };
    v[row.type] = Number(row.total) || 0;
    points.set(row.period, v);
  }

  const entries = [];
  const [year, month] = (s.financeMonth || '2026-01').split('-').map(Number);
  const isYear = s.financePeriod === 'year';
  const count = isYear ? 12 : new Date(year, month, 0).getDate();

  for (let i = 1; i <= count; i++) {
    const n = String(i).padStart(2, '0');
    const key = isYear ? `${s.financeYear}-${n}` : `${s.financeMonth}-${n}`;
    entries.push([key, points.get(key) || { income: 0, expense: 0 }]);
  }

  const totalIncome = entries.reduce((sum, [, v]) => sum + v.income, 0);
  const totalExpense = entries.reduce((sum, [, v]) => sum + v.expense, 0);
  const netFlow = totalIncome - totalExpense;
  const activeEntries = entries.filter(([, v]) => v.income > 0 || v.expense > 0);

  const width = 880;
  const height = 296;
  const left = 84;
  const right = 856;
  const top = 26;
  const bottom = 242;
  const plotWidth = right - left;
  const plotHeight = bottom - top;

  const highest = Math.max(1, ...entries.flatMap(([, v]) => [v.income, v.expense]));
  const power = 10 ** Math.floor(Math.log10(highest));
  const scaled = highest / power;
  const ceiling = (scaled <= 1 ? 1 : scaled <= 2 ? 2 : scaled <= 2.5 ? 2.5 : scaled <= 5 ? 5 : 10) * power;

  const slotWidth = plotWidth / Math.max(1, entries.length);
  const barWidth = isYear
    ? Math.min(20, Math.max(10, slotWidth * 0.32))
    : Math.min(10, Math.max(5, slotWidth * 0.36));
  const barGap = isYear ? 4 : 2;

  const y = (value) => bottom - (value / ceiling) * plotHeight;

  const grid = Array.from({ length: 5 }, (_, i) => {
    const value = (ceiling * i) / 4;
    const pos = y(value);
    return `
      <line x1="${left}" x2="${right}" y1="${pos}" y2="${pos}" class="finance-chart-grid ${i === 0 ? 'baseline' : ''}"/>
      <text x="${left - 12}" y="${pos + 4}" text-anchor="end" class="finance-axis-text">${e(compactMoney(value))}</text>
    `;
  }).join('');

  // Find peak income and expense index for subtle callout
  let peakVal = 0;
  let peakIndex = -1;
  entries.forEach(([, v], idx) => {
    const m = Math.max(v.income, v.expense);
    if (m > peakVal) {
      peakVal = m;
      peakIndex = idx;
    }
  });

  const bars = entries
    .map(([period, v], i) => {
      const centerX = left + slotWidth * (i + 0.5);
      const hasActivity = v.income > 0 || v.expense > 0;
      const diff = v.income - v.expense;
      const periodLabel = isYear ? `Tháng ${formatMonth(period)}` : formatDate(period);
      const tooltip = `${periodLabel} · Thu: ${money(v.income)} · Chi: ${money(v.expense)} · Chênh lệch: ${diff > 0 ? '+' : ''}${money(diff)}`;

      const incH = v.income > 0 ? Math.max(5, bottom - y(v.income)) : 0;
      const expH = v.expense > 0 ? Math.max(5, bottom - y(v.expense)) : 0;

      const incX = v.income > 0 && v.expense > 0 ? centerX - barWidth - barGap / 2 : centerX - barWidth / 2;
      const expX = v.income > 0 && v.expense > 0 ? centerX + barGap / 2 : centerX - barWidth / 2;

      const showTick =
        isYear ||
        i === 0 ||
        i === entries.length - 1 ||
        (i + 1) % 5 === 0 ||
        (hasActivity && entries.length <= 31 && i > 1 && i < entries.length - 2 && (i + 1) % 5 !== 1 && (i + 1) % 5 !== 4);

      const tickLabel = isYear ? `T${Number(period.slice(-2))}` : period.slice(-2);

      const peakTag =
        i === peakIndex && peakVal > 0
          ? `<text x="${centerX}" y="${Math.max(14, Math.min(y(v.income || 0), y(v.expense || 0)) - 8)}" text-anchor="middle" class="finance-peak-label">${e(compactMoney(peakVal))}</text>`
          : '';

      return `
        <g class="finance-bar-group ${hasActivity ? 'is-active' : ''}">
          <rect x="${left + slotWidth * i}" y="${top}" width="${slotWidth}" height="${plotHeight}" class="finance-slot-hit">
            <title>${e(tooltip)}</title>
          </rect>
          ${
            hasActivity
              ? ''
              : `<line x1="${centerX}" x2="${centerX}" y1="${bottom - 3}" y2="${bottom}" class="finance-zero-tick"/>`
          }
          ${
            incH > 0
              ? `<rect x="${incX}" y="${bottom - incH}" width="${barWidth}" height="${incH}" rx="3.5" class="finance-bar income"><title>${e(periodLabel)} · Thu: ${e(money(v.income))}</title></rect>`
              : ''
          }
          ${
            expH > 0
              ? `<rect x="${expX}" y="${bottom - expH}" width="${barWidth}" height="${expH}" rx="3.5" class="finance-bar expense"><title>${e(periodLabel)} · Chi: ${e(money(v.expense))}</title></rect>`
              : ''
          }
          ${peakTag}
          ${
            showTick
              ? `<text x="${centerX}" y="266" text-anchor="middle" class="finance-tick-text ${hasActivity ? 'active' : ''}">${e(tickLabel)}</text>`
              : ''
          }
        </g>
      `;
    })
    .join('');

  return `
    <div class="finance-chart-header">
      <div class="finance-chart-legend">
        <span class="legend-chip income"><i class="swatch"></i> Thu trong kỳ: <strong>${e(money(totalIncome))}</strong></span>
        <span class="legend-chip expense"><i class="swatch"></i> Chi trong kỳ: <strong>${e(money(totalExpense))}</strong></span>
        <span class="legend-chip net ${netFlow >= 0 ? 'positive' : 'negative'}">Dòng tiền ròng: <strong>${netFlow > 0 ? '+' : ''}${e(money(netFlow))}</strong></span>
      </div>
      <small class="finance-chart-meta">Có giao dịch ở <strong>${activeEntries.length}</strong> / ${entries.length} ${isYear ? 'tháng' : 'ngày'} · Rê chuột vào cột để xem chi tiết</small>
    </div>
    <div class="finance-chart-scroll">
      <svg class="finance-line-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Biểu đồ cột thu chi theo ${isYear ? 'tháng' : 'ngày'}, đơn vị đồng">
        <defs>
          <linearGradient id="fin-grad-income" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#34e8a6"/>
            <stop offset="100%" stop-color="#0d9467"/>
          </linearGradient>
          <linearGradient id="fin-grad-expense" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#fb923c"/>
            <stop offset="100%" stop-color="#e11d48"/>
          </linearGradient>
        </defs>
        ${grid}
        ${bars}
        <text x="${right}" y="288" text-anchor="end" class="finance-axis-caption">${isYear ? 'Tháng trong năm' : 'Ngày trong tháng'}</text>
      </svg>
    </div>
    <details class="finance-chart-details">
      <summary>Xem bảng số liệu chi tiết (${activeEntries.length} kỳ phát sinh)</summary>
      <div class="table-wrap">
        <table>
          <thead>
            <tr><th>Thời gian</th><th class="text-right">Thu</th><th class="text-right">Chi</th><th class="text-right">Chênh lệch</th></tr>
          </thead>
          <tbody>
            ${entries
              .filter(([, v]) => v.income > 0 || v.expense > 0)
              .map(([p, v]) => {
                const d = v.income - v.expense;
                const label = isYear ? formatMonth(p) : formatDate(p);
                return `<tr><td class="tabular-nums"><strong>${e(label)}</strong></td><td class="text-right tabular-nums text-green">${e(money(v.income))}</td><td class="text-right tabular-nums text-red">${e(money(v.expense))}</td><td class="text-right tabular-nums font-bold">${d > 0 ? '+' : ''}${e(money(d))}</td></tr>`;
              })
              .join('')}
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
        ['Tổng thu trong kỳ', money(summary.income), 'arrow', 'stat-income'],
        ['Tổng chi trong kỳ', money(summary.expense), 'layers', 'stat-expense'],
        ['Còn lại đến cuối kỳ', money(summary.remaining), 'shield', 'stat-balance'],
        [`Chênh lệch so với ${s.financePeriod === 'year' ? 'năm' : 'tháng'} trước`, change, 'trophy', summary.change < 0 ? 'stat-expense' : 'stat-income'],
      ]
        .map(
          ([label, value, glyph, tone]) => `
        <section class="stat ${tone}">
          <div><span>${e(label)}</span><i>${icon(glyph)}</i></div>
          <strong class="tabular-nums">${e(value)}</strong>
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
                  <td class="text-center tabular-nums">${e(formatMonth(a.month))}</td>
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
