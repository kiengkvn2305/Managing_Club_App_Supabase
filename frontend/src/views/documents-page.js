import { state as s, currentClub } from '../state.js';
import { escapeHtml as e, formatDate, canManageClub } from '../utils.js';
import { empty } from '../components/ui.js';

export function formatFileSize(bytes = 0) {
  const b = Number(bytes) || 0;
  if (b === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(b) / Math.log(k));
  return `${parseFloat((b / Math.pow(k, i)).toFixed(1))} ${sizes[i] || 'B'}`;
}

export function fileTypeInfo(fileName = '', mimeType = '') {
  const ext = String(fileName).split('.').pop().toLowerCase();
  const mime = String(mimeType).toLowerCase();

  if (['xlsx', 'xls', 'csv'].includes(ext) || mime.includes('spreadsheet') || mime.includes('excel')) {
    return { kind: 'excel', label: 'EXCEL', color: '#059669', bg: 'rgba(16, 185, 129, 0.1)' };
  }
  if (['docx', 'doc'].includes(ext) || mime.includes('word') || mime.includes('document')) {
    return { kind: 'word', label: 'WORD', color: '#2563eb', bg: 'rgba(37, 99, 235, 0.1)' };
  }
  if (ext === 'pdf' || mime.includes('pdf')) {
    return { kind: 'pdf', label: 'PDF', color: '#dc2626', bg: 'rgba(239, 68, 68, 0.1)' };
  }
  if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'].includes(ext) || mime.includes('image')) {
    return { kind: 'image', label: 'ẢNH', color: '#7c3aed', bg: 'rgba(124, 58, 237, 0.1)' };
  }
  if (['pptx', 'ppt'].includes(ext) || mime.includes('presentation')) {
    return { kind: 'slide', label: 'SLIDE', color: '#d97706', bg: 'rgba(217, 119, 6, 0.1)' };
  }
  if (['txt', 'md', 'json', 'log'].includes(ext) || mime.includes('text')) {
    return { kind: 'text', label: 'VĂN BẢN', color: '#475569', bg: 'rgba(71, 85, 105, 0.1)' };
  }
  return { kind: 'other', label: ext ? ext.toUpperCase() : 'TẬP TIN', color: '#475569', bg: 'rgba(71, 85, 105, 0.1)' };
}

