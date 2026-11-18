# FCMS PRO – Tiến độ hiện tại

Ngày cập nhật: 2026-11-19

## Đã triển khai

- Frontend HTML/CSS/Vanilla JavaScript + Vite.
- Supabase Auth, PostgreSQL, RLS, RPC và private Storage.
- Một tài khoản có thể thuộc nhiều CLB; dữ liệu được giới hạn theo membership của CLB.
- Dashboard, CLB, đội bóng, hồ sơ cầu thủ, thành viên ban chủ nhiệm và lời mời.
- Thu chi, đóng quỹ, khoản chi dự kiến, kho, cấp phát/thu hồi, lịch trận, đội hình, điểm danh và thống kê cơ bản.
- Financial workflow RPC đã bổ sung kỳ mở/khóa, approval, reversal, partial payment allocation và summary server-side.
- Biểu quyết, tuyển dụng nội bộ, hoạt động CLB, ảnh riêng tư và Excel import/export nền tảng.
- Cấu hình Cloudflare Pages, SPA fallback, service worker và manifest PWA.
- Backend legacy đã được loại khỏi Project 2; runtime chỉ còn frontend và Supabase.

## Đã kiểm chứng local

- Docker daemon đang chạy.
- Supabase local stack đã khởi động và áp dụng migrations.
- Database lint: không có schema errors.
- Database tests: 33/33 PASS trên 2 file pgTAP.
- Frontend tests: 30 PASS.
- Supabase static tests: 4 PASS.
- Vite production build: PASS.
- Browser smoke: đăng ký/đăng nhập, tạo CLB, tạo đội bóng và đọc lại dữ liệu thật từ PostgreSQL.

## Chưa đủ điều kiện tuyên bố release hoàn chỉnh

- Chưa chạy staging integration trên Supabase Cloud.
- Chưa kiểm thử đầy đủ concurrency/RLS bằng nhiều tài khoản thật.
- Approval, khóa kỳ, reversal, payment allocation và summary đã có RPC/test local; cần kiểm thử staging concurrency và hoàn thiện UI quản trị.
- Một số nghiệp vụ kho nâng cao, mùa giải, thông báo, sự kiện, tuyển dụng công khai, tài trợ và website CLB công khai còn thiếu parity UI.
- Chưa kiểm thử cài PWA trực tiếp trên Android, iPhone và Windows.
- Chưa deploy Cloudflare Pages production.
- Edge Function hiện là điểm mở rộng tùy chọn và chưa có nghiệp vụ cụ thể.

## Lệnh kiểm chứng

```powershell
npm run setup
npm test
npx supabase db lint
npx supabase test db
npm run build
```

Xem thêm [docs/ROADMAP.md](docs/ROADMAP.md), [docs/TESTING.md](docs/TESTING.md) và [NEXT_STEPS.md](NEXT_STEPS.md).
