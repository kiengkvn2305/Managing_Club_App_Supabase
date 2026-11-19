# FCMS PRO – Tiến độ hiện tại

Ngày cập nhật: 2026-11-19

## Đã triển khai

- Frontend HTML/CSS/Vanilla JavaScript + Vite.
- Supabase Auth, PostgreSQL, RLS, RPC và private Storage.
- Một tài khoản có thể thuộc nhiều CLB; dữ liệu được giới hạn theo membership của CLB.
- Dashboard, CLB, đội bóng, hồ sơ cầu thủ, thành viên ban chủ nhiệm và lời mời.
- Thu chi, đóng quỹ, khoản chi dự kiến, kho, cấp phát/thu hồi, lịch trận, đội hình, điểm danh và thống kê cơ bản.
- Financial workflow RPC đã bổ sung kỳ mở/khóa, approval, reversal, partial payment allocation và summary server-side.
- Đã audit và sửa remote project `dandxiwdedbwxtvokeag`: 54/54 bảng public có RLS; table grants/RPC privileges đã được harden bằng migrations `20261119000003` và `20261119000004`.
- Đã tạo ma trận quyền 54 bảng tại [docs/DATABASE_PERMISSIONS.md](docs/DATABASE_PERMISSIONS.md), gồm table grants, column grants, RPC allow-list, anon và sequence policy.
- Biểu quyết, tuyển dụng nội bộ, hoạt động CLB, ảnh riêng tư và Excel import/export nền tảng.
- Cấu hình Cloudflare Pages, SPA fallback, service worker và manifest PWA.
- Backend legacy đã được loại khỏi Project 2; runtime chỉ còn frontend và Supabase.

## Đã kiểm chứng local & remote

- Docker daemon và Supabase local stack đang chạy ổn định.
- Remote project `dandxiwdedbwxtvokeag` đã nhận đầy đủ 8 migrations (từ `20261119000000` đến `20261119000007`).
- Database lint (`npx supabase db lint`): sạch, 0 lỗi schema.
- Database tests (`npx supabase test db`): 53/53 PASS trên 4 file pgTAP (`finance_workflows`, `permissions_catalog`, `schema_rls_finance`, `team_manager_workflow`).
- Integration tests (`scripts/qa-integration.mjs`): 49/49 PASS với 5 tài khoản và 2 CLB thực tế, bao gồm:
  - Auth, profile, multi-club isolation, team & manager assignment, roster.
  - Concurrency 6 requests ghi trùng lặp (replay protection), idempotency check, reversal.
  - Kỳ kế toán đóng/mở và khóa sổ ledger (`FIN-LOCK`).
  - Storage bucket `fcms-private` và signed URLs.
  - Các quyền bảo mật chống leo quyền (`SEC-ADMIN`, `SEC-OWNER`, `SEC-FIN`, `SEC-LINK`, `SEC-ANON`).
- Frontend unit tests: 34 PASS.
- Supabase static tests: 7 PASS.
- Vite production build: PASS.
- Cloudflare Pages (`https://managing-club-app-supabase.pages.dev`): Deploy thành công commit `cc85bb8` (entry `index-CXt-9o6N.js`). HTTP probing xác nhận headers chuẩn (`no-cache` cho HTML và Service Worker, asset 404 không bị fallback HTML gây hỏng cache Service Worker, MIME type chính xác).

## Chưa đủ điều kiện tuyên bố release hoàn chỉnh

- Một số nghiệp vụ nâng cao (mùa giải, website CLB công khai) còn tiếp tục hoàn thiện parity UI.
- Chưa kiểm thử cài đặt PWA trực tiếp trên thiết bị di động thật (Android / iPhone).

## Lệnh kiểm chứng

```powershell
npm run setup
npm test
npx supabase db lint
npx supabase test db
npm run build
```

Xem thêm [docs/ROADMAP.md](docs/ROADMAP.md), [docs/TESTING.md](docs/TESTING.md) và [NEXT_STEPS.md](NEXT_STEPS.md).
