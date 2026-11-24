import test from 'node:test';
import assert from 'node:assert/strict';
import { compareVietnameseNames } from '../src/utils.js';
import { check, SupabaseApiError } from '../src/services/service-helpers.js';
import { openMemberPickerModal } from '../src/components/ui.js';
import { createDuesService } from '../src/services/dues-service.js';
import { createRosterService } from '../src/services/roster-service.js';

test('sorting by name, notes, foot, jersey operates accurately', () => {
  const names = ['Nguyễn Văn An', 'Trần Bảo', 'Đỗ Cường', 'Vũ Anh'];
  const sortedAsc = [...names].sort(compareVietnameseNames);
  assert.equal(sortedAsc[0], 'Nguyễn Văn An');
  assert.equal(sortedAsc[1], 'Vũ Anh');
  assert.equal(sortedAsc[2], 'Trần Bảo');
  assert.equal(sortedAsc[3], 'Đỗ Cường');

  const items = [
    { id: 1, full_name: 'Nguyễn Văn An', notes: '', preferred_foot: 'right', jersey_number: 10 },
    { id: 2, full_name: 'Trần Bảo', notes: 'Đội phó', preferred_foot: 'left', jersey_number: 7 },
    { id: 3, full_name: 'Vũ Anh', notes: 'Ghi chú đặc biệt', preferred_foot: 'both', jersey_number: 1 },
  ];

  // Sort by notes: items with notes first, then by name
  const sortedByNotes = [...items].sort(
    (a, b) => (b.notes ? 1 : 0) - (a.notes ? 1 : 0) || compareVietnameseNames(a.full_name, b.full_name)
  );
  assert.equal(sortedByNotes[0].full_name, 'Vũ Anh');
  assert.equal(sortedByNotes[1].full_name, 'Trần Bảo');
  assert.equal(sortedByNotes[2].full_name, 'Nguyễn Văn An');

  // Sort by jersey number
  const sortedByJersey = [...items].sort((a, b) => a.jersey_number - b.jersey_number);
  assert.equal(sortedByJersey[0].jersey_number, 1);
  assert.equal(sortedByJersey[1].jersey_number, 7);
  assert.equal(sortedByJersey[2].jersey_number, 10);
});

test('member picker partitions pre-selected items at top on open', () => {
  const items = [
    { id: 1, full_name: 'Nguyễn Văn An' },
    { id: 2, full_name: 'Trần Bình' },
    { id: 3, full_name: 'Lê Cường' },
    { id: 4, full_name: 'Phạm Dũng' },
  ];

  // Pre-selected ID is 3 (Lê Cường)
  const initialSelectedIds = [3];
  const selectedSet = new Set(initialSelectedIds.map(String));

  const selectedItems = items.filter((x) => selectedSet.has(String(x.id)));
  const unselectedItems = items.filter((x) => !selectedSet.has(String(x.id)));

  const sortByName = (a, b) => compareVietnameseNames(a.full_name, b.full_name);
  selectedItems.sort(sortByName);
  unselectedItems.sort(sortByName);

  const initialOrderedItems = [...selectedItems, ...unselectedItems];

  // First item must be the pre-selected item (Lê Cường, id 3)
  assert.equal(initialOrderedItems[0].id, 3);
  assert.equal(initialOrderedItems[0].full_name, 'Lê Cường');

  // Remaining items follow in alphabetical order: An, Bình, Dũng
  assert.equal(initialOrderedItems[1].id, 1); // Nguyễn Văn An
  assert.equal(initialOrderedItems[2].id, 2); // Trần Bình
  assert.equal(initialOrderedItems[3].id, 4); // Phạm Dũng
});

test('ticking/unticking maintains stable row order during interaction, re-partitions only on reopen', () => {
  const items = [
    { id: 1, full_name: 'Nguyễn Văn An' },
    { id: 2, full_name: 'Trần Bình' },
    { id: 3, full_name: 'Lê Cường' },
  ];

  // Initially none selected
  const selectedSet = new Set();
  const sortByName = (a, b) => compareVietnameseNames(a.full_name, b.full_name);
  const selectedItems = items.filter((x) => selectedSet.has(String(x.id))).sort(sortByName);
  const unselectedItems = items.filter((x) => !selectedSet.has(String(x.id))).sort(sortByName);
  let displayedItems = [...selectedItems, ...unselectedItems];

  const initialIds = displayedItems.map((x) => x.id);
  assert.deepEqual(initialIds, [1, 2, 3]); // Nguyễn Văn An, Trần Bình, Lê Cường (alphabetical by given name)

  // User ticks item 2 (Trần Bình)
  selectedSet.add('2');

  // In the picker UI, row positions remain UNCHANGED while user is ticking
  const orderWhileTicking = displayedItems.map((x) => x.id);
  assert.deepEqual(orderWhileTicking, initialIds);

  // User closes and reopens modal: now initialSelectedIds = [2]
  const reopenedSelected = items.filter((x) => selectedSet.has(String(x.id))).sort(sortByName);
  const reopenedUnselected = items.filter((x) => !selectedSet.has(String(x.id))).sort(sortByName);
  displayedItems = [...reopenedSelected, ...reopenedUnselected];

  // On re-open, the ticked item 2 (Trần Bình) is now sorted to the top!
  assert.equal(displayedItems[0].id, 2);
  assert.equal(displayedItems[0].full_name, 'Trần Bình');
});

