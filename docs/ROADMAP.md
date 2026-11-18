# Lộ trình FCMS PRO

| Giai đoạn | Phạm vi | Trạng thái |
| --- | --- | --- |
| 1 | Auth, CLB, membership, RLS, đội bóng, hồ sơ cầu thủ | Core local đã chạy; staging và account lifecycle nâng cao còn mở |
| 2 | Thành viên, Excel, phân quyền quản lý, dashboard | Nền tảng đã có; cần nghiệm thu từng workflow và import lớn |
| 3 | Quỹ, thu chi, công nợ, thanh toán, phê duyệt, báo cáo | RPC transaction, period, approval, reversal, partial payment và summary đã có; UI/staging concurrency còn mở |
| 4 | Kho, trận đấu, tập luyện, điểm danh, thống kê, sự kiện | Core đã có; các workflow nâng cao và concurrency còn mở |
| 5 | Tuyển quân, tài trợ, biểu quyết, website công khai | Một phần đã có; public flow và website còn mở |
| 6 | Cloudflare Pages, PWA, thiết bị thật | Cấu hình đã có; chưa nghiệm thu trên thiết bị thật |
| 7 | Release security, backup, performance, staging | Chưa đóng |

Mỗi giai đoạn chỉ được đánh dấu hoàn thành khi có schema, authorization, UI, test và bằng chứng runtime tương ứng.
