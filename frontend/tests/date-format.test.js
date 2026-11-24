import test from 'node:test';
import assert from 'node:assert/strict';
import { formatDate, formatMonth, validDate, vietnamToday, formatVietnamDateTime } from '../src/utils.js';
import { field } from '../src/components/ui.js';

test('dates display in Vietnamese format and use Vietnam calendar day', () => {
  assert.equal(formatDate('2024-02-29'), '29/02/2024');
  assert.equal(formatDate('2024-02-29T10:20:30Z'), '29/02/2024');
  assert.equal(formatMonth('2026-11-01'), '11/2026');
  assert.equal(validDate('2023-02-29'), false);
  assert.equal(vietnamToday(new Date('2024-01-01T18:00:00Z')), '2024-01-02');
  assert.match(formatVietnamDateTime('2024-01-01T18:00:00Z'), /02\/01\/2024/);
  const datePicker = field('dob', 'Ngày sinh', '2024-02-29', 'date');
  assert.match(datePicker, /type="date"/);
  assert.match(datePicker, /value="2024-02-29"/);
  assert.match(datePicker, /placeholder="dd\/mm\/yyyy"/);
  assert.match(datePicker, /value="29\/02\/2024"/);
});
