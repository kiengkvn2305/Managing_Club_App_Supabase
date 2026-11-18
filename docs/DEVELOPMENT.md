# Phát triển

Frontend nằm trong `frontend/`, chỉ dùng HTML/CSS/Vanilla JavaScript/ES modules/Vite. Supabase adapter nằm tại [supabase-api.js](../frontend/src/supabase-api.js); production entrypoint là [api-supabase.js](../frontend/src/api-supabase.js).

```powershell
npm run setup
npm run dev
```

Các module không được tạo mock production data. Mọi mutation phải dùng PostgREST có RLS hoặc RPC tương ứng. Thay đổi giao diện phải giữ responsive/PWA và chạy `npm test` + `npm run build` trước khi bàn giao.
