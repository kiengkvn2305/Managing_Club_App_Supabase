# Cài đặt môi trường

Yêu cầu Node.js 22.12+ (khuyến nghị Node 24 LTS). Docker Desktop và Supabase CLI được khuyến nghị cho kiểm thử database local.

```powershell
cd D:\Managing_Club_App_Supabase
npm run setup
```

Tạo `frontend/.env.local` từ [frontend/.env.example](../frontend/.env.example), chạy migration Supabase rồi:

```powershell
npm start
```

Mở http://127.0.0.1:5173. Nếu chưa có biến Supabase, ứng dụng vẫn mở được UI nhưng thao tác Auth/data sẽ báo thiếu cấu hình.
