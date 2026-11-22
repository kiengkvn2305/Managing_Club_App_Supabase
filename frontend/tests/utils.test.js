import test from "node:test";
import assert from "node:assert/strict";
import {
  escapeHtml,
  validate,
  validDate,
  unpackList,
  canManageRoster,
  canManageClub,
  boardTitleRank,
  compareVietnameseNames,
} from "../src/utils.js";
test("untrusted names are encoded in markup", () =>
  assert.equal(
    escapeHtml('<img onerror="alert(1)">'),
    "&lt;img onerror=&quot;alert(1)&quot;&gt;",
  ));
test("account validation rejects mismatches and accepts Unicode names", () => {
  assert.ok(
    validate("register", {
      name: "An",
      email: "bad",
      password: "123",
      password_confirmation: "456",
    }).password_confirmation,
  );
  assert.deepEqual(
    validate("register", {
      name: "Kiên",
      email: "kien@example.com",
      password: "Password123!",
      password_confirmation: "Password123!",
    }),
    {},
  );
});
test("dates use real calendar validation and jersey number zero is valid", () => {
  assert.equal(validDate("2024-02-29"), true);
  assert.equal(validDate("2025-02-29"), false);
  assert.ok(
    validate("member", {
      full_name: "An",
      date_of_birth: "2099-01-01",
      jersey_number: "-1",
      status: "active",
    }).date_of_birth,
  );
  assert.deepEqual(
    validate("member", {
      full_name: "An",
      jersey_number: "0",
      status: "active",
    }),
    {},
  );
});
test("pagination understands the shared response envelope", () =>
  assert.equal(
    unpackList({ data: [{ id: 1 }], meta: { total: 1 } }).meta.total,
    1,
  ));
test("role-specific presentation is deny by default", () => {
  assert.equal(canManageRoster("member"), false);
  assert.equal(canManageRoster("hr_manager"), true);
  assert.equal(canManageClub("sporting_manager"), false);
});
test("boardTitleRank correctly orders club board titles by hierarchy", () => {
  assert.ok(boardTitleRank("Chủ nhiệm CLB") < boardTitleRank("Phó chủ nhiệm"));
  assert.ok(boardTitleRank("Phó chủ nhiệm") < boardTitleRank("Thủ quỹ"));
  assert.ok(boardTitleRank("Thủ quỹ") < boardTitleRank("Huấn luyện viên"));
  assert.ok(boardTitleRank("Huấn luyện viên") < boardTitleRank("Hậu cần"));
  assert.ok(boardTitleRank("Hậu cần") < boardTitleRank("Thư ký"));
  assert.ok(boardTitleRank("Thư ký") < boardTitleRank("Truyền thông"));
  assert.ok(boardTitleRank("Truyền thông") < boardTitleRank("Thành viên"));

  const members = [
    { full_name: "Nguyễn Văn C", title: "Thành viên", id: 1 },
    { full_name: "Trần Thị B", title: "Thủ quỹ", id: 2 },
    { full_name: "Lê Văn A", title: "Chủ nhiệm", id: 3 },
    { full_name: "Phạm Hữu D", title: "Phó chủ nhiệm", id: 4 },
  ];

  // Sort by title rank
  const byTitle = [...members].sort(
    (a, b) =>
      boardTitleRank(a.title) - boardTitleRank(b.title) ||
      compareVietnameseNames(a.full_name, b.full_name)
  );
  assert.deepEqual(byTitle.map((m) => m.title), [
    "Chủ nhiệm",
    "Phó chủ nhiệm",
    "Thủ quỹ",
    "Thành viên",
  ]);

  // Sort by name A-Z
  const byName = [...members].sort((a, b) =>
    compareVietnameseNames(a.full_name, b.full_name)
  );
  assert.deepEqual(byName.map((m) => m.full_name), [
    "Lê Văn A",
    "Trần Thị B",
    "Nguyễn Văn C",
    "Phạm Hữu D",
  ]);

  // Sort by order asc
  const byOrder = [...members].sort((a, b) => a.id - b.id);
  assert.deepEqual(byOrder.map((m) => m.id), [1, 2, 3, 4]);
});
