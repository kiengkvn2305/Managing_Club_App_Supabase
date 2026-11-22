import { openDocumentPreview } from '../document-preview.js';

export function createDocumentController(ctx) {
  function openUploadDialog() {
    const folders = ctx.state.documentFolders || [
      'Biên bản họp',
      'Kế hoạch & Đề án',
      'Tài chính & Thu chi',
      'Quy chế & Điều lệ',
      'Tài liệu khác',
    ];

    const fields = `
      <div style="display:flex;flex-direction:column;gap:12px;">
        <label class="field" style="margin:0;">
          <span style="display:block;font-size:13px;font-weight:600;margin-bottom:4px;">Chọn tập tin từ thiết bị *</span>
          <input type="file" name="doc_file" required style="width:100%;padding:8px;border:1px dashed var(--line);border-radius:8px;background:var(--surface);">
          <small style="color:var(--muted);font-size:11px;margin-top:2px;">Hỗ trợ Excel (.xlsx, .csv), Word (.docx), PDF, PowerPoint, Hình ảnh...</small>
        </label>

        <label class="field" style="margin:0;">
          <span style="display:block;font-size:13px;font-weight:600;margin-bottom:4px;">Tên tài liệu / Tiêu đề *</span>
          <input type="text" name="name" placeholder="VD: Biên bản họp BCN tháng 11/2026" required style="width:100%;height:38px;padding:6px 10px;border-radius:7px;border:1px solid var(--line);background:var(--surface);color:var(--text);">
        </label>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
          <label class="field" style="margin:0;">
            <span style="display:block;font-size:13px;font-weight:600;margin-bottom:4px;">Thư mục lưu trữ</span>
            <select name="folder_choice" style="width:100%;height:38px;padding:6px 10px;border-radius:7px;border:1px solid var(--line);background:var(--surface);color:var(--text);">
              ${folders.map((f) => `<option value="${ctx.e(f)}">${ctx.e(f)}</option>`).join('')}
              <option value="__custom__">+ Thư mục mới…</option>
            </select>
          </label>

          <label class="field custom-folder-field" hidden style="margin:0;">
            <span style="display:block;font-size:13px;font-weight:600;margin-bottom:4px;">Tên thư mục mới</span>
            <input type="text" name="custom_folder" placeholder="Nhập tên thư mục mới" style="width:100%;height:38px;padding:6px 10px;border-radius:7px;border:1px solid var(--line);background:var(--surface);color:var(--text);">
          </label>
        </div>

        <label class="field" style="margin:0;">
          <span style="display:block;font-size:13px;font-weight:600;margin-bottom:4px;">Ghi chú / Mô tả nội dung</span>
          <textarea name="notes" rows="2" placeholder="Ghi chú nội dung chính của tài liệu hoặc người lập…" style="width:100%;padding:8px 10px;border-radius:7px;border:1px solid var(--line);background:var(--surface);color:var(--text);"></textarea>
        </label>
      </div>
    `;

    const modal = ctx.dialog(
      'Tải lên tài liệu',
      'Lưu trữ hồ sơ, biên bản họp và tài liệu bảng tính vào câu lạc bộ.',
      fields,
      async (form) => {
        const fileInput = form.querySelector('input[name="doc_file"]');
        const file = fileInput.files && fileInput.files[0];
        if (!file) {
          ctx.toast('Vui lòng chọn một tập tin từ máy của bạn.', true);
          return false;
        }

        const name = form.elements.name.value.trim() || file.name;
        const folderChoice = form.elements.folder_choice.value;
        const customFolder = form.elements.custom_folder?.value.trim();
        const folder = folderChoice === '__custom__' ? customFolder || 'Biên bản họp' : folderChoice;
        const notes = form.elements.notes.value.trim();

        // Đọc dữ liệu file
        const toBase64 = (f) =>
          new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(f);
            reader.onload = () => resolve(reader.result);
            reader.onerror = (err) => reject(err);
          });

        let fileContent = '';
        try {
          fileContent = await toBase64(file);
        } catch {
          fileContent = '';
        }

        try {
          await ctx.api.post(ctx.base('/documents'), {
            name,
            folder_name: folder,
            notes,
            file_name: file.name,
            file_size: file.size,
            file_type: file.type,
            file_content: fileContent,
          });

          ctx.toast('Đã tải lên tài liệu thành công!');
          await ctx.loadView();
          return true;
        } catch (error) {
          ctx.toast(error.message || 'Lỗi khi tải lên tài liệu.', true);
          return false;
        }
      },
      'Tải lên'
    );

    // Xử lý tự động điền tên khi chọn file
    const fileInput = modal.querySelector('input[name="doc_file"]');
    const nameInput = modal.querySelector('input[name="name"]');
    fileInput.addEventListener('change', () => {
      if (fileInput.files && fileInput.files[0] && !nameInput.value) {
        const fname = fileInput.files[0].name.replace(/\.[^/.]+$/, '');
        nameInput.value = fname;
      }
    });

    // Xử lý ẩn/hiện nhập thư mục mới
    const folderSelect = modal.querySelector('select[name="folder_choice"]');
    const customField = modal.querySelector('.custom-folder-field');
    folderSelect.addEventListener('change', () => {
      customField.hidden = folderSelect.value !== '__custom__';
    });
  }

  function openNewFolderDialog() {
    const fields = `
      <label class="field" style="margin:0;">
        <span style="display:block;font-size:13px;font-weight:600;margin-bottom:4px;">Tên thư mục mới *</span>
        <input type="text" name="folder_name" placeholder="VD: Báo cáo mùa giải 2026" required style="width:100%;height:38px;padding:6px 10px;border-radius:7px;border:1px solid var(--line);background:var(--surface);color:var(--text);">
      </label>
    `;

    ctx.dialog(
      'Thêm thư mục tài liệu',
      'Tạo thư mục để phân loại biên bản, đề án hoặc tài chính.',
      fields,
      async (form) => {
        const folderName = form.elements.folder_name.value.trim();
        if (!folderName) {
          ctx.toast('Vui lòng nhập tên thư mục.', true);
          return false;
        }

        const currentFolders = ctx.state.documentFolders || [];
        if (!currentFolders.includes(folderName)) {
          ctx.state.documentFolders = [...currentFolders, folderName];
        }
        ctx.state.documentFolderFilter = folderName;
        ctx.render();
        ctx.toast(`Đã thêm thư mục "${folderName}"!`);
        return true;
      },
      'Thêm thư mục'
    );
  }

  function openEditDocumentDialog(doc) {
    const folders = ctx.state.documentFolders || [
      'Biên bản họp',
      'Kế hoạch & Đề án',
      'Tài chính & Thu chi',
      'Quy chế & Điều lệ',
      'Tài liệu khác',
    ];

    const fields = `
      <div style="display:flex;flex-direction:column;gap:12px;">
        <label class="field" style="margin:0;">
          <span style="display:block;font-size:13px;font-weight:600;margin-bottom:4px;">Tên tài liệu / Tiêu đề *</span>
          <input type="text" name="name" value="${ctx.e(doc.name)}" required style="width:100%;height:38px;padding:6px 10px;border-radius:7px;border:1px solid var(--line);background:var(--surface);color:var(--text);">
        </label>

        <label class="field" style="margin:0;">
          <span style="display:block;font-size:13px;font-weight:600;margin-bottom:4px;">Thư mục</span>
          <select name="folder_name" style="width:100%;height:38px;padding:6px 10px;border-radius:7px;border:1px solid var(--line);background:var(--surface);color:var(--text);">
            ${folders.map((f) => `<option value="${ctx.e(f)}" ${f === doc.folder_name ? 'selected' : ''}>${ctx.e(f)}</option>`).join('')}
          </select>
        </label>

        <label class="field" style="margin:0;">
          <span style="display:block;font-size:13px;font-weight:600;margin-bottom:4px;">Ghi chú</span>
          <textarea name="notes" rows="2" style="width:100%;padding:8px 10px;border-radius:7px;border:1px solid var(--line);background:var(--surface);color:var(--text);">${ctx.e(doc.notes || '')}</textarea>
        </label>
      </div>
    `;

    ctx.dialog(
      'Chỉnh sửa tài liệu',
      `Tập tin: ${doc.file_name}`,
      fields,
      async (form) => {
        const name = form.elements.name.value.trim();
        const folder_name = form.elements.folder_name.value.trim();
        const notes = form.elements.notes.value.trim();

        if (!name) {
          ctx.toast('Vui lòng nhập tên tài liệu.', true);
          return false;
        }

        try {
          await ctx.api.patch(ctx.base(`/documents/${doc.id}`), {
            name,
            folder_name,
            notes,
          });
          ctx.toast('Đã cập nhật thông tin tài liệu.');
          await ctx.loadView();
          return true;
        } catch (error) {
          ctx.toast(error.message || 'Lỗi khi cập nhật tài liệu.', true);
          return false;
        }
      },
      'Lưu thay đổi'
    );
  }

  async function handleAction(a, el) {
    if (a === 'new-document') {
      openUploadDialog();
      return true;
    }

    if (a === 'new-folder') {
      openNewFolderDialog();
      return true;
    }

    if (a === 'doc-select-folder') {
      const folder = el.dataset.folder || '';
      ctx.state.documentFolderFilter = folder;
      ctx.render();
      return true;
    }

    if (a === 'doc-preview') {
      const id = el.dataset.id;
      const doc = (ctx.state.documents || []).find((d) => String(d.id) === String(id));
      if (doc) {
        openDocumentPreview(doc, ctx);
      }
      return true;
    }

    if (a === 'doc-edit') {
      const id = el.dataset.id;
      const doc = (ctx.state.documents || []).find((d) => String(d.id) === String(id));
      if (doc) openEditDocumentDialog(doc);
      return true;
    }

    if (a === 'doc-delete') {
      const id = el.dataset.id;
      const doc = (ctx.state.documents || []).find((d) => String(d.id) === String(id));
      if (!doc) return true;

      const confirmed = window.confirm(`Bạn có chắc muốn xóa tài liệu "${doc.name}" không?`);
      if (!confirmed) return true;

      try {
        await ctx.api.delete(ctx.base(`/documents/${id}`));
        ctx.toast('Đã xóa tài liệu khỏi hệ thống.');
        await ctx.loadView();
      } catch (error) {
        ctx.toast(error.message || 'Lỗi khi xóa tài liệu.', true);
      }
      return true;
    }

    return false;
  }

  return {
    handleAction,
  };
}
