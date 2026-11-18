# Checklist phát hành FCMS PRO

## Database và bảo mật

- [ ] Đọc và đối chiếu [ma trận quyền database](./DATABASE_PERMISSIONS.md) với remote.
- [ ] Migrations chạy sạch trên staging.
- [ ] `npx supabase db lint` không có lỗi.
- [ ] `npx supabase test db` đạt.
- [ ] RLS chặn truy cập chéo CLB.
- [ ] Một tài khoản nhiều CLB và nhiều quản lý một CLB đã kiểm thử.
- [ ] Không có service key hoặc database password trong bundle.

## Ứng dụng

- [ ] Đăng ký, đăng nhập, đăng xuất, refresh session và reset password.
- [ ] Tạo CLB, đội, thành viên, lời mời và phân quyền.
- [ ] Import/export Excel có validation và giới hạn kích thước.
- [ ] Giao dịch tài chính dùng RPC transaction, idempotency và audit.
- [ ] Kho, trận đấu, điểm danh, báo cáo và các module mục tiêu đã có test.

## Deploy

- [ ] `npm run setup`.
- [ ] `npm test`.
- [ ] `npm run build`.
- [ ] Cloudflare root directory là `frontend`.
- [ ] Build command là `npm run build`.
- [ ] Output directory là `dist`.
- [ ] Đã cấu hình hai biến `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
- [ ] Đã test SPA fallback, PWA manifest và service worker.
- [ ] Đã thử nghiệm trên Chrome Android, Safari iPhone và Windows.
