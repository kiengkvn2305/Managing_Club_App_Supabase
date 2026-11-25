# Checklist phát hành FCMS PRO

## Database và bảo mật

- [x] Đọc và đối chiếu [ma trận quyền database](./DATABASE_PERMISSIONS.md) với cấu trúc migrations & RLS.
- [x] Migrations lịch sử đã áp dụng cho hệ thống (`20261119000000`–`20261125000004`, đồng bộ 36/36 file giữa local và production `dandxiwdedbwxtvokeag`).
- [x] `npx supabase db lint` không có lỗi *(đã đồng bộ toàn bộ migrations lên production `dandxiwdedbwxtvokeag` và chạy `npx supabase db lint --linked`: 0 lỗi schema, 0 cảnh báo)*.
- [ ] `npx supabase test db` đạt *(cần bật Docker Desktop để chạy local pgTAP; `scripts/supabase.test.mjs` 9/9 PASS)*.
- [x] RLS chặn truy cập chéo CLB (đã kiểm chứng qua `scripts/supabase.test.mjs` & `qa-reports/evidence/integration.json`).
- [x] Một tài khoản nhiều CLB và nhiều quản lý một CLB đã kiểm thử.
- [x] Không có service key hoặc database password trong bundle (`dist/assets/*.js`: 0 leaks).

## Ứng dụng

- [x] Đăng ký, đăng nhập, đăng xuất, refresh session và reset password.
- [x] Tạo CLB, đội, thành viên, lời mời và phân quyền.
- [x] Import/export Excel có validation và giới hạn kích thước (đã test 500 dòng, chặn >500 dòng & >5 MB, chống formula injection).
- [x] Giao dịch tài chính dùng RPC transaction, idempotency và audit.
- [x] Kho, trận đấu, điểm danh, báo cáo, trang công khai CLB, thông báo tự động và các module mục tiêu đã có test (91/91 frontend tests PASS).

## Deploy

- [x] `npm run setup`.
- [x] `npm test` (91/91 frontend tests + 9/9 structural tests PASS).
- [x] `npm run build` (128 modules, sạch sẽ).
- [x] Cloudflare root directory là `frontend`.
- [x] Build command là `npm run build`.
- [x] Output directory là `dist`.
- [ ] Đã cấu hình hai biến `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` trên Cloudflare Dashboard *(cần xác nhận thủ công trên trang cấu hình Cloudflare Pages)*.
- [x] Đã test SPA fallback, PWA manifest và service worker (verified qua local preview & `scripts/qa-production.mjs`).
- [ ] Đã thử nghiệm trên Chrome Android, Safari iPhone và Windows *(cần smoke test thủ công trên thiết bị di động thật)*.
