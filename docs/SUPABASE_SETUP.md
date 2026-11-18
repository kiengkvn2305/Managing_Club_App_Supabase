# Thiết lập Supabase

## 1. Tạo project

Tạo một project Supabase Free mới hoặc một database staging trống làm database target.

Trong Supabase Dashboard:

- Authentication → Providers → bật Email.
- Authentication → URL Configuration → đặt Site URL là URL local hoặc Cloudflare Pages.
- Thêm redirect URLs cho `http://127.0.0.1:5173` và domain Pages.

## 2. Chạy migration

Mở SQL Editor, paste toàn bộ:

```text
supabase/migrations/20261119000000_fcms_supabase.sql
```

Migration tạo schema, composite foreign keys, RLS, private Storage bucket, helper functions và transactional RPC. Không có seed account, password hoặc dữ liệu tài chính mẫu.

## 3. Cấu hình local

Tạo `frontend/.env.local`:

```env
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<publishable-or-anon-key>
```

Không đặt `service_role`, database password hoặc JWT secret vào file này. Các biến `VITE_*` được đưa vào browser bundle.

## 4. Chạy

```powershell
cd D:\Managing_Club_App_Supabase
npm --prefix frontend install
npm --prefix frontend run dev
```

Đăng ký account, xác minh email nếu project bật email confirmation, tạo CLB và thử chuyển CLB.

## 5. Kiểm tra dữ liệu và quyền

- Tạo hai account và hai CLB.
- Thêm mỗi account vào CLB khác nhau.
- Kiểm tra PostgREST không đọc được rows của CLB không có membership.
- Kiểm tra role/title trước khi thử finance, kho và discipline.
- Chạy `npm run test:supabase` cho static gate; runtime RLS cần chạy trên staging project thật.
