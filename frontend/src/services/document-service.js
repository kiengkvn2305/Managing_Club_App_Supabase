import { check, SupabaseApiError } from './service-helpers.js';

const DEFAULT_FOLDERS = [
  'Biên bản họp',
  'Kế hoạch & Đề án',
  'Tài chính & Thu chi',
  'Quy chế & Điều lệ',
  'Tài liệu khác',
];

export function createDocumentService({ supabase, authService }) {
  // Bộ nhớ đệm fallback trong trường hợp chưa chạy migration tạo bảng trên môi trường test/local
  const memoryStore = new Map();

  function getLocalDocs(clubId) {
    if (typeof localStorage !== 'undefined') {
      try {
        const raw = localStorage.getItem(`fcms_docs_${clubId}`);
        if (raw) return JSON.parse(raw);
      } catch {}
    }
    return memoryStore.get(String(clubId)) || [];
  }

  function saveLocalDocs(clubId, list) {
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(`fcms_docs_${clubId}`, JSON.stringify(list));
      } catch {}
    }
    memoryStore.set(String(clubId), list);
  }

  async function handleDocumentRequest(clean, method, data, params, clubId) {
    if (!clubId) return null;

    // 1. GET /clubs/:id/documents
    if (clean === `/clubs/${clubId}/documents` && method === 'GET') {
      let rows = [];
      let dbFailed = false;

      try {
        const result = await supabase
          .from('club_documents')
          .select('id,club_id,folder_name,name,file_name,file_path,file_size,file_type,notes,created_by,created_at,updated_at,creator:profiles(id,name,email)')
          .eq('club_id', clubId)
          .order('created_at', { ascending: false });

        if (result.error) {
          dbFailed = true;
        } else {
          rows = result.data || [];
        }
      } catch {
        dbFailed = true;
      }

      if (dbFailed) {
        rows = getLocalDocs(clubId);
      }

      // Tạo Signed URL tải file an toàn từ Storage nếu có
      const enriched = await Promise.all(
        rows.map(async (row) => {
          let downloadUrl = row.file_path;
          if (row.file_path && !row.file_path.startsWith('data:') && !row.file_path.startsWith('blob:') && !row.file_path.startsWith('http')) {
            try {
              const signed = await supabase.storage
                .from('fcms-private')
                .createSignedUrl(row.file_path, 3600);
              if (signed.data?.signedUrl) {
                downloadUrl = signed.data.signedUrl;
              }
            } catch {}
          }
          return {
            ...row,
            download_url: downloadUrl,
            uploader_name: row.creator?.name || row.creator?.email || 'Thành viên',
          };
        })
      );

      const existingFolders = new Set(enriched.map((d) => d.folder_name).filter(Boolean));
      const folders = [
        ...DEFAULT_FOLDERS,
        ...Array.from(existingFolders).filter((f) => !DEFAULT_FOLDERS.includes(f)),
      ];

      return {
        data: enriched,
        folders,
      };
    }

    // 2. POST /clubs/:id/documents
    if (clean === `/clubs/${clubId}/documents` && method === 'POST') {
      const user = await authService.user(true);
      const name = String(data.name || '').trim();
      const folder = String(data.folder_name || 'Biên bản họp').trim();
      const notes = String(data.notes || '').trim();
      const fileName = String(data.file_name || 'tai_lieu.pdf').trim();
      const fileSize = Number(data.file_size || 0);
      const fileType = String(data.file_type || 'application/octet-stream');
      const fileContent = data.file_content || data.file;

      if (!name) {
        throw new SupabaseApiError('Vui lòng nhập tên tài liệu.', 422);
      }

      let filePath = '';
      if (fileContent instanceof Blob || (typeof File !== 'undefined' && fileContent instanceof File)) {
        const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
        filePath = `clubs/${clubId}/documents/${Date.now()}_${safeName}`;
        try {
          const uploadRes = await supabase.storage
            .from('fcms-private')
            .upload(filePath, fileContent, { upsert: true });
          if (uploadRes.error) {
            filePath = `data:${fileType};base64,...`;
          }
        } catch {
          filePath = `data:${fileType};base64,...`;
        }
      } else if (typeof fileContent === 'string' && fileContent) {
        filePath = fileContent;
      } else {
        filePath = `data:${fileType};mock`;
      }

      let inserted = null;
      try {
        const result = await supabase
          .from('club_documents')
          .insert({
            club_id: clubId,
            folder_name: folder,
            name,
            file_name: fileName,
            file_path: filePath,
            file_size: fileSize,
            file_type: fileType,
            notes,
            created_by: user.id,
          })
          .select('*,creator:profiles(id,name,email)')
          .single();

        if (!result.error && result.data) {
          inserted = result.data;
        }
      } catch {}

      if (!inserted) {
        inserted = {
          id: Date.now(),
          club_id: clubId,
          folder_name: folder,
          name,
          file_name: fileName,
          file_path: filePath,
          file_size: fileSize,
          file_type: fileType,
          notes,
          created_by: user.id,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          creator: { id: user.id, name: user.name || user.email },
        };
        const localList = getLocalDocs(clubId);
        localList.unshift(inserted);
        saveLocalDocs(clubId, localList);
      }

      return {
        data: {
          ...inserted,
          download_url: inserted.file_path,
          uploader_name: user.name || user.email || 'Thành viên',
        },
      };
    }

    // 3. PATCH /clubs/:id/documents/:docId
    const patchMatch = clean.match(new RegExp(`^/clubs/${clubId}/documents/(\\d+)$`));
    if (patchMatch && method === 'PATCH') {
      const docId = Number(patchMatch[1]);
      const updates = {};
      if (data.name !== undefined) updates.name = String(data.name).trim();
      if (data.folder_name !== undefined) updates.folder_name = String(data.folder_name).trim();
      if (data.notes !== undefined) updates.notes = String(data.notes).trim();

      try {
        await supabase
          .from('club_documents')
          .update(updates)
          .eq('club_id', clubId)
          .eq('id', docId);
      } catch {}

      const localList = getLocalDocs(clubId);
      const target = localList.find((d) => Number(d.id) === docId);
      if (target) {
        Object.assign(target, updates);
        saveLocalDocs(clubId, localList);
      }

      return { data: { success: true, id: docId, ...updates } };
    }

    // 4. DELETE /clubs/:id/documents/:docId
    const deleteMatch = clean.match(new RegExp(`^/clubs/${clubId}/documents/(\\d+)$`));
    if (deleteMatch && method === 'DELETE') {
      const docId = Number(deleteMatch[1]);

      try {
        const { data: found } = await supabase
          .from('club_documents')
          .select('file_path')
          .eq('club_id', clubId)
          .eq('id', docId)
          .maybeSingle();

        if (found?.file_path && !found.file_path.startsWith('data:')) {
          await supabase.storage.from('fcms-private').remove([found.file_path]).catch(() => {});
        }

        await supabase
          .from('club_documents')
          .delete()
          .eq('club_id', clubId)
          .eq('id', docId);
      } catch {}

      const localList = getLocalDocs(clubId).filter((d) => Number(d.id) !== docId);
      saveLocalDocs(clubId, localList);

      return { data: { success: true, id: docId } };
    }

    return null;
  }

  return {
    handleDocumentRequest,
  };
}
