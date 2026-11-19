# FCMS PRO – Tiến độ hiện tại

Ngày cập nhật: 2026-11-19

## Đã triển khai

- Frontend HTML/CSS/Vanilla JavaScript + Vite tái cấu trúc hoàn chỉnh theo chuẩn kiến trúc MVC (Model - View - Controller / Services):
  - Phân tách triệt để "God files" (`app.js`, `supabase-api.js`, `pages.js`), mỗi tệp chỉ đảm nhận một trách nhiệm duy nhất (Single Responsibility Principle):
    - `frontend/src/services/`: 14 services chuyên biệt tương tác dữ liệu Supabase (auth, club, roster, dues, finance, board, match, inventory, activity, recruitment, sponsorship, poll, discipline, service-helpers).
    - `frontend/src/views/`: 7 view modules hiển thị độc lập (dashboard, board, activities, club, profile, auth, dues-page).
    - `frontend/src/controllers/`: 11 controllers tiếp nhận và xử lý hành vi người dùng (club, roster, dues, finance, board, match, inventory, activity, recruitment, poll, discovery).
    - `app.js` và `supabase-api.js`: Đóng vai trò Router & Facade tinh gọn, định dạng chuẩn (thụt lề 2 spaces, không nén hàng).
- Sửa triệt để lỗi thu quỹ và đóng quỹ, phân quyền đồng bộ:
  - Migration `20261119000010_fix_dues_permissions_and_recording.sql` sửa hàm RPC `record_player_dues`, căn chỉnh tham số ghi nhận thanh toán quỹ và nhật ký tài chính.
  - Mở rộng quyền quản lý thu chi (`can_manage_finance`) và xem thu chi (`can_view_finance`) cho các vai trò và chức danh Ban chủ nhiệm (Thủ quỹ, Chủ nhiệm CLB, Phó chủ nhiệm CLB, Quản lý tài chính, HLV).
  - Cho phép người quản lý tài chính xem, thiết lập và xóa nhật ký mức đóng quỹ ưu đãi của BCN.
  - Sửa lỗi nhãn và lọc trạng thái `unpaid` ("Chưa đóng") trên giao diện quản lý thu quỹ (`dues-page.js`).
- Supabase Auth, PostgreSQL, RLS, RPC và private Storage.
- Một tài khoản có thể thuộc nhiều CLB; dữ liệu được giới hạn theo membership của CLB.
- Dashboard, CLB, đội bóng, hồ sơ cầu thủ, thành viên ban chủ nhiệm và lời mời.
- Thu chi, đóng quỹ, khoản chi dự kiến, kho, cấp phát/thu hồi, lịch trận, đội hình, điểm danh và thống kê cơ bản.
- Financial workflow RPC đã bổ sung kỳ mở/khóa, approval, reversal, partial payment allocation và summary server-side.
- Đã audit và sửa remote project `dandxiwdedbwxtvokeag`: 54/54 bảng public có RLS; table grants/RPC privileges đã được harden bằng migrations `20261119000003`, `20261119000004` và `20261119000010`.
- Đã tạo ma trận quyền 54 bảng tại [docs/DATABASE_PERMISSIONS.md](docs/DATABASE_PERMISSIONS.md), gồm table grants, column grants, RPC allow-list, anon và sequence policy.
- Biểu quyết, tuyển dụng nội bộ, hoạt động CLB, ảnh riêng tư và Excel import/export nền tảng.
- Cấu hình Cloudflare Pages, SPA fallback, service worker và manifest PWA.
- Backend legacy đã được loại khỏi Project 2; runtime chỉ còn frontend và Supabase.

## Đã kiểm chứng local & remote

- Docker daemon và Supabase local stack đang chạy ổn định.
- Remote project `dandxiwdedbwxtvokeag` đã nhận đầy đủ 11 migrations (từ `20261119000000` đến `20261119000010`).
- Database lint (`npx supabase db lint`): sạch, 0 lỗi schema.
- Database tests (`npx supabase test db`): 72/72 PASS trên 6 file pgTAP (`board_dues_precedence`, `finance_workflows`, `operational_deletes`, `permissions_catalog`, `schema_rls_finance`, `team_manager_workflow`).
- Integration tests (`scripts/qa-integration.mjs`): 57/57 PASS với 5 tài khoản và 2 CLB thực tế, bao gồm:
  - Auth, profile, multi-club isolation, team & manager assignment, roster.
  - Concurrency 6 requests ghi trùng lặp (replay protection), idempotency check, reversal.
  - Ưu tiên mức quỹ BCN, xóa lịch sử mức ưu đãi BCN và bỏ thành viên khỏi BCN (`BOARD-01` đến `BOARD-04`).
  - Xóa đội an toàn (`delete_team`), xóa cầu thủ khỏi đội (`remove_team_player`), xóa hoạt động, nhà tài trợ, công việc BCN (`OP-TEAM`, `OP-ACT`, `OP-SPON`, `OP-TASK`).
  - Cài đặt và đọc trang web công khai của CLB (`OP-PUB`).
  - Kỳ kế toán đóng/mở và khóa sổ ledger (`FIN-LOCK`).
  - Storage bucket `fcms-private` và signed URLs.
  - Các quyền bảo mật chống leo quyền (`SEC-ADMIN`, `SEC-OWNER`, `SEC-FIN`, `SEC-LINK`, `SEC-ANON`).
- Frontend unit tests: 36 PASS.
- Supabase static tests: 7 PASS.
- Vite production build: PASS (125 modules transformed cleanly).
- Cloudflare Pages (`https://managing-club-app-supabase.pages.dev`): Deploy thành công; HTTP probing xác nhận headers chuẩn (`no-cache` cho HTML và Service Worker, asset 404 không bị fallback HTML gây hỏng cache Service Worker, MIME type chính xác).

## Chưa đủ điều kiện tuyên bố release hoàn chỉnh

- Chưa kiểm thử cài đặt PWA trực tiếp trên thiết bị di động thật (Android / iPhone).
- Không làm mùa giải theo yêu cầu của người dùng.

## Lệnh kiểm chứng

```powershell
npm run setup
npm test
npx supabase db lint
npx supabase test db
npm run build
```

Xem thêm [docs/ROADMAP.md](docs/ROADMAP.md), [docs/TESTING.md](docs/TESTING.md) và [NEXT_STEPS.md](NEXT_STEPS.md).
