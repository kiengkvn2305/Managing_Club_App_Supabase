import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeAttendance } from '../src/attendance-report.js';
import { compareVietnameseNames } from '../src/utils.js';

test('attendance percentage and status counts ignore sessions without a recorded status', () => {
  assert.deepEqual(summarizeAttendance(['present', 'absent', 'excused', undefined]), {
    marked: 3,
    present: 1,
    absent: 1,
    excused: 1,
    unmarked: 1,
    percent: 33,
  });
  assert.deepEqual(summarizeAttendance([undefined]), {
    marked: 0,
    present: 0,
    absent: 0,
    excused: 0,
    unmarked: 1,
    percent: null,
  });
});

test('member names are sorted by given name rather than family name', () => {
  assert.deepEqual(['An Bình', 'Trần An', 'Lê Cường'].sort(compareVietnameseNames), ['Trần An', 'An Bình', 'Lê Cường']);
});

test('attendance progress rows sort accurately by present, absent, excused counts and percent', () => {
  const members = [
    { name: 'Nguyễn Văn An', summary: { present: 5, absent: 1, excused: 0, marked: 6, percent: 83 } },
    { name: 'Trần Bình', summary: { present: 2, absent: 4, excused: 1, marked: 7, percent: 29 } },
    { name: 'Lê Cường', summary: { present: 4, absent: 0, excused: 3, marked: 7, percent: 57 } },
  ];

  // Sort by present count (highest first)
  const sortByPresent = [...members].sort(
    (a, b) => b.summary.present - a.summary.present || compareVietnameseNames(a.name, b.name)
  );
  assert.equal(sortByPresent[0].name, 'Nguyễn Văn An'); // 5 present
  assert.equal(sortByPresent[1].name, 'Lê Cường');      // 4 present
  assert.equal(sortByPresent[2].name, 'Trần Bình');     // 2 present

  // Sort by absent count (highest first)
  const sortByAbsent = [...members].sort(
    (a, b) => b.summary.absent - a.summary.absent || compareVietnameseNames(a.name, b.name)
  );
  assert.equal(sortByAbsent[0].name, 'Trần Bình');     // 4 absent
  assert.equal(sortByAbsent[1].name, 'Nguyễn Văn An'); // 1 absent
  assert.equal(sortByAbsent[2].name, 'Lê Cường');      // 0 absent

  // Sort by excused count (highest first)
  const sortByExcused = [...members].sort(
    (a, b) => b.summary.excused - a.summary.excused || compareVietnameseNames(a.name, b.name)
  );
  assert.equal(sortByExcused[0].name, 'Lê Cường');      // 3 excused
  assert.equal(sortByExcused[1].name, 'Trần Bình');     // 1 excused
  assert.equal(sortByExcused[2].name, 'Nguyễn Văn An'); // 0 excused

  // Sort by attendance percentage (highest first)
  const sortByPercent = [...members].sort(
    (a, b) => (b.summary.percent ?? -1) - (a.summary.percent ?? -1) || compareVietnameseNames(a.name, b.name)
  );
  assert.equal(sortByPercent[0].name, 'Nguyễn Văn An'); // 83%
  assert.equal(sortByPercent[1].name, 'Lê Cường');      // 57%
  assert.equal(sortByPercent[2].name, 'Trần Bình');     // 29%
});
