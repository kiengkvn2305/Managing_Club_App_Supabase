# FCMS PRO – Tiến độ hiện tại

Ngày cập nhật: 2026-11-22

## Điểm danh tự động UTC+7 — đã triển khai Supabase production

- Migration `20261122000000_auto_absent_training_attendance.sql` tạo lịch `pg_cron` chạy mỗi phút tại database.
- Với mỗi buổi tập đang theo kế hoạch, sau đúng 10 phút kể từ `training_date + training_time` theo `Asia/Ho_Chi_Minh` (UTC+7), tất cả thành viên active chưa có trạng thái được ghi `absent`.
- Các trạng thái `present`, `excused` và `absent` hiện có được giữ nguyên; việc tự động ghi vắng có optimistic locking, row lock và audit log có actor.
- Đồng hồ UTC+7 xuất hiện ở góc trên trái của giao diện đã đăng nhập, đăng nhập và đặt lại mật khẩu; hiển thị cập nhật mỗi giây, hỗ trợ light/dark và mobile.
- Đã kiểm chứng local: scheduler `fcms-auto-mark-training-absences` active với lịch `* * * * *`; pgTAP kiểm tra deadline trước/sau 10 phút và bảo toàn trạng thái có mặt. Migrations `20261122000000` và `20261122000001` đã áp dụng thành công lên Supabase production `dandxiwdedbwxtvokeag`.

## Rà soát bổ sung 2026-11-21 (đã triển khai Supabase production)

- Không cho Chủ nhiệm tự rời CLB ở cả giao diện lẫn PostgreSQL RPC; cần chuyển quyền Chủ nhiệm trước.
- Sửa tính tổng sổ thu chi: giao dịch gốc đã đảo vẫn hiển thị lịch sử nhưng không bị cộng lần hai vào số dư/biểu đồ.
- Thêm idempotency bắt buộc cho ghi thu/chi, thu quỹ và thanh toán; replay cùng mã trả về kết quả ban đầu, không tạo giao dịch mới.
- Chuyển điểm danh trận sang RPC khóa bản ghi trận; cấm INSERT/UPDATE/DELETE trực tiếp ở `match_attendances` cho role `authenticated`.
- Chuyển điểm danh tập sang RPC có optimistic locking bằng `updated_at`; cập nhật cũ bị từ chối thay vì ghi đè dữ liệu người khác.
- Thêm index cho lịch tập, hoạt động, thống kê trận, quỹ, kho; sổ thu chi dùng RPC phân trang/tổng hợp tại PostgreSQL thay vì tải toàn bộ ledger về trình duyệt.
- Sửa RPC quản trị đổi trạng thái CLB để ép kiểu `club_status` enum đúng cách.
- Cập nhật token màu semantic cho light/dark, cải thiện thông báo quyền Chủ nhiệm và cache immutable cho assets hash của Cloudflare Pages.
- Đã kiểm chứng local: `npx supabase db lint` sạch; `npx supabase test db` 91/91 PASS; `npm test` 64/64 PASS; `npm run build` PASS. Các migration `20261120000005` đến `20261120000010` đã áp dụng thành công cho Supabase production `dandxiwdedbwxtvokeag`.

## Đã triển khai

- Frontend HTML/CSS/Vanilla JavaScript + Vite tái cấu trúc hoàn chỉnh theo chuẩn kiến trúc MVC (Model - View - Controller / Services):
  - Phân tách triệt để "God files" (`app.js`, `supabase-api.js`, `pages.js`), mỗi tệp chỉ đảm nhận một trách nhiệm duy nhất (Single Responsibility Principle):
    - `frontend/src/services/`: 14 services chuyên biệt tương tác dữ liệu Supabase (auth, club, roster, dues, finance, board, match, inventory, activity, recruitment, sponsorship, poll, discipline, service-helpers).
    - `frontend/src/views/`: 7 view modules hiển thị độc lập (dashboard, board, activities, club, profile, auth, dues-page).
    - `frontend/src/controllers/`: 11 controllers tiếp nhận và xử lý hành vi người dùng (club, roster, dues, finance, board, match, inventory, activity, recruitment, poll, discovery).
    - `app.js` và `supabase-api.js`: Đóng vai trò Router & Facade tinh gọn, định dạng chuẩn (thụt lề 2 spaces, không nén hàng).
- Sửa triệt để lỗi nhập thu chi bị forbid, đồng bộ quyền hạn giữa Ban chủ nhiệm (`club_board_members`) và thành viên (`club_members`):
  - Migration `20261119000011_fix_finance_permissions_and_board_sync.sql` áp dụng thành công trên local và remote (`dandxiwdedbwxtvokeag`).
  - Hàm `is_finance_title(text)` nhận diện linh hoạt mọi chức danh liên quan tài chính/quản lý (không phân biệt hoa thường, hỗ trợ "Thủ quỹ", "Chủ nhiệm", "Phó chủ nhiệm", "Kế toán", "Quản lý tài chính", "Cán sự", "Uỷ viên BCN",...).
  - Mở rộng hàm `can_manage_finance` và `can_view_finance` để tự động kiểm tra cả bảng `club_board_members` thông qua hồ sơ cầu thủ liên kết (`player_profiles`), loại bỏ lỗi phân quyền khi cán sự BCN ghi thu chi.
  - Cập nhật `record_finance_transaction` tách bạch các lỗi cụ thể (`forbidden`, `invalid_amount`, `invalid_description`) và cơ chế fallback actor an toàn.
  - Frontend: `club-service.js` đồng bộ kiểm tra `club_board_members` và chuẩn hóa tiền tệ (loại bỏ dấu phân tách hàng nghìn) tại `finance-controller.js`. Định dạng chuẩn layout `finance-page.js`.
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
- Remote project `dandxiwdedbwxtvokeag` đã nhận đầy đủ 12 migrations (từ `20261119000000` đến `20261119000011`).
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
