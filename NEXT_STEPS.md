# Công việc tiếp theo

1. [x] Đã áp dụng toàn bộ 12 migrations (từ `20261119000000` đến `20261119000011`) lên Supabase local và remote (`dandxiwdedbwxtvokeag`).
2. [x] Đã khắc phục triệt để lỗi phân quyền và nghiệp vụ thu chi (`record_finance_transaction`), thu quỹ / đóng quỹ (`record_player_dues`), nhận diện toàn bộ chức danh BCN (`club_board_members`), không phân biệt hoa thường và hỗ trợ nhập tiền tệ linh hoạt.
3. [x] Tái cấu trúc toàn diện mã nguồn frontend theo mô hình MVC (Services / Controllers / Views / Pages / Router), loại bỏ hoàn toàn các "God files", đảm bảo Single Responsibility và format chuẩn mực (không nén dòng).
4. [x] Đã chạy toàn bộ 81 frontend unit tests, 8 Supabase structural tests và quét AST toàn bộ `frontend/src/` (0 biến chưa khai báo).
5. [x] Vite production build thành công (126 modules transformed, 0 secret leaks trong bundle).
6. [x] Đã kiểm thử tự động Excel import/export lớn (500 dòng, chặn >500 dòng & >5 MB), PWA (`sw.js`, `manifest.webmanifest`, `offline.html`, Cloudflare `_headers`/`_redirects` trên cả preview & `managing-club-app-supabase.pages.dev`) và tối ưu responsive `.bottom-nav` cho di động.
   - [ ] Smoke test thủ công trên thiết bị di động thật (Chrome Android / Safari iPhone) và Chrome remote debugging.
7. [ ] Nghiệm thu toàn bộ tiêu chí trong [docs/MIGRATION_CHECKLIST.md](docs/MIGRATION_CHECKLIST.md) (còn lại bước `npx supabase db lint`/`test db` khi bật Docker Desktop và smoke test trên thiết bị di động thật).

*Lưu ý: Không triển khai phân hệ mùa giải theo chỉ đạo của người dùng; tập trung tối đa vào tính chính xác của các nghiệp vụ hiện có.*
