export function createFinanceController(ctx) {
  async function handleAction(a, el) {
    if (a === 'new-finance' && ctx.currentClub()?.can_manage_finance) {
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
            if (
              !/^[1-9]\d*$/.test(data.amount) ||
              Number(data.amount) > 1000000000000
            ) {
              throw new Error(
                'Số tiền phải là số nguyên từ 1 đến 1.000.000.000.000 đồng.'
              );
            }
            const upload = new FormData(form);
            if (!form.elements.receipt.files.length) upload.delete('receipt');
            await ctx.api.post(ctx.base('/finance'), upload);
            ctx.state.financePage = 1;
            await ctx.loadView();
            ctx.toast('Đã ghi khoản thu chi.');
          })
      );
    }

    if (a === 'export-finance' && ctx.currentClub()?.can_view_finance) {
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
      ) &&
      ctx.currentClub()?.can_manage_finance
    ) {
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
          `Khoản ${ctx.e(item.description)} sẽ dừng từ ${ctx.e(month)}; các tháng trước vẫn giữ nguyên.`,
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
