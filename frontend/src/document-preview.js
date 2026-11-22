import { escapeHtml as e, formatDate } from './utils.js';
import { formatFileSize, fileTypeInfo } from './views/documents-page.js';

export async function openDocumentPreview(doc, { dialog, toast }) {
  const info = fileTypeInfo(doc.file_name, doc.file_type);
  const downloadUrl = doc.download_url || doc.file_path;
  const isUrlValid = downloadUrl && downloadUrl !== '#' && !downloadUrl.startsWith('data:application/octet-stream;mock');

  let initialContent = '';

  if (info.kind === 'image' && isUrlValid) {
    initialContent = `
      <div style="text-align:center;padding:16px;background:var(--subtle);border-radius:8px;">
        <img src="${e(downloadUrl)}" alt="${e(doc.name)}" style="max-width:100%;max-height:65vh;object-fit:contain;border-radius:6px;box-shadow:0 2px 10px rgba(0,0,0,0.15);">
      </div>
    `;
  } else if (info.kind === 'pdf' && isUrlValid) {
    initialContent = `
      <div style="height:68vh;border:1px solid var(--line);border-radius:8px;overflow:hidden;">
        <iframe src="${e(downloadUrl)}#toolbar=0" style="width:100%;height:100%;border:none;" title="Xem trước tài liệu PDF"></iframe>
      </div>
    `;
  } else if (['excel', 'word', 'text'].includes(info.kind)) {
    initialContent = `
      <div data-doc-preview-loading style="padding:32px 16px;text-align:center;color:var(--muted);font-size:13.5px;background:var(--subtle);border-radius:8px;border:1px dashed var(--line);">
        <p style="margin:0 0 6px;font-weight:600;color:var(--text);">Đang đọc và giải nén nội dung tập tin...</p>
        <span style="font-size:12px;">Hệ thống đang trích xuất dữ liệu bên trong để bạn xem trước nội dung.</span>
      </div>
      <div data-doc-preview-container style="display:none;"></div>
    `;
  } else {
    initialContent = `
      <div style="padding:28px 20px;text-align:center;background:var(--subtle);border-radius:8px;border:1px solid var(--line);">
        <strong style="display:block;font-size:15px;color:var(--text);margin-bottom:6px;">Tập tin: ${e(doc.file_name)}</strong>
        <p style="font-size:13px;color:var(--muted);margin:0 0 12px;">Định dạng này (${e(info.label)}) được khuyến khích tải về để mở bằng phần mềm chuyên dụng trên thiết bị.</p>
        ${doc.notes ? `<div style="text-align:left;max-width:500px;margin:12px auto 0;padding:10px 14px;background:var(--surface);border:1px solid var(--line);border-radius:6px;font-size:13px;"><strong>Ghi chú:</strong> ${e(doc.notes)}</div>` : ''}
      </div>
    `;
  }

  const fields = `
    <div class="doc-preview-modal" style="display:flex;flex-direction:column;gap:12px;">
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;padding-bottom:10px;border-bottom:1px solid var(--line);font-size:12.5px;color:var(--muted);">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
          <span class="badge" style="background:${info.bg};color:${info.color};font-weight:700;font-size:11px;">${info.label}</span>
          <span>Thư mục: <strong style="color:var(--text);">${e(doc.folder_name || 'Biên bản họp')}</strong></span>
          <span>·</span>
          <span>Tệp: <strong style="color:var(--text);">${e(doc.file_name)}</strong></span>
          <span>·</span>
          <span>Dung lượng: ${formatFileSize(doc.file_size)}</span>
        </div>
        <div>
          <span>Ngày tải: ${formatDate(String(doc.created_at || '').slice(0, 10))}</span>
          ${doc.uploader_name ? ` · <span>Người đăng: ${e(doc.uploader_name)}</span>` : ''}
        </div>
      </div>

      ${doc.notes && info.kind !== 'other' ? `
        <div style="padding:8px 12px;background:var(--subtle);border-left:3px solid var(--primary);border-radius:0 6px 6px 0;font-size:12.5px;color:var(--text);">
          <strong>Ghi chú tài liệu:</strong> ${e(doc.notes)}
        </div>
      ` : ''}

      <div class="doc-preview-body" style="min-height:200px;">
        ${initialContent}
      </div>

      <div style="display:flex;align-items:center;justify-content:flex-end;gap:10px;padding-top:10px;border-top:1px solid var(--line);margin-top:4px;">
        ${
          isUrlValid
            ? `<a href="${e(downloadUrl)}" target="_blank" rel="noopener noreferrer" download="${e(doc.file_name)}" class="button primary" style="text-decoration:none;">Tải về tập tin</a>`
            : ''
        }
      </div>
    </div>
  `;

  const modal = dialog(
    doc.name || doc.file_name,
    'Xem trước nội dung chi tiết của tài liệu trước khi tải xuống máy tính hoặc điện thoại.',
    fields,
    async () => true,
    'Đóng'
  );

  modal.classList.add('member-picker-dialog');
  modal.style.width = 'min(980px, 96vw)';

  // Xử lý nạp dữ liệu chi tiết cho Excel, Word và Text
  const loadingEl = modal.querySelector('[data-doc-preview-loading]');
  const containerEl = modal.querySelector('[data-doc-preview-container]');

  if (!loadingEl || !containerEl || !isUrlValid) return modal;

  (async () => {
    try {
      const res = await fetch(downloadUrl);
      if (!res.ok) throw new Error('Không thể tải tệp tin để xem trước.');

      // 1. Xem trước Excel
      if (info.kind === 'excel') {
        if (doc.file_name.toLowerCase().endsWith('.csv')) {
          const text = await res.text();
          const lines = text.split(/\r?\n/).filter(Boolean).slice(0, 100);
          const rows = lines.map((l) => l.split(','));
          if (rows.length) {
            const thead = rows[0].map((h) => `<th style="padding:8px 10px;background:var(--subtle);border:1px solid var(--line);font-size:12px;font-weight:700;">${e(h.trim())}</th>`).join('');
            const tbody = rows.slice(1).map((r) => `<tr>${r.map((c) => `<td style="padding:6px 10px;border:1px solid var(--line);font-size:12px;">${e(c.trim())}</td>`).join('')}</tr>`).join('');
            containerEl.innerHTML = `
              <div style="margin-bottom:6px;font-size:12px;color:var(--muted);font-weight:600;">Xem trước định dạng bảng tính CSV (${lines.length} dòng):</div>
              <div style="overflow:auto;max-height:56vh;border:1px solid var(--line);border-radius:6px;">
                <table style="width:100%;border-collapse:collapse;white-space:nowrap;">
                  <thead><tr>${thead}</tr></thead>
                  <tbody>${tbody}</tbody>
                </table>
              </div>
            `;
            loadingEl.style.display = 'none';
            containerEl.style.display = 'block';
            return;
          }
        }

        // Tệp XLSX
        const buffer = await res.arrayBuffer();
        let excelModule;
        try { excelModule = await import('exceljs'); } catch {}
        const Excel = excelModule?.default || excelModule;

        if (Excel) {
          const wb = new Excel.Workbook();
          await wb.xlsx.load(buffer);
          const sheet = wb.worksheets[0];

          if (sheet) {
            const rows = [];
            sheet.eachRow({ includeEmpty: false }, (r, rowNumber) => {
              if (rowNumber <= 120) {
                const vals = [];
                r.eachCell({ includeEmpty: true }, (c, colNumber) => {
                  if (colNumber <= 25) {
                    vals.push(c.text || (c.value != null ? String(c.value) : ''));
                  }
                });
                if (vals.some(Boolean)) rows.push(vals);
              }
            });

            if (rows.length) {
              const thead = rows[0].map((h) => `<th style="padding:8px 12px;background:var(--subtle);border:1px solid var(--line);font-size:12px;font-weight:700;text-align:left;">${e(h)}</th>`).join('');
              const tbody = rows.slice(1).map((r) => `<tr>${r.map((c) => `<td style="padding:6px 10px;border:1px solid var(--line);font-size:12px;">${e(c)}</td>`).join('')}</tr>`).join('');

              containerEl.innerHTML = `
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;font-size:12px;color:var(--muted);font-weight:600;">
                  <span>Trang tính: <strong style="color:var(--text);">${e(sheet.name)}</strong></span>
                  <span>Hiển thị ${rows.length} dòng đầu tiên</span>
                </div>
                <div style="overflow:auto;max-height:56vh;border:1px solid var(--line);border-radius:6px;background:var(--surface);">
                  <table style="width:100%;border-collapse:collapse;white-space:nowrap;">
                    <thead><tr>${thead}</tr></thead>
                    <tbody>${tbody}</tbody>
                  </table>
                </div>
              `;
              loadingEl.style.display = 'none';
              containerEl.style.display = 'block';
              return;
            }
          }
        }
      }

      // 2. Xem trước Word (.docx)
      if (info.kind === 'word') {
        const buffer = await res.arrayBuffer();
        let zipModule;
        try { zipModule = await import('jszip'); } catch {}
        const JSZip = zipModule?.default || zipModule;

        if (JSZip) {
          const zip = await JSZip.loadAsync(buffer);
          const xmlFile = zip.file('word/document.xml');

          if (xmlFile) {
            const xmlText = await xmlFile.async('text');
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(xmlText, 'text/xml');
            const pElements = xmlDoc.getElementsByTagName('w:p');
            const paragraphs = [];

            for (let i = 0; i < pElements.length; i++) {
              const tElements = pElements[i].getElementsByTagName('w:t');
              let paragraphText = '';
              for (let j = 0; j < tElements.length; j++) {
                paragraphText += tElements[j].textContent || '';
              }
              if (paragraphText.trim()) {
                paragraphs.push(paragraphText.trim());
              }
            }

            if (paragraphs.length) {
              containerEl.innerHTML = `
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;font-size:12px;color:var(--muted);font-weight:600;">
                  <span>Nội dung trích xuất từ văn bản Word:</span>
                  <span>${paragraphs.length} đoạn văn</span>
                </div>
                <div style="padding:22px 26px;background:var(--surface);border:1px solid var(--line);border-radius:8px;max-height:56vh;overflow-y:auto;line-height:1.8;font-size:14px;color:var(--text);box-shadow:inset 0 1px 3px rgba(0,0,0,0.03);">
                  ${paragraphs.map((p) => `<p style="margin:0 0 14px;text-align:justify;">${e(p)}</p>`).join('')}
                </div>
              `;
              loadingEl.style.display = 'none';
              containerEl.style.display = 'block';
              return;
            }
          }
        }
      }

      // 3. Xem trước Văn bản / Text
      if (info.kind === 'text') {
        const text = await res.text();
        containerEl.innerHTML = `
          <div style="margin-bottom:6px;font-size:12px;color:var(--muted);font-weight:600;">Nội dung tệp văn bản:</div>
          <pre style="padding:16px 20px;background:var(--subtle);border:1px solid var(--line);border-radius:8px;max-height:56vh;overflow:auto;font-family:monospace;font-size:13px;line-height:1.6;color:var(--text);white-space:pre-wrap;margin:0;">${e(text.slice(0, 50000))}</pre>
        `;
        loadingEl.style.display = 'none';
        containerEl.style.display = 'block';
        return;
      }
    } catch (err) {
      console.warn('Lỗi xem trước tệp:', err);
    }

    // Fallback nếu không parse được nội dung trực tiếp
    loadingEl.innerHTML = `
      <div style="padding:12px;color:var(--text);">
        <p style="margin:0 0 8px;font-size:14px;font-weight:600;">Tập tin: ${e(doc.file_name)} (${formatFileSize(doc.file_size)})</p>
        <p style="margin:0;font-size:13px;color:var(--muted);">Tài liệu này được lưu trữ an toàn trong kho lưu trữ của câu lạc bộ. Vui lòng bấm <strong>Tải về tập tin</strong> ở góc dưới để mở xem đầy đủ bằng ứng dụng trên máy.</p>
      </div>
    `;
  })();

  return modal;
}
