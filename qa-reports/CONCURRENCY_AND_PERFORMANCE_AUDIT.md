# Rà soát đồng thời và hiệu năng — 2026-11-21

Phạm vi: toàn bộ services frontend, migrations/RPC, RLS/grants, danh sách giao dịch và các thao tác ghi có nguy cơ bị bấm đồng thời.

## Đã sửa và kiểm chứng local

| Nghiệp vụ | Rủi ro cũ | Biện pháp hiện tại | Kiểm chứng |
| --- | --- | --- | --- |
| Chủ nhiệm rời CLB | RPC cũ tự chuyển chủ nhiệm hoặc archive CLB | `leave_club` khóa membership rồi từ chối role `owner`; giao diện ẩn nút và hướng dẫn chuyển quyền | pgTAP `concurrency_guards.sql` |
| Thu/chi | Retry cùng request có thể chạm unique constraint, frontend không bắt buộc gửi replay key | `record_finance_transaction` khóa CLB, kiểm tra idempotency sau khóa; frontend gửi UUID theo vòng đời form | pgTAP replay ledger |
| Thu quỹ | Hai người thu cùng tháng cần trả kết quả ổn định | khóa CLB + unique dues + bảng riêng `dues_collection_requests` không cấp quyền trực tiếp | schema/RLS + RPC contract |
| Thanh toán công nợ | `idempotency_key` có thể rỗng, retry sinh phiếu mới | `post_finance_payment` bắt buộc idempotency key và kiểm tra sau khóa CLB | migration/RPC contract |
| Điểm danh trận | ghi trực tiếp Data API, thao tác đồng thời có thể last-write-wins không audit | RPC `save_match_attendance` khóa trận, upsert theo unique `(match_id, player_id)`, cấm DML trực tiếp | pgTAP attendance RPC |
| Điểm danh tập | JSON trực tiếp có thể ghi đè danh sách vừa cập nhật | RPC `save_training_attendance`, revision `updated_at`, trigger chặn sửa cột trực tiếp | pgTAP stale revision |
| Số dư/báo cáo | giao dịch `reversed` bị cộng thêm lần nữa | chỉ `posted` được hạch toán; vẫn hiển thị lịch sử đảo | JS + pgTAP |

## Khả năng chịu tải

- Mỗi thao tác tài chính/thu quỹ dùng khóa hàng CLB để ưu tiên nhất quán hơn throughput; các CLB khác nhau không chặn lẫn nhau.
- Điểm danh dùng khóa theo trận/buổi tập, tránh khóa toàn hệ thống.
- Đã thêm index cho feed lịch tập, hoạt động, điểm danh trận, thống kê trận, mức quỹ và lịch sử kho.
- Sổ thu chi sử dụng `finance_ledger_page` để PostgreSQL trả đúng trang, tổng hợp và dữ liệu biểu đồ; không còn tải toàn bộ ledger vào browser.
- Assets có hash được cache immutable tại Cloudflare Pages; HTML và service worker vẫn `no-cache` để nhận phiên bản mới.

## Kết quả lệnh đã chạy

- `npx supabase db lint --schema public`: PASS, không có schema error.
- `npx supabase test db`: PASS, 91 assertions trong 7 file pgTAP.
- `npm test` trong `frontend`: PASS, 64 tests.
- `npm run build` trong `frontend`: PASS.

## Giới hạn xác minh

- Các migration `20261120000005`–`20261120000010` đã chạy thành công lên Supabase production `dandxiwdedbwxtvokeag`. Frontend cần được deploy cùng commit này để bắt đầu dùng RPC mới.
- Chưa có load test phân tán/đo quota Supabase Cloud; cần chạy trên môi trường staging với volume dự kiến trước khi công bố khả năng chịu tải định lượng.
