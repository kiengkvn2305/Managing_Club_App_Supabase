import test from 'node:test';
import assert from 'node:assert/strict';
import { ledgerView } from '../src/data-views.js';

test('ledger excludes a reversed original while retaining its posted reversal', () => {
  const view = ledgerView([
    { id: 1, occurred_on: '2026-11-01', type: 'income', amount: '100.00', status: 'reversed' },
    { id: 2, occurred_on: '2026-11-02', type: 'expense', amount: '100.00', status: 'posted' },
    { id: 3, occurred_on: '2026-11-03', type: 'income', amount: '50.00', status: 'posted' },
  ], '2026-11-01', '2026-11-30');

  assert.equal(view.data.length, 3, 'audit trail stays visible');
  assert.equal(view.summary.income, '50.00');
  assert.equal(view.summary.expense, '100.00');
  assert.equal(view.summary.balance, '-50.00');
  assert.equal(view.chart.length, 2, 'reversed original is not charted twice');
});
