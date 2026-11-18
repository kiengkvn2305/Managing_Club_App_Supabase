# FCMS PRO — Supabase Edition

FCMS PRO dùng Supabase Auth, PostgreSQL/RLS/RPC/Storage, Vanilla JavaScript + Vite và Cloudflare Pages.

## Chạy nhanh

```powershell
cd D:\Managing_Club_App_Supabase
npm run setup
npm start
```

Mở http://127.0.0.1:5173.

Để đăng nhập và dùng dữ liệu thật, chạy migration [supabase/migrations/20261119000000_fcms_supabase.sql](supabase/migrations/20261119000000_fcms_supabase.sql), sau đó tạo `frontend/.env.local`:

```env
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<publishable-or-anon-key>
```

Không đưa `service_role`, database password hoặc JWT secret vào frontend.

## Lệnh phát triển

```powershell
npm run dev
npm run test:frontend
npm run test:supabase
npm run build
```

`npm start`/`npm run dev` chỉ chạy Vite frontend; dữ liệu và authentication đi qua Supabase.

## Tài liệu

- [Thiết lập Supabase](docs/SUPABASE_SETUP.md)
- [Deploy Cloudflare Pages](docs/CLOUDFLARE_DEPLOY.md)
- [Cài PWA](docs/PWA_INSTALL.md)
- [Migration checklist](docs/MIGRATION_CHECKLIST.md)
- [Backup/restore](docs/BACKUP_RESTORE.md)
- [Tiến độ](PROGRESS.md)
- [Bước tiếp theo](NEXT_STEPS.md)

## Trạng thái xác minh

Kết quả gần nhất: 30 frontend tests, 4 Supabase static tests, database test 10/10, database lint sạch và Vite build PASS trên Supabase local. Cần chạy thêm staging integration và device smoke test trước khi phát hành. Xem [docs/TESTING.md](docs/TESTING.md).
