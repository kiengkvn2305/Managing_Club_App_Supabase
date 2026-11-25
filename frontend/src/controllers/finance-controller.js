import { formatMonth, formatVietnamDateTime } from '../utils.js';

export function createFinanceController(ctx) {
  async function openFinancialPeriodsModal() {
    const canManage = Boolean(ctx.currentClub()?.can_manage_finance);
    const renderModal = async () => {
      const res = await ctx.api.get(ctx.base('/finance/periods'));
      const periods = res.data || [];
      const host = document.createElement('dialog');
      host.setAttribute('aria-label', 'Kỳ kế toán CLB');

      const rows = periods
        .map(
          (p) => `
        <tr>
          <td class="tabular-nums"><strong>${ctx.e(ctx.formatDate(p.starts_on))}</strong> → <strong>${ctx.e(ctx.formatDate(p.ends_on))}</strong></td>
          <td class="text-center">
            ${
              p.closed_at
                ? `<span class="badge injured">Đã khóa sổ (${ctx.e(formatVietnamDateTime(p.closed_at))})</span>`
                : '<span class="badge active">Đang mở</span>'
            }
          </td>
          <td class="text-right">
            ${
              !p.closed_at && canManage
                ? `<button type="button" class="text-button danger" data-close-period="${p.id}">Khóa sổ kỳ này</button>`
                : '—'
            }
          </td>
        </tr>`
        )
        .join('');

      host.innerHTML = `
        <div class="dialog-head">
          <div>
            <h2>Kỳ kế toán & Khóa sổ</h2>
            <p>Khi khóa sổ một kỳ kế toán, mọi giao dịch nằm trong khoảng ngày đã khóa sẽ được bảo vệ chống ghi đè hoặc đảo bút toán.</p>
          </div>
          <button type="button" class="icon-button" data-close aria-label="Đóng">×</button>
        </div>
        <div class="dialog-body">
          ${canManage ? '<div style="margin-bottom:12px;"><button type="button" class="button" data-new-period>Tạo kỳ kế toán mới</button></div>' : ''}
          ${
            rows
              ? `<div class="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Khoảng thời gian</th>
                        <th class="text-center">Trạng thái</th>
                        <th class="text-right">Thao tác</th>
                      </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                  </table>
                </div>`
              : '<p class="muted">Chưa có kỳ kế toán nào được khởi tạo. Mặc định sổ thu chi đang mở tự do.</p>'
          }
        </div>
      `;

      document.body.append(host);
      host.querySelector('[data-close]').onclick = () => host.close();
      const reopen = async () => {
        host.close();
        await renderModal();
      };

      host.querySelector('[data-new-period]')?.addEventListener('click', () => {
        const fromDefault = ctx.state.financeFrom || `${ctx.vietnamToday().slice(0, 7)}-01`;
        const toDefault = ctx.state.financeTo || ctx.vietnamToday();
        ctx.dialog(
          'Tạo kỳ kế toán mới',
          'Chọn ngày bắt đầu và ngày kết thúc của kỳ kế toán.',
          ctx.field('starts_on', 'Từ ngày', fromDefault, 'date', true) +
            ctx.field('ends_on', 'Đến ngày', toDefault, 'date', true),
          (form) =>
            ctx.submit(form, 'finance-period', async (data) => {
              if (data.ends_on < data.starts_on) {
                throw new Error('Ngày kết thúc phải lớn hơn hoặc bằng ngày bắt đầu.');
              }
              await ctx.api.post(ctx.base('/finance/periods'), {
                starts_on: data.starts_on,
                ends_on: data.ends_on,
              });
              ctx.toast('Đã tạo kỳ kế toán.');
              await reopen();
            }),
          'Tạo kỳ'
        );
      });

      host.querySelectorAll('[data-close-period]').forEach((btn) =>
        btn.addEventListener('click', () => {
          const periodId = btn.dataset.closePeriod;
          ctx.dialog(
            'Khóa sổ kỳ kế toán?',
            'Sau khi khóa sổ, không ai có thể ghi thêm hoặc đảo giao dịch trong khoảng ngày của kỳ này.',
            '',
            (form) =>
              ctx.submit(
                form,
                'close-finance-period',
                async () => {
                  await ctx.api.post(ctx.base(`/finance/periods/${periodId}/close`), {});
                  ctx.toast('Đã khóa sổ kỳ kế toán thành công.');
                  await reopen();
                },
                'Xác nhận khóa sổ'
              )
          );
        })
      );

      host.addEventListener('close', () => host.remove(), { once: true });
      host.showModal();
    };

    await renderModal();
    return true;
  }

  async function handleAction(a, el) {
    if (a === 'manage-finance-periods') {
      if (!ctx.requirePermission(ctx.currentClub()?.can_view_finance, 'Xem kỳ kế toán')) return true;
      return openFinancialPeriodsModal();
    }

    if (a === 'reverse-finance') {
      if (!ctx.requirePermission(ctx.currentClub()?.can_manage_finance, 'Đảo bút toán thu chi')) return true;
      const txId = el.dataset.id;
      const desc = el.dataset.desc || `#${txId}`;
      return ctx.dialog(
        'Đảo bút toán giao dịch?',
        `Giao dịch "${ctx.e(desc)}" sẽ được chuyển sang trạng thái Đã đảo và hệ thống tự sinh bút toán đối ứng để bảo toàn lịch sử kiểm toán.`,
        ctx.field('reason', 'Lý do đảo bút toán', '', 'textarea', true),
        (form) =>
          ctx.submit(
            form,
            'finance-reversal',
            async (data) => {
              if (!data.reason?.trim()) {
                throw new Error('Vui lòng nhập lý do đảo bút toán.');
              }
              const key =
                form.dataset.idempotencyKey ||
                (form.dataset.idempotencyKey = crypto.randomUUID());
              await ctx.api.post(ctx.base(`/finance/transactions/${txId}/reversal`), {
                reason: data.reason.trim(),
                idempotency_key: key,
              });
              await ctx.loadView();
              ctx.toast('Đã đảo bút toán giao dịch thành công.');
            },
            'Xác nhận đảo bút toán'
          )
      );
    }
    if (a === 'new-finance') {
      if (!ctx.requirePermission(ctx.currentClub()?.can_manage_finance, 'Ghi khoản thu chi')) return true;
      const today = new Date();
      const date = ctx.vietnamToday(today);
      return ctx.dialog(
        'Ghi khoản thu chi',
        'Nhập số tiền bằng đồng Việt Nam. Có thể chọn hoặc chụp ảnh xác nhận (JPG, PNG, WEBP tối đa 5 MB).',
        ctx.select(
          'type',
          'Loại khoản',
          [
            ['income', 'Thu'],
            ['expense', 'Chi'],
          ],
          'income'
        ) +
          ctx
            .field('amount', 'Số tiền (đồng)', '', 'number', true)
            .replace('min="0" max="999"', 'min="1" max="1000000000000"') +
          ctx.field('occurred_on', 'Ngày', date, 'date', true) +
          ctx.field('description', 'Nội dung', '', 'text', true) +
          ctx.field('category', 'Danh mục', '') +
          ctx.field('paid_by', 'Người thu / chi', '') +
          ctx.field('notes', 'Ghi chú / chứng từ', '', 'textarea') +
          '<div class="field"><label for="f-receipt">Ảnh xác nhận (không bắt buộc)</label><input id="f-receipt" name="receipt" type="file" accept="image/jpeg,image/png,image/webp"><small data-error="receipt"></small></div>',
        (form) =>
          ctx.submit(form, 'finance', async (data) => {
            const cleanAmount = String(data.amount || '').replace(/[,. \s]/g, '');
            if (
              !/^[1-9]\d*$/.test(cleanAmount) ||
              Number(cleanAmount) > 1000000000000
            ) {
              throw new Error(
                'Số tiền phải là số nguyên từ 1 đến 1.000.000.000.000 đồng.'
              );
            }
            const upload = new FormData(form);
            upload.set('amount', cleanAmount);
            upload.set(
              'idempotency_key',
              form.dataset.idempotencyKey || (form.dataset.idempotencyKey = crypto.randomUUID())
            );
            if (!form.elements.receipt?.files?.length) upload.delete('receipt');
            await ctx.api.post(ctx.base('/finance'), upload);
            ctx.state.financePage = 1;
            await ctx.loadView();
            ctx.toast('Đã ghi khoản thu chi.');
          })
      );
    }

    if (a === 'export-finance') {
      if (!ctx.requirePermission(ctx.currentClub()?.can_view_finance, 'Xuất sổ thu chi')) return true;
      const rows = [];
      const adjustments = [];
      let pageNumber = 1;
      let lastPage = 1;
      let summary = {};
      let firstAdjustments;

      do {
        const query = new URLSearchParams({
          page: pageNumber,
          per_page: 100,
          ...(ctx.state.financeFrom ? { from: ctx.state.financeFrom } : {}),
          ...(ctx.state.financeTo ? { to: ctx.state.financeTo } : {}),
        });
        const result = await ctx.api.get(ctx.base(`/finance?${query}`));
        rows.push(...result.data);
        lastPage = result.meta.last_page;
        summary = result.summary;
        if (pageNumber === 1) firstAdjustments = result.adjustments;
        pageNumber++;
      } while (pageNumber <= lastPage);

      if (firstAdjustments) {
        adjustments.push(...firstAdjustments.data);
        for (let page = 2; page <= firstAdjustments.meta.last_page; page++) {
          const query = new URLSearchParams({
            adjustment_page: page,
            per_page: 1,
            ...(ctx.state.financeFrom ? { from: ctx.state.financeFrom } : {}),
            ...(ctx.state.financeTo ? { to: ctx.state.financeTo } : {}),
          });
          const result = await ctx.api.get(ctx.base(`/finance?${query}`));
          adjustments.push(...result.adjustments.data);
        }
      }

      await ctx.exportFinance(rows, summary, adjustments);
      ctx.toast('Đã xuất sổ thu chi.');
      return true;
    }

    if (
      ['new-planned-expense', 'edit-planned-expense', 'stop-planned-expense'].includes(
        a
      )
    ) {
      if (!ctx.requirePermission(ctx.currentClub()?.can_manage_finance, 'Quản lý khoản chi dự kiến')) return true;
      const item =
        a === 'new-planned-expense'
          ? null
          : ctx.state.plannedExpenses.find(
              (p) =>
                String(p.id) === el.dataset.id && p.month === el.dataset.month
            );
      if (a !== 'new-planned-expense' && !item) return true;

      const month = item?.month || ctx.state.financeFrom.slice(0, 7);

      if (a === 'stop-planned-expense') {
        return ctx.dialog(
          'Dừng khoản chi dự kiến?',
          `Khoản ${ctx.e(item.description)} sẽ dừng từ ${ctx.e(formatMonth(month))}; các tháng trước vẫn giữ nguyên.`,
          '',
          (form) =>
            ctx.submit(form, 'planned-stop', async () => {
              await ctx.api.delete(
                ctx.base(
                  `/finance/planned/${item.id}?${new URLSearchParams({ month })}`
                )
              );
              await ctx.loadView();
              ctx.toast('Đã dừng khoản dự kiến.');
            })
        );
      }

      const fields =
        ctx.field(
          'description',
          'Khoản dự kiến chi',
          item?.description || '',
          'text',
          true
        ) +
        ctx
          .field(
            'amount',
            'Số tiền dự kiến (đồng; có thể để trống)',
            item?.amount ?? '',
            'number'
          )
          .replace('min="0" max="999"', 'min="0" max="1000000000000"') +
        ctx.field(
          'month',
          item ? 'Áp dụng thay đổi từ tháng' : 'Bắt đầu từ tháng',
          month,
          'month',
          true
        ) +
        ctx.field('notes', 'Ghi chú', item?.notes || '', 'textarea');

      return ctx.dialog(
        item ? 'Sửa khoản chi dự kiến' : 'Thêm khoản chi dự kiến',
        'Khoản dự kiến lặp lại hằng tháng và không tự ghi chi vào sổ.',
        fields,
        (form) =>
          ctx.submit(form, 'planned-expense', async (data) => {
            const payload = {
              description: data.description,
              amount: data.amount === '' ? null : data.amount,
              month: data.month,
              notes: data.notes || null,
            };
            if (item) {
              await ctx.api.patch(
                ctx.base(`/finance/planned/${item.id}`),
                payload
              );
            } else {
              await ctx.api.post(ctx.base('/finance/planned'), payload);
            }
            await ctx.loadView();
            ctx.toast('Đã lưu khoản chi dự kiến.');
          })
      );
    }

    if (a === 'finance-prev' || a === 'finance-next') {
      ctx.state.financePage += a === 'finance-next' ? 1 : -1;
      await ctx.loadView();
      return true;
    }

    if (a === 'finance-adjust-prev' || a === 'finance-adjust-next') {
      ctx.state.financeAdjustmentPage += a === 'finance-adjust-next' ? 1 : -1;
      await ctx.loadView();
      return true;
    }

    return false;
  }

  return {
    handleAction,
  };
}
