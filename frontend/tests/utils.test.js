import test from "node:test";
import assert from "node:assert/strict";
import {
  escapeHtml,
  validate,
  validDate,
  unpackList,
  canManageRoster,
  canManageClub,
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
