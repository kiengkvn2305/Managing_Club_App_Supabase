import test from 'node:test';
import assert from 'node:assert/strict';
import { formatVietnamClock } from '../src/utils.js';
import { field } from '../src/components/ui.js';

test('Vietnam clock consistently renders UTC+7 time', () => {
  const label = formatVietnamClock(new Date('2026-01-01T00:00:00.000Z'));
  assert.match(label, /07:00:00/);
  assert.match(label, /UTC\+7/);
});

test('date fields use the device native calendar picker', () => {
  const markup = field('training_date', 'Chọn ngày tập', '2026-11-22', 'date', true);
  assert.match(markup, /type="date"/);
  assert.match(markup, /value="2026-11-22"/);
  assert.doesNotMatch(markup, /data-date-input|type="hidden"/);
});
