import { formatDate, validDate, formatVietnamDateTime } from './utils.js';
const BASE_HEADERS = ['full_name', 'email', 'phone', 'date_of_birth', 'position', 'preferred_foot', 'status', 'notes'];
const HEADERS = [...BASE_HEADERS];
async function workbook() {
  let module;
  try { module = await import('exceljs'); }
  catch { throw new Error('Không tải được thư viện Excel. Hãy giữ lại file đang nhập, tải lại trang để nhận phiên bản mới rồi thử lại.'); }
  const Excel = module.default || module;
  return new Excel.Workbook();
}
function save(blob, name) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a'); link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
async function download(book, name) {
  save(new Blob([await book.xlsx.writeBuffer()], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), name);
}
export async function downloadMemberTemplate() {
  const book = await workbook();
  const sheet = book.addWorksheet('Thanh vien');
  sheet.addRow(HEADERS);
  sheet.getRow(1).font = { bold: true };
  sheet.columns.forEach((column) => { column.width = 24; column.numFmt = '@'; });
  const help = book.addWorksheet('Huong dan');
  for (const row of [
    ['Cột', 'Quy tắc'], ['full_name', 'Bắt buộc, tối đa 120 ký tự'],
    ['email', 'Không bắt buộc, không trùng trong CLB hoặc file'],
    ['phone', 'Không bắt buộc; đặt định dạng Text để giữ số 0 đầu'],
    ['date_of_birth', 'Không bắt buộc; ghi dd/mm/yyyy, ví dụ 31/01/2002'],
    ['position', 'Không bắt buộc; GK, FIXO, ALA, PIVOT, CB, LB, RB, CDM, CM, CAM, LM, RM, LW, RW, ST hoặc CF'],
    ['preferred_foot', 'Không bắt buộc; right, left hoặc both'],
    ['status', 'Không bắt buộc; active, inactive, injured hoặc graduated; để trống là active'],
    ['notes', 'Không bắt buộc; tối đa 5000 ký tự'],
    ['Lưu ý', 'Một dòng một người; không đổi tên cột, không dùng công thức. Mỗi lần tối đa 500 dòng.'],
    ['Lưu ý', 'Sau khi nhập, chọn thành viên vào đội và thiết lập số áo theo từng đội.'],
  ]) help.addRow(row);
  help.getColumn(1).width = 22; help.getColumn(2).width = 85;
  await download(book, 'mau-thanh-vien.xlsx');
}
export async function parseMembers(file) {
  if (!file || !/\.xlsx$/i.test(file.name) || file.size > 5 * 1024 * 1024) throw new Error('Chọn file .xlsx tối đa 5 MB.');
  const book = await workbook();
  try { await book.xlsx.load(await file.arrayBuffer()); }
  catch { throw new Error('Không đọc được file Excel. Hãy dùng file .xlsx hợp lệ theo mẫu.'); }
  const sheet = book.worksheets[0];
  if (!sheet) throw new Error('File không có trang dữ liệu.');
  if (sheet.rowCount > 501 || sheet.columnCount > HEADERS.length) throw new Error('File tối đa 500 dòng và không thêm cột ngoài mẫu.');
  const firstRowHeaders = [];
  for (let c = 1; c <= Math.max(BASE_HEADERS.length, sheet.columnCount); c++) {
    const val = String(sheet.getRow(1).getCell(c).value || '').trim();
    if (val) firstRowHeaders.push(val);
  }
  let activeHeaders = null;
  if (firstRowHeaders.join('|') === HEADERS.join('|')) {
    activeHeaders = HEADERS;
  } else if (firstRowHeaders.join('|') === BASE_HEADERS.join('|')) {
    activeHeaders = BASE_HEADERS;
  } else {
    throw new Error('Tên hoặc thứ tự cột không đúng; hãy tải mẫu và giữ nguyên hàng đầu.');
  }
  const rows = [];
  rows.sourceRows = [];
  for (let index = 2; index <= sheet.rowCount; index++) {
    const row = sheet.getRow(index), result = {};
    for (let col = 0; col < activeHeaders.length; col++) {
      const header = activeHeaders[col];
      const value = row.getCell(col + 1).value;
      if (value && typeof value === 'object' && !(value instanceof Date)) throw new Error(`Dòng ${index}, cột ${header}: không dùng công thức hoặc liên kết.`);
      if (value instanceof Date) {
        if (header !== 'date_of_birth' || Number.isNaN(value.getTime())) throw new Error(`Dòng ${index}: định dạng ngày không hợp lệ.`);
        result[header] = value.toISOString().slice(0, 10);
      } else {
        if (header === 'phone' && typeof value === 'number') throw new Error(`Dòng ${index}: đặt số điện thoại dạng Text để giữ số 0 đầu.`);
        result[header] = value == null || String(value).trim() === '' ? null : String(value).trim();
        if (header === 'date_of_birth' && result[header]) {
          const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(result[header]);
          if (match) result[header] = `${match[3]}-${match[2]}-${match[1]}`;
          if (!validDate(result[header])) throw new Error(`Dòng ${index}: ngày sinh không hợp lệ; dùng dd/mm/yyyy.`);
        }
      }
    }
    if (Object.values(result).every((x) => x === null)) continue;
    result.status ||= 'active'; rows.push(result); rows.sourceRows.push(index);
  }
  if (!rows.length) throw new Error('File chưa có dòng thành viên.');
  return rows;
}
export function sanitizeCell(value) {
  if (value == null) return '';
  const text = String(value);
  return /^[=+@\-\t\r]/.test(text) ? `'${text}` : text;
}
export async function exportFinance(items, summary, adjustments = []) {
  const book = await workbook(), sheet = book.addWorksheet('Thu chi');
  sheet.addRow(['Ngày', 'Loại', 'Nội dung', 'Số tiền (đồng)', 'Có ảnh xác nhận', 'Danh mục', 'Người thu / chi', 'Ghi chú / chứng từ']);
  sheet.getRow(1).font = { bold: true };
  for (const item of items) sheet.addRow([formatDate(item.occurred_on), item.type === 'income' ? 'Thu' : 'Chi', sanitizeCell(item.description), Number(item.amount), item.has_receipt ? 'Có' : 'Không', sanitizeCell(item.category), sanitizeCell(item.paid_by), sanitizeCell(item.notes)]);
  sheet.addRow([]); sheet.addRow(['Tổng thu trong kỳ', Number(summary.income || 0)]); sheet.addRow(['Tổng chi trong kỳ', Number(summary.expense || 0)]); sheet.addRow(['Thu trừ chi trong kỳ', Number(summary.balance || 0)]); sheet.addRow(['Còn lại đến cuối kỳ', Number(summary.remaining || 0)]);
  sheet.columns.forEach((c) => { c.width = 24; }); sheet.getColumn(3).width = 50;
  const changes = book.addWorksheet('Dieu chinh quy');
  changes.addRow(['Ngày điều chỉnh', 'Thành viên', 'Đội', 'Tháng quỹ', 'Trạng thái cũ', 'Trạng thái mới', 'Số tiền', 'Lý do']);
  changes.getRow(1).font = { bold: true };
  const labels = { unpaid: 'Chưa đóng', paid: 'Đã đóng', exempt: 'Miễn đóng' };
  for (const a of adjustments) changes.addRow([formatVietnamDateTime(a.created_at), sanitizeCell(a.player_name), sanitizeCell(a.team_name), a.month, labels[a.old_status] || a.old_status, labels[a.new_status] || a.new_status, Number(a.amount), sanitizeCell(a.reason)]);
  changes.columns.forEach((c) => { c.width = 24; }); changes.getColumn(8).width = 45;
  await download(book, 'so-thu-chi.xlsx');
}
export async function buildMembersWorkbook(items, teamId = '', club = null) {
  const book = await workbook(), sheet = book.addWorksheet('Thanh vien');
  sheet.addRow(['Họ và tên', 'Ngày sinh', 'Điện thoại', 'Email', ...(teamId ? ['Vị trí', 'Số áo'] : ['Đội tham gia']), 'Chân thuận', 'Trạng thái', 'Ghi chú', 'Ngày bắt đầu hoạt động CLB']);
  sheet.getRow(1).font = { bold: true };
  const clubStartDate = club?.activity_start_date ? formatDate(club.activity_start_date) : (club?.created_at ? formatDate(club.created_at.slice(0, 10)) : '');
  for (const item of items) {
    const team = (item.teams || []).find((t) => String(t.id) === String(teamId));
    sheet.addRow([
      sanitizeCell(item.full_name),
      formatDate(item.date_of_birth),
      sanitizeCell(item.phone),
      sanitizeCell(item.email),
      ...(teamId ? [sanitizeCell(team?.position), sanitizeCell(team?.jersey_number)] : [sanitizeCell((item.teams || []).map((t) => t.name).join(', '))]),
      sanitizeCell(item.preferred_foot),
      sanitizeCell(item.status),
      sanitizeCell(item.notes),
      sanitizeCell(clubStartDate)
    ]);
  }
  sheet.columns.forEach((column) => { column.width = 24; });
  sheet.getColumn(teamId ? 9 : 8).width = 45;
  sheet.autoFilter = { from: 'A1', to: teamId ? 'J1' : 'I1' };
  return book;
}
export async function exportMembers(items, teamId = '', club = null) {
  const book = await buildMembersWorkbook(items, teamId, club);
  await download(book, teamId ? 'thanh-vien-doi-bong.xlsx' : 'thanh-vien-clb.xlsx');
}
