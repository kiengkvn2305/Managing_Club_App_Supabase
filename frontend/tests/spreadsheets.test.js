import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { parseMembers, buildMembersWorkbook } from '../src/spreadsheets.js';

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
