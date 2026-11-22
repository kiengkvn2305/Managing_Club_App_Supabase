import test from 'node:test';
import assert from 'node:assert/strict';
import { state } from '../src/state.js';
import {
  documentsPage,
  formatFileSize,
  fileTypeInfo,
} from '../src/views/documents-page.js';
import { createDocumentService } from '../src/services/document-service.js';

test('fileTypeInfo accurately recognizes file extensions and mime types', () => {
  assert.equal(fileTypeInfo('bien_ban_hop.docx').kind, 'word');
  assert.equal(fileTypeInfo('danh_sach_quy.xlsx').kind, 'excel');
  assert.equal(fileTypeInfo('so_lieu.csv').kind, 'excel');
  assert.equal(fileTypeInfo('dieu_le.pdf').kind, 'pdf');
  assert.equal(fileTypeInfo('anh_doi_bong.png').kind, 'image');
  assert.equal(fileTypeInfo('anh_san.jpg').kind, 'image');
  assert.equal(fileTypeInfo('ke_hoach.pptx').kind, 'slide');
  assert.equal(fileTypeInfo('ghi_chu.txt').kind, 'other');
});

test('formatFileSize correctly calculates human-readable file sizes', () => {
  assert.equal(formatFileSize(0), '0 B');
  assert.equal(formatFileSize(500), '500 B');
  assert.equal(formatFileSize(1024), '1 KB');
  assert.equal(formatFileSize(1536), '1.5 KB');
  assert.equal(formatFileSize(1048576), '1 MB');
  assert.equal(formatFileSize(5242880), '5 MB');
});

test('documentsPage renders folder pills, search bar, and document cards', () => {
  state.clubId = 1;
  state.clubs = [
    { id: 1, name: 'CLB Sao Vàng', membership_role: 'owner', status: 'active' },
  ];
  state.documentFolders = [
    'Biên bản họp',
    'Kế hoạch & Đề án',
    'Tài chính & Thu chi',
  ];
  state.documents = [
    {
      id: 101,
      club_id: 1,
      folder_name: 'Biên bản họp',
      name: 'Biên bản họp BCN tháng 11/2026',
      file_name: 'bien_ban_11_2026.docx',
      file_path: 'clubs/1/documents/bien_ban.docx',
      file_size: 24576,
      file_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      notes: 'Thống nhất kế hoạch giải mùa đông',
      uploader_name: 'Chủ nhiệm CLB',
      created_at: '2026-11-20T10:00:00Z',
    },
    {
      id: 102,
      club_id: 1,
      folder_name: 'Tài chính & Thu chi',
      name: 'Báo cáo quỹ tháng 10/2026',
      file_name: 'bao_cao_quy.xlsx',
      file_path: 'clubs/1/documents/quy.xlsx',
      file_size: 1048576,
      file_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      notes: 'Sao kê thu chi thực tế',
      uploader_name: 'Thủ quỹ',
      created_at: '2026-11-15T15:30:00Z',
    },
  ];

  state.documentFolderFilter = '';
  state.documentSearch = '';
  state.documentTypeFilter = '';

  let html = documentsPage();
  assert.ok(html.includes('Tài liệu & Hồ sơ CLB'));
  assert.ok(html.includes('Biên bản họp BCN tháng 11/2026'));
  assert.ok(html.includes('Báo cáo quỹ tháng 10/2026'));
  assert.ok(html.includes('Biên bản họp'));
  assert.ok(html.includes('Tài chính'));
  assert.ok(html.includes('WORD'));
  assert.ok(html.includes('EXCEL'));
  assert.ok(html.includes('24 KB'));
  assert.ok(html.includes('1 MB'));

  // Filter by folder: 'Tài chính & Thu chi'
  state.documentFolderFilter = 'Tài chính & Thu chi';
  html = documentsPage();
  assert.ok(!html.includes('Biên bản họp BCN tháng 11/2026'));
  assert.ok(html.includes('Báo cáo quỹ tháng 10/2026'));

  // Filter by search keyword: 'Biên bản'
  state.documentFolderFilter = '';
  state.documentSearch = 'biên bản';
  html = documentsPage();
  assert.ok(html.includes('Biên bản họp BCN tháng 11/2026'));
  assert.ok(!html.includes('Báo cáo quỹ tháng 10/2026'));

  // Filter by type: 'excel'
  state.documentSearch = '';
  state.documentTypeFilter = 'excel';
  html = documentsPage();
  assert.ok(!html.includes('Biên bản họp BCN tháng 11/2026'));
  assert.ok(html.includes('Báo cáo quỹ tháng 10/2026'));
});

test('documentService handles document CRUD operations with fallback support', async () => {
  const fakeSupabase = {
    from: () => ({
      select: () => ({
        eq: () => ({
          order: async () => ({
            data: [
              {
                id: 1,
                club_id: 1,
                folder_name: 'Biên bản họp',
                name: 'Biên bản 01',
                file_name: 'bb01.docx',
                file_path: 'clubs/1/documents/bb01.docx',
                file_size: 12000,
                file_type: 'docx',
              },
            ],
            error: null,
          }),
        }),
      }),
      insert: (doc) => ({
        select: () => ({
          single: async () => ({
            data: { id: 99, ...doc },
            error: null,
          }),
        }),
      }),
      update: () => ({
        eq: () => ({
          eq: async () => ({ error: null }),
        }),
      }),
      delete: () => ({
        eq: () => ({
          eq: async () => ({ error: null }),
        }),
      }),
    }),
    storage: {
      from: () => ({
        createSignedUrl: async () => ({ data: { signedUrl: 'https://storage.test/file.docx' }, error: null }),
        upload: async () => ({ data: { path: 'path' }, error: null }),
        remove: async () => ({ error: null }),
      }),
    },
  };

  const fakeAuth = {
    user: async () => ({ id: 'usr-1', email: 'owner@test.com', name: 'Chủ nhiệm' }),
  };

  const docService = createDocumentService({ supabase: fakeSupabase, authService: fakeAuth });

  // 1. GET documents
  const listResult = await docService.handleDocumentRequest('/clubs/1/documents', 'GET', null, new URLSearchParams(), 1);
  assert.ok(listResult.data.length >= 1);
  assert.equal(listResult.data[0].name, 'Biên bản 01');
  assert.equal(listResult.data[0].download_url, 'https://storage.test/file.docx');
  assert.ok(listResult.folders.includes('Biên bản họp'));

  // 2. POST document
  const createResult = await docService.handleDocumentRequest('/clubs/1/documents', 'POST', {
    name: 'Kế hoạch du đấu 2026',
    folder_name: 'Kế hoạch & Đề án',
    file_name: 'ke_hoach.xlsx',
    file_size: 54000,
  }, new URLSearchParams(), 1);
  assert.equal(createResult.data.name, 'Kế hoạch du đấu 2026');
  assert.equal(createResult.data.folder_name, 'Kế hoạch & Đề án');

  // 3. PATCH document
  const patchResult = await docService.handleDocumentRequest('/clubs/1/documents/99', 'PATCH', {
    name: 'Kế hoạch du đấu 2026 đã duyệt',
  }, new URLSearchParams(), 1);
  assert.equal(patchResult.data.name, 'Kế hoạch du đấu 2026 đã duyệt');

  // 4. DELETE document
  const deleteResult = await docService.handleDocumentRequest('/clubs/1/documents/99', 'DELETE', null, new URLSearchParams(), 1);
  assert.equal(deleteResult.data.id, 99);
});
