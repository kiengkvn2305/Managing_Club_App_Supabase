# Công việc tiếp theo

1. [x] Đã đồng bộ toàn bộ 36 migrations (`20261119000000`–`20261125000004`) lên Supabase Production (`dandxiwdedbwxtvokeag`) và kiểm tra `npx supabase db lint --linked` đạt 0 lỗi, 0 cảnh báo.
2. [x] Đã chuẩn hóa phân vùng quyền cho từng vai trò BCN (Thành viên chỉ xem, Thủ quỹ, Truyền thông, Đối ngoại, Phó chủ nhiệm ngang Chủ nhiệm), tách riêng mục Điểm danh (`#attendance`) với phân quyền độc lập (`can_manage_attendance`).
3. [x] Đã hoàn thiện nghiệp vụ thu chi (`record_finance_transaction`), đảo bút toán (`reverse_finance_transaction`), khóa sổ kỳ kế toán (`financial_periods`), đóng quỹ (`record_player_dues`), kiểm tra trùng số áo, sửa lịch tập, và chuẩn hóa toàn bộ ngày/tháng sang `dd/mm/yyyy` & `mm/yyyy`.
4. [x] Đã hoàn thiện Kho trang bị (báo cáo & xử lý hỏng/mất thiết bị tại kho và khi cấp phát thành viên) và Trung tâm thông báo tự động thông minh theo vai trò.
5. [x] Đã nâng cấp giao diện thể thao sáng/tối, đảm bảo ảnh nền CLB, hộp thoại chọn đội trưởng trực quan, biểu đồ thu chi cột đôi và nút ẩn/hiện thanh công cụ.
6. [x] Đã chạy toàn bộ 91 frontend unit tests, 9 Supabase structural tests và Vite production build thành công (0 secret leaks).
7. [x] Đã kiểm thử tự động Excel import/export lớn (500 dòng, chặn >500 dòng & >5 MB), PWA (`sw.js`, `manifest.webmanifest`, `offline.html`, Cloudflare `_headers`/`_redirects`) và responsive `.bottom-nav`.
   - [ ] Smoke test thủ công trên thiết bị di động thật (Chrome Android / Safari iPhone) và chạy `npx supabase test db` khi bật Docker Desktop local.

*Lưu ý: Không triển khai phân hệ mùa giải, bỏ mục tài liệu CLB và bỏ phần trang công khai CLB theo chỉ đạo của người dùng.*
