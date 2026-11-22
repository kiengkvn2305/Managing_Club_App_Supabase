import test from 'node:test';
import assert from 'node:assert/strict';
import { formatVietnamClock } from '../src/utils.js';

test('Vietnam clock consistently renders UTC+7 time', () => {
  const label = formatVietnamClock(new Date('2026-01-01T00:00:00.000Z'));
  assert.match(label, /07:00:00/);
  assert.match(label, /UTC\+7/);
});