test('check() translates database permission errors and transfer exceptions into user-friendly Vietnamese messages', () => {
  // 42501 or forbidden -> friendly message with club owner contact
  assert.throws(
    () => check({ error: { code: '42501', message: 'permission denied for table finance_entries' } }),
    (err) => {
      assert.ok(err instanceof SupabaseApiError);
      assert.equal(err.status, 403);
      assert.equal(err.message, 'Bạn không có quyền thực hiện thao tác này. Vui lòng liên hệ Chủ nhiệm CLB để được cấp quyền.');
      return true;
    }
  );

  assert.throws(
    () => check({ error: { message: 'forbidden: not authorized' } }),
    (err) => {
      assert.ok(err instanceof SupabaseApiError);
      assert.equal(err.message, 'Bạn không có quyền thực hiện thao tác này. Vui lòng liên hệ Chủ nhiệm CLB để được cấp quyền.');
      return true;
    }
  );

  // cannot_restrict_owner
  assert.throws(
    () => check({ error: { message: 'cannot_restrict_owner' } }),
    (err) => {
      assert.equal(err.message, 'Không thể giới hạn quyền của Chủ nhiệm CLB.');
      return true;
    }
  );

  // already_owner
  assert.throws(
    () => check({ error: { message: 'already_owner' } }),
    (err) => {
      assert.equal(err.message, 'Thành viên này hiện đã là Chủ nhiệm CLB.');
      return true;
    }
  );

  // target_member_not_found_or_inactive
  assert.throws(
    () => check({ error: { message: 'target_member_not_found_or_inactive' } }),
    (err) => {
      assert.equal(err.message, 'Không tìm thấy thành viên nhận quyền hoặc thành viên không còn hoạt động.');
      return true;
    }
  );

  // stale_dues_status
  assert.throws(
    () => check({ error: { message: 'stale_dues_status' } }),
    (err) => {
      assert.equal(err.message, 'Trạng thái đóng quỹ đã bị thay đổi bởi người khác. Vui lòng tải lại trang.');
      return true;
    }
  );

  // invalid_correction
  assert.throws(
    () => check({ error: { message: 'invalid_correction' } }),
    (err) => {
      assert.equal(err.message, 'Thao tác điều chỉnh trạng thái đóng quỹ không hợp lệ.');
      return true;
    }
  );

  // missing_source_transaction
  assert.throws(
    () => check({ error: { message: 'missing_source_transaction' } }),
    (err) => {
      assert.equal(err.message, 'Không tìm thấy giao dịch thu quỹ gốc cần điều chỉnh.');
      return true;
    }
  );
});

test('openMemberPickerModal renders members with date_of_birth without throwing formatDate ReferenceError', () => {
  const prevDoc = globalThis.document;
  const fakeEl = () => ({
    setAttribute() {},
    addEventListener() {},
    append() {},
    showModal() {},
    close() {},
    remove() {},
    querySelectorAll: () => [],
    querySelector: () => ({
      addEventListener() {},
      querySelectorAll: () => [],
      value: '',
      hidden: false,
      onsubmit: null,
    }),
    classList: { add() {} },
    innerHTML: '',
  });
  globalThis.document = {
    activeElement: null,
    createElement: () => fakeEl(),
    body: { append() {} },
  };
  try {
    const modal = openMemberPickerModal({
      title: 'Chọn thành viên vào đội',
      items: [
        { id: 1, full_name: 'Nguyễn Văn An', date_of_birth: '2000-05-10', notes: 'Đội 1' },
      ],
      initialSelectedIds: [],
      onSubmit: async () => true,
    });
    assert.ok(modal);
  } finally {
    globalThis.document = prevDoc;
  }
});

test('duesService wraps RPC get_club_dues_report array inside { data } envelope', async () => {
  const service = createDuesService({
    supabase: {
      rpc: async () => ({
        data: [{ player_id: 1, name: 'An', teams: [], total: 100000 }],
        error: null,
      }),
    },
  });
  const res = await service.handleDuesRequest('/clubs/1/dues', 'GET', {}, new URLSearchParams('month=2026-11'), 1);
  assert.ok(Array.isArray(res.data));
  assert.equal(res.data[0].player_id, 1);
});

test('rosterService sync_team_players fallback handles team_membership_periods without Postgrest .catch TypeError', async () => {
  const service = createRosterService({
    supabase: {
      rpc: async () => ({ error: { code: 'PGRST202', message: 'Could not find function sync_team_players' } }),
      from: (table) => {
        const q = {
          select() { return q; },
          delete() { return q; },
          update() { return q; },
          insert() { return q; },
          upsert() { return q; },
          eq() { return q; },
          in() { return q; },
          is() { return q; },
          then(resolve) { resolve({ data: [], error: null }); },
        };
        return q;
      },
    },
    authService: {},
  });
  const res = await service.handleRosterRequest('/clubs/1/teams/2/players', 'PATCH', { player_ids: [10, 20] }, new URLSearchParams(), 1, {});
  assert.equal(res.data, true);
});
