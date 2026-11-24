# Công việc tiếp theo

1. [x] Đã đồng bộ toàn bộ 35 migrations (`20261119000000`–`20261125000003`) lên Supabase Production (`dandxiwdedbwxtvokeag`) và kiểm tra `npx supabase db lint --linked` đạt 0 lỗi schema.
2. [x] Đã chuẩn hóa phân vùng quyền cho từng vai trò BCN (Thành viên chỉ xem, Thủ quỹ, Truyền thông, Đối ngoại, Phó chủ nhiệm ngang Chủ nhiệm), tách riêng mục Điểm danh (`#attendance`) với phân quyền độc lập (`can_manage_attendance`).
3. [x] Đã khắc phục triệt để nghiệp vụ thu chi (`record_finance_transaction`), đóng quỹ (`record_player_dues`), kiểm tra trùng số áo kèm tên người trùng, sửa lịch tập, và chuẩn hóa toàn bộ ngày/tháng sang `dd/mm/yyyy` & `mm/yyyy`.
4. [x] Đã nâng cấp giao diện thể thao sáng/tối, đảm bảo ảnh nền CLB, hộp thoại chọn đội trưởng trực quan, biểu đồ thu chi cột đôi và nút ẩn/hiện thanh công cụ.
5. [x] Đã chạy toàn bộ 84 frontend unit tests, 8 Supabase structural tests và Vite production build thành công (127 modules, 0 secret leaks).
6. [x] Đã kiểm thử tự động Excel import/export lớn (500 dòng, chặn >500 dòng & >5 MB), PWA (`sw.js`, `manifest.webmanifest`, `offline.html`, Cloudflare `_headers`/`_redirects`) và responsive `.bottom-nav`.
   - [ ] Smoke test thủ công trên thiết bị di động thật (Chrome Android / Safari iPhone) và Chrome remote debugging.
7. [ ] Nghiệm thu cuối cùng trong [docs/MIGRATION_CHECKLIST.md](docs/MIGRATION_CHECKLIST.md) (chạy `npx supabase test db` khi bật Docker Desktop và smoke test trên thiết bị di động thật).

*Lưu ý: Không triển khai phân hệ mùa giải và bỏ mục tài liệu CLB theo chỉ đạo của người dùng.*
