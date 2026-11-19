# Công việc tiếp theo

1. [x] Đã áp dụng toàn bộ 10 migrations (từ `20261119000000` đến `20261119000009`) lên Supabase local và remote (`dandxiwdedbwxtvokeag`).
2. [x] Đã chạy toàn bộ 72 pgTAP tests (6 file test) và 57 integration tests: kiểm tra RLS, tenant isolation, Storage, concurrency, replay protection, ưu tiên ưu đãi quỹ BCN, xóa lịch sử mức quỹ BCN, xóa đội an toàn (`delete_team`), xóa cầu thủ khỏi đội (`remove_team_player`), xóa hoạt động, nhà tài trợ, công việc BCN và cài đặt website công khai.
3. [x] Đã hoàn thiện adapter đồng bộ đóng quỹ tự động cho thành viên chưa nộp tiền (`/dues`) và tính toán quỹ ưu đãi BCN chuẩn xác.
4. [x] Đã bổ sung quản lý và cài đặt trang web công khai CLB (`club_public_settings`) trên giao diện `#club`.
5. [x] Deploy Cloudflare Pages (`https://managing-club-app-supabase.pages.dev`); kiểm tra headers, cache control, 404 handling và Service Worker MIME validation.
6. [ ] Chạy Excel import/export lớn, PWA và responsive smoke trên thiết bị di động thật (Android / iOS).
7. [ ] Nghiệm thu toàn bộ tiêu chí trong [docs/MIGRATION_CHECKLIST.md](docs/MIGRATION_CHECKLIST.md) trước khi phát hành production.

*Lưu ý: Không triển khai phân hệ mùa giải theo chỉ đạo của người dùng; tập trung tối đa vào tính chính xác của các nghiệp vụ hiện có.*