export function documentsPage() {
  const c = currentClub();
  const allDocs = s.documents || [];
  const folders = s.documentFolders || [
    'Biên bản họp',
    'Kế hoạch & Đề án',
    'Tài chính & Thu chi',
    'Quy chế & Điều lệ',
    'Tài liệu khác',
  ];

  // Đếm số lượng file theo từng thư mục
  const countsByFolder = new Map();
  allDocs.forEach((doc) => {
    const f = doc.folder_name || 'Biên bản họp';
    countsByFolder.set(f, (countsByFolder.get(f) || 0) + 1);
  });

  // Lọc tài liệu theo thư mục đang chọn, từ khóa tìm kiếm và loại file
  const activeFolder = s.documentFolderFilter || '';
  const search = String(s.documentSearch || '').trim().toLowerCase();
  const activeType = s.documentTypeFilter || '';

  const filteredDocs = allDocs.filter((doc) => {
    if (activeFolder && doc.folder_name !== activeFolder) return false;
    if (activeType) {
      const info = fileTypeInfo(doc.file_name, doc.file_type);
      if (info.kind !== activeType) return false;
    }
    if (search) {
      const blob = [
        doc.name,
        doc.file_name,
        doc.folder_name,
        doc.notes,
        doc.uploader_name,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      if (!blob.includes(search)) return false;
    }
    return true;
  });

  return `
    <div class="page-top">
      <div>
        <div class="eyebrow">KHÔNG GIAN CÂU LẠC BỘ</div>
        <h1>Tài liệu & Hồ sơ CLB</h1>
        <p>Lưu trữ và phân loại các tài liệu, biên bản họp, đề án, báo cáo tài chính và bảng tính Excel.</p>
      </div>
      <div class="page-actions">
        <button type="button" class="button secondary" data-action="new-folder">Thêm thư mục</button>
        <button type="button" class="button" data-action="new-document">Tải lên tài liệu</button>
      </div>
    </div>

    <!-- Thanh phân loại theo Thư mục (Folder Tabs) -->
    <div class="doc-folders-bar" style="display:flex;align-items:center;gap:8px;overflow-x:auto;padding-bottom:8px;margin-bottom:16px;">
      <button type="button" class="doc-folder-pill ${!activeFolder ? 'active' : ''}" data-action="doc-select-folder" data-folder="" style="display:inline-flex;align-items:center;gap:6px;padding:7px 14px;border-radius:20px;border:1px solid ${!activeFolder ? 'var(--primary)' : 'var(--line)'};background:${!activeFolder ? 'var(--primary)' : 'var(--surface)'};color:${!activeFolder ? '#fff' : 'var(--text)'};font-size:13px;font-weight:600;cursor:pointer;white-space:nowrap;transition:all 0.15s ease;">
        <span>Tất cả thư mục</span>
        <span style="background:${!activeFolder ? 'rgba(255,255,255,0.25)' : 'var(--subtle)'};color:${!activeFolder ? '#fff' : 'var(--muted)'};padding:1px 7px;border-radius:10px;font-size:11px;">${allDocs.length}</span>
      </button>

      ${folders
        .map((folder) => {
          const count = countsByFolder.get(folder) || 0;
          const isSelected = activeFolder === folder;
          return `
            <button type="button" class="doc-folder-pill ${isSelected ? 'active' : ''}" data-action="doc-select-folder" data-folder="${e(folder)}" style="display:inline-flex;align-items:center;gap:6px;padding:7px 14px;border-radius:20px;border:1px solid ${isSelected ? 'var(--primary)' : 'var(--line)'};background:${isSelected ? 'var(--primary)' : 'var(--surface)'};color:${isSelected ? '#fff' : 'var(--text)'};font-size:13px;font-weight:600;cursor:pointer;white-space:nowrap;transition:all 0.15s ease;">
              <span>${e(folder)}</span>
              <span style="background:${isSelected ? 'rgba(255,255,255,0.25)' : 'var(--subtle)'};color:${isSelected ? '#fff' : 'var(--muted)'};padding:1px 7px;border-radius:10px;font-size:11px;">${count}</span>
            </button>
          `;
        })
        .join('')}
    </div>

    <!-- Thanh Tìm kiếm và Lọc định dạng -->
    <div class="panel" style="margin-bottom:16px;padding:12px 16px;">
      <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
        <label style="flex:1;min-width:220px;margin:0;display:flex;flex-direction:column;gap:4px;">
          <span style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:0.3px;">Tìm kiếm tài liệu</span>
          <input type="search" data-doc-search value="${e(s.documentSearch || '')}" placeholder="Tìm theo tên file, tiêu đề, ghi chú…" style="height:38px;padding:6px 12px;font-size:13px;border-radius:7px;border:1px solid var(--line);background:var(--surface);color:var(--text);margin:0;">
        </label>

        <label style="width:200px;min-width:160px;margin:0;display:flex;flex-direction:column;gap:4px;">
          <span style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:0.3px;">Loại tệp tin</span>
          <select data-doc-type style="height:38px;padding:6px 10px;font-size:13px;border-radius:7px;border:1px solid var(--line);background:var(--surface);color:var(--text);margin:0;">
            <option value="" ${!activeType ? 'selected' : ''}>Tất cả định dạng</option>
            <option value="excel" ${activeType === 'excel' ? 'selected' : ''}>Bảng tính (Excel / CSV)</option>
            <option value="word" ${activeType === 'word' ? 'selected' : ''}>Văn bản (Word / Docs)</option>
            <option value="pdf" ${activeType === 'pdf' ? 'selected' : ''}>Tài liệu PDF</option>
            <option value="image" ${activeType === 'image' ? 'selected' : ''}>Hình ảnh (PNG, JPG)</option>
            <option value="other" ${activeType === 'other' ? 'selected' : ''}>Khác</option>
          </select>
        </label>

        <div style="align-self:flex-end;padding-bottom:2px;">
          <span style="font-size:13px;color:var(--muted);font-weight:600;">Hiển thị: <strong style="color:var(--text);">${filteredDocs.length}</strong> / ${allDocs.length} tài liệu</span>
        </div>
      </div>
    </div>

    <!-- Danh sách Tài liệu -->
    <section class="panel">
      <div class="panel-head">
        <div>
          <h2>${activeFolder ? `Thư mục: ${e(activeFolder)}` : 'Toàn bộ tài liệu CLB'}</h2>
          <p>${activeFolder ? `Các tập tin và hồ sơ được lưu trong thư mục "${e(activeFolder)}".` : 'Danh sách tất cả các tập tin đã được tải lên không gian của câu lạc bộ. Bấm vào tài liệu để xem trước nội dung.'}</p>
        </div>
      </div>

      ${
        filteredDocs.length
          ? `
        <div class="doc-list" style="display:flex;flex-direction:column;">
          ${filteredDocs
            .map((doc) => {
              const info = fileTypeInfo(doc.file_name, doc.file_type);
              const downloadUrl = doc.download_url || doc.file_path;
              return `
              <div class="doc-item" style="display:flex;align-items:center;justify-content:space-between;padding:14px 18px;border-bottom:1px solid var(--line);gap:16px;flex-wrap:wrap;transition:background 0.15s ease;">
                <div style="display:flex;align-items:flex-start;gap:12px;min-width:0;flex:1;">
                  <span class="badge" style="background:${info.bg};color:${info.color};font-size:10px;font-weight:700;padding:3px 7px;border-radius:4px;flex-shrink:0;margin-top:2px;">${info.label}</span>
                  <div style="min-width:0;">
                    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                      <button type="button" class="doc-title-link" data-action="doc-preview" data-id="${doc.id}" style="text-align:left;font-size:14px;font-weight:700;color:var(--text);background:none;border:none;padding:0;cursor:pointer;word-break:break-word;" title="Bấm để xem trước nội dung">
                        ${e(doc.name)}
                      </button>
                      <span class="badge" style="background:var(--subtle);color:var(--muted);font-size:10px;font-weight:600;padding:1px 6px;">${e(doc.folder_name || 'Biên bản họp')}</span>
                    </div>
                    <div style="display:flex;align-items:center;gap:8px;margin-top:4px;font-size:12px;color:var(--muted);flex-wrap:wrap;">
                      <span>Tệp: ${e(doc.file_name)}</span>
                      <span>·</span>
                      <span>Dung lượng: ${formatFileSize(doc.file_size)}</span>
                      <span>·</span>
                      <span>Ngày tải: ${formatDate(String(doc.created_at || '').slice(0, 10))}</span>
                      ${doc.uploader_name ? `<span>·</span><span>Người đăng: ${e(doc.uploader_name)}</span>` : ''}
                    </div>
                    ${doc.notes ? `<p style="margin:4px 0 0;font-size:12px;color:var(--text-subtle, var(--muted));">Ghi chú: ${e(doc.notes)}</p>` : ''}
                  </div>
                </div>

                <div class="team-actions" style="display:flex;align-items:center;gap:8px;flex-shrink:0;">
                  <button type="button" class="button small secondary" data-action="doc-preview" data-id="${doc.id}" title="Xem trước nội dung tập tin">Xem trước</button>
                  ${
                    downloadUrl && downloadUrl !== '#' && !downloadUrl.startsWith('data:application/octet-stream;mock')
                      ? `<a href="${e(downloadUrl)}" target="_blank" rel="noopener noreferrer" download="${e(doc.file_name)}" class="button small secondary" style="text-decoration:none;" title="Tải xuống tập tin">
                          Tải về
                        </a>`
                      : ''
                  }
                  <button type="button" class="text-button" data-action="doc-edit" data-id="${doc.id}">Sửa</button>
                  <button type="button" class="text-button danger" data-action="doc-delete" data-id="${doc.id}">Xóa</button>
                </div>
              </div>
            `;
            })
            .join('')}
        </div>
      `
          : empty(
              activeFolder ? `Thư mục "${activeFolder}" chưa có tài liệu` : 'Chưa có tài liệu nào',
              'Tải lên các biên bản họp, đề án hoặc file bảng tính Excel để chia sẻ và lưu trữ trong CLB. Bạn có thể xem trước nội dung trước khi tải về.',
              'new-document',
              'Tải lên tài liệu ngay'
            )
      }
    </section>
  `;
}
