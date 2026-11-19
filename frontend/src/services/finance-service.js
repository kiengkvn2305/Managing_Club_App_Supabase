import { check, page, numeric } from './service-helpers.js';
import { ledgerView, expandPlanned } from '../data-views.js';

export function createFinanceService({ supabase, authService }) {
  async function finance(clubId, params) {
    const from = params.get('from') || '';
    const to = params.get('to') || '9999-12-31';

    const rows =
      check(
        await supabase
          .from('finance_transactions')
          .select('*')
          .eq('club_id', clubId)
          .in('status', ['posted', 'reversed'])
          .lte('occurred_on', to)
          .order('occurred_on', { ascending: false })
      ) || [];

    const view = ledgerView(rows, from, to, params.get('group') || 'day');
    const result = page(
      view.data,
      params,
      Math.min(100, Number(params.get('per_page') || 20))
    );

    result.data = await Promise.all(
      result.data.map(async (row) => {
        if (!row.receipt_path) return { ...row, has_receipt: false };
        const signed = await supabase.storage
          .from('fcms-private')
          .createSignedUrl(row.receipt_path, 900);
        return {
          ...row,
          has_receipt: !signed.error,
          receipt_url: signed.data?.signedUrl || null,
        };
      })
    );

    const adjustments =
      check(
        await supabase
          .from('team_dues_adjustments')
          .select('*,player:player_profiles(full_name),team:teams(name)')
          .eq('club_id', clubId)
          .order('created_at', { ascending: false })
      ) || [];

    const ap = new URLSearchParams({
      page: params.get('adjustment_page') || '1',
    });

    return {
      ...result,
      summary: view.summary,
      chart: view.chart,
      adjustments: page(
        adjustments
          .filter(
            (x) =>
              x.created_at.slice(0, 10) >= from &&
              x.created_at.slice(0, 10) <= to
          )
          .map((x) => ({
            ...x,
            player_name: x.player?.full_name,
            team_name: x.team?.name,
          })),
        ap
      ),
    };
  }

  async function handleFinanceRequest(clean, method, data, params, clubId) {
    if (!clubId) return null;

    if (clean === `/clubs/${clubId}/finance/summary` && method === 'GET') {
      return {
        data: check(
          await supabase.rpc('finance_summary', {
            p_club_id: clubId,
            p_from: params.get('from'),
            p_to: params.get('to'),
          })
        ),
      };
    }

    if (clean === `/clubs/${clubId}/finance/periods` && method === 'POST') {
      return {
        data: check(
          await supabase.rpc('create_financial_period', {
            p_club_id: clubId,
            p_starts_on: data.starts_on,
            p_ends_on: data.ends_on,
          })
        ),
      };
    }

    const financePeriod = clean.match(/\/finance\/periods\/(\d+)\/close$/);
    if (financePeriod && method === 'POST') {
      return {
        data: check(
          await supabase.rpc('close_financial_period', {
            p_club_id: clubId,
            p_period_id: Number(financePeriod[1]),
          })
        ),
      };
    }

    const financeApproval = clean.match(
      /\/finance\/transactions\/(\d+)\/approval$/
    );
    if (financeApproval && method === 'POST') {
      const result = data.status
        ? await supabase.rpc('decide_finance_approval', {
            p_club_id: clubId,
            p_transaction_id: Number(financeApproval[1]),
            p_status: data.status,
            p_reason: data.reason || null,
          })
        : await supabase.rpc('request_finance_approval', {
            p_club_id: clubId,
            p_transaction_id: Number(financeApproval[1]),
          });
      return { data: check(result) };
    }

    const financeReversal = clean.match(
      /\/finance\/transactions\/(\d+)\/reversal$/
    );
    if (financeReversal && method === 'POST') {
      return {
        data: check(
          await supabase.rpc('reverse_finance_transaction', {
            p_club_id: clubId,
            p_transaction_id: Number(financeReversal[1]),
            p_reason: data.reason,
            p_idempotency_key: data.idempotency_key || null,
          })
        ),
      };
    }

    if (clean === `/clubs/${clubId}/finance/payments` && method === 'POST') {
      return {
        data: check(
          await supabase.rpc('post_finance_payment', {
            p_club_id: clubId,
            p_player_id: numeric(data.player_id),
            p_amount: Number(data.amount),
            p_paid_on: data.paid_on,
            p_external_ref: data.external_ref || null,
            p_allocations: data.allocations || [],
            p_idempotency_key: data.idempotency_key || null,
          })
        ),
      };
    }

    if (clean.endsWith('/finance') && method === 'GET') {
      return finance(clubId, params);
    }

    if (clean.endsWith('/finance') && method === 'POST') {
      let receiptPath = null;
      try {
        if (data.receipt instanceof File && data.receipt.size) {
          receiptPath = `finance/${clubId}/${crypto.randomUUID()}-${data.receipt.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
          await authService.uploadPrivateImage(receiptPath, data.receipt);
        }
        const row = check(
          await supabase.rpc('record_finance_transaction', {
            p_club_id: clubId,
            p_type: data.type,
            p_amount: Number(data.amount),
            p_occurred_on: data.occurred_on,
            p_description: data.description,
            p_receipt_path: receiptPath,
            p_category: data.category || null,
            p_paid_by: data.paid_by || null,
            p_notes: data.notes || null,
            p_idempotency_key: data.idempotency_key || null,
          })
        );
        return { data: row };
      } catch (error) {
        if (receiptPath) {
          await authService.deletePrivateImage(receiptPath).catch(() => {});
        }
        throw error;
      }
    }

    if (clean.endsWith('/planned') && method === 'GET') {
      const month = new Date().toISOString().slice(0, 7);
      const rows =
        check(
          await supabase
            .from('planned_expenses')
            .select('*')
            .eq('club_id', clubId)
            .eq('cancelled', false)
        ) || [];
      return {
        data: expandPlanned(
          rows,
          params.get('from') || month,
          params.get('to') || params.get('from') || month
        ),
      };
    }

    if (clean.endsWith('/planned') && method === 'POST') {
      return {
        data: check(
          await supabase.rpc('save_planned_expense', {
            p_club_id: clubId,
            p_id: null,
            p_description: data.description,
            p_amount: data.amount === '' ? null : Number(data.amount),
            p_notes: data.notes || null,
            p_effective_from: `${data.effective_from}-01`,
            p_effective_to: data.effective_to
              ? `${data.effective_to}-01`
              : null,
          })
        ),
      };
    }

    const planned = clean.match(/\/finance\/planned\/(\d+)$/);
    if (planned && method === 'PATCH') {
      return {
        data: check(
          await supabase.rpc('save_planned_expense', {
            p_club_id: clubId,
            p_id: Number(planned[1]),
            p_description: data.description,
            p_amount: data.amount === '' ? null : Number(data.amount),
            p_notes: data.notes || null,
            p_effective_from: `${data.effective_from}-01`,
            p_effective_to: data.effective_to
              ? `${data.effective_to}-01`
              : null,
          })
        ),
      };
    }

    if (planned && method === 'DELETE') {
      return {
        data: check(
          await supabase.rpc('cancel_planned_expense', {
            p_club_id: clubId,
            p_id: Number(planned[1]),
            p_effective_to: params.get('month')
              ? `${params.get('month')}-01`
              : null,
          })
        ),
      };
    }

    return null;
  }

  return {
    finance,
    handleFinanceRequest,
  };
}
