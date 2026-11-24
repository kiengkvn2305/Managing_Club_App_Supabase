import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { parseMembers, buildMembersWorkbook, buildFinanceWorkbook } from '../src/spreadsheets.js';

const headers = ['full_name', 'email', 'phone', 'date_of_birth', 'position', 'preferred_foot', 'status', 'notes'];
async function fileWith(row) {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet('Thanh vien');
  sheet.addRow(headers); sheet.addRow(row);
  const buffer = await book.xlsx.writeBuffer();
  return { name: 'members.xlsx', size: buffer.byteLength, arrayBuffer: async () => buffer };
}
test('imports a real Excel file and keeps phone as text', async () => {
  const file = await fileWith(['Nguyễn An', 'an@example.test', '0912345678', '2000-02-29', 'GK', 'right', 'active', '']);
  const rows = await parseMembers(file);
  assert.equal(rows[0].full_name, 'Nguyễn An');
  assert.equal(rows[0].phone, '0912345678');
  assert.equal(rows[0].date_of_birth, '2000-02-29');
});
test('rejects formulas and numeric phone values', async () => {
  await assert.rejects(() => fileWith([{ formula: '1+1', result: 2 }]).then(parseMembers), /không dùng công thức/);
  await assert.rejects(() => fileWith(['An', '', 912345678]).then(parseMembers), /Text/);
});
test('team export omits club memberships while retaining team position and jersey', async () => {
  const items = [{ full_name: 'An', phone: '0912345678', teams: [{ id: 1, name: 'A', position: 'GK', jersey_number: 0 }, { id: 2, name: 'B' }] }];
  const team = (await buildMembersWorkbook(items, '1')).worksheets[0];
  const headers = team.getRow(1).values.slice(1);
  assert.equal(headers.includes('Đội tham gia'), false);
  assert.equal(team.getRow(2).getCell(5).value, 'GK');
  assert.equal(team.getRow(2).getCell(6).value, '0');
  const club = (await buildMembersWorkbook(items)).worksheets[0];
  assert.equal(club.getRow(2).getCell(5).value, 'A, B');
});

test('export protects against formula injection for values starting with formula operators', async () => {
  const items = [{ full_name: '=SUM(1,2)', notes: '+danger', phone: '-0912345678', teams: [] }];
  const book = await buildMembersWorkbook(items);
  const sheet = book.worksheets[0];
  assert.equal(sheet.getRow(2).getCell(1).value, "'=SUM(1,2)");
  assert.equal(sheet.getRow(2).getCell(3).value, "'-0912345678");
  assert.equal(sheet.getRow(2).getCell(8).value, "'+danger");
});

test('large 500-row Excel import parses cleanly and enforces 500-row & 5MB limits', async () => {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet('Thanh vien');
  sheet.addRow(headers);
  for (let i = 1; i <= 500; i++) {
    sheet.addRow([
      `Cầu thủ ${i}`,
      `player${i}@fcms.test`,
      `090${String(i).padStart(7, '0')}`,
      '15/05/2001',
      'CM',
      i % 2 === 0 ? 'right' : 'left',
      i % 10 === 0 ? 'graduated' : 'active',
      `Ghi chú ${i}`,
    ]);
  }
  const buffer = await book.xlsx.writeBuffer();
  const parsed = await parseMembers({
    name: 'large-500.xlsx',
    size: buffer.byteLength,
    arrayBuffer: async () => buffer,
  });
  assert.equal(parsed.length, 500);
  assert.equal(parsed.sourceRows[0], 2);
  assert.equal(parsed.sourceRows[499], 501);
  assert.equal(parsed[9].status, 'graduated');
  assert.equal(parsed[0].date_of_birth, '2001-05-15');

  // > 500 rows must be rejected
  sheet.addRow(['Cầu thủ 501', 'p501@fcms.test', '0900000501', '01/01/2000', 'GK', 'right', 'active', '']);
  const overBuffer = await book.xlsx.writeBuffer();
  await assert.rejects(
    parseMembers({ name: 'over-500.xlsx', size: overBuffer.byteLength, arrayBuffer: async () => overBuffer }),
    /tối đa 500 dòng/
  );

  // > 5 MB file must be rejected
  await assert.rejects(
    parseMembers({ name: 'huge.xlsx', size: 5 * 1024 * 1024 + 1, arrayBuffer: async () => buffer }),
    /tối đa 5 MB/
  );
});

test('large 500-row Excel exports (members and finance) build valid workbooks', async () => {
  const members = Array.from({ length: 500 }, (_, idx) => ({
    full_name: `Thành viên ${idx + 1}`,
    date_of_birth: '2002-08-19',
    phone: `091${String(idx + 1).padStart(7, '0')}`,
    email: `m${idx + 1}@fcms.test`,
    preferred_foot: 'right',
    status: 'active',
    notes: '',
    teams: [{ id: 1, name: 'Đội 1', position: 'CM', jersey_number: idx }],
  }));
  const mBook = await buildMembersWorkbook(members, '', { activity_start_date: '2025-09-01' });
  assert.equal(mBook.worksheets[0].rowCount, 501);
  const mBuf = await mBook.xlsx.writeBuffer();
  assert.ok(mBuf.byteLength > 10000);

  const txRows = Array.from({ length: 500 }, (_, idx) => ({
    occurred_on: '2026-11-20',
    type: idx % 2 === 0 ? 'income' : 'expense',
    description: `Khoản thu chi ${idx + 1}`,
    amount: 100000 + idx,
    has_receipt: idx % 3 === 0,
    category: 'Quỹ đội',
    paid_by: 'Thủ quỹ',
    notes: '',
  }));
  const fBook = await buildFinanceWorkbook(txRows, { income: 25000000, expense: 12000000, balance: 13000000, remaining: 13000000 }, []);
  assert.equal(fBook.worksheets[0].rowCount, 506);
  assert.equal(fBook.worksheets[1].name, 'Dieu chinh quy');
});
