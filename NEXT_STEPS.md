# Công việc tiếp theo

1. [x] Đã áp dụng toàn bộ 11 migrations (từ `20261119000000` đến `20261119000010`) lên Supabase local và remote (`dandxiwdedbwxtvokeag`).
2. [x] Đã khắc phục triệt để lỗi phân quyền và nghiệp vụ thu quỹ / đóng quỹ (`record_player_dues`, `can_manage_finance`, `can_view_finance`, hiển thị và lọc `unpaid`, quyền xem/đặt/xóa mức quỹ chung ưu đãi BCN).
3. [x] Tái cấu trúc toàn diện mã nguồn frontend theo mô hình MVC (Services / Controllers / Views / Pages / Router), loại bỏ hoàn toàn các "God files", đảm bảo Single Responsibility và format chuẩn mực.
4. [x] Đã chạy toàn bộ 72 pgTAP tests (6 file test), 43 static/unit tests và 57 integration tests: 100% PASS trên môi trường local và remote.
5. [x] Vite production build thành công (125 modules transformed sạch sẽ).
6. [ ] Chạy Excel import/export lớn, PWA và responsive smoke trên thiết bị di động thật (Android / iOS).
7. [ ] Nghiệm thu toàn bộ tiêu chí trong [docs/MIGRATION_CHECKLIST.md](docs/MIGRATION_CHECKLIST.md) trước khi phát hành production.

*Lưu ý: Không triển khai phân hệ mùa giải theo chỉ đạo của người dùng; tập trung tối đa vào tính chính xác của các nghiệp vụ hiện có.*
