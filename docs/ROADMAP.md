# Lộ trình FCMS PRO

| Giai đoạn | Phạm vi | Trạng thái |
| --- | --- | --- |
| 1 | Auth, CLB, membership, RLS, đội bóng, hồ sơ cầu thủ | **Đã hoàn thiện** — Đa CLB, RLS 100%, chuyển quyền Chủ nhiệm, mã mời phân quyền sẵn và Admin Portal |
| 2 | Thành viên, Excel, phân quyền quản lý, dashboard | **Đã hoàn thiện** — Phân vùng quyền BCN chuẩn hóa, chọn đội trưởng trực quan, kiểm tra trùng số áo, Excel 500 dòng |
| 3 | Quỹ, thu chi, công nợ, thanh toán, phê duyệt, báo cáo | **Đã hoàn thiện** — RPC giao dịch có idempotency, biểu đồ cột đôi dòng tiền ròng, đảo bút toán, khóa kỳ kế toán, phí duy trì |
| 4 | Kho, trận đấu, tập luyện, điểm danh, thống kê, sự kiện | **Đã hoàn thiện** — Điểm danh tách riêng tự ghi vắng sau 10 phút, kho trang bị có cấp phát/thu hồi và báo cáo hỏng/mất thiết bị |
| 5 | Tuyển quân, tài trợ, biểu quyết, website công khai & thông báo | **Đã hoàn thiện** — Cổng thông tin công khai CLB nâng cao, nộp đơn ứng tuyển trực tuyến, kết nạp ứng viên và trung tâm thông báo tự động |
| 6 | Cloudflare Pages, PWA, thiết bị thật | **Đã triển khai** — PWA (`sw.js`, `manifest.webmanifest`, `offline.html`), Cloudflare `_headers`/`_redirects` & responsive mobile |
| 7 | Release security, backup, performance, staging | **Đã đồng bộ Production** — 36 migrations trên Supabase (`dandxiwdedbwxtvokeag`), `db lint` sạch, bundle 0 secret leaks |

Mỗi giai đoạn được kiểm chứng bằng schema migrations, RLS/RPC authorization, giao diện người dùng và bộ kiểm thử tự động (`npm test` & `npm run build`).
