# Phạm vi FCMS PRO

## Nền tảng

- HTML5, CSS3, Vanilla JavaScript và Vite.
- Supabase Auth, PostgreSQL, RLS, RPC và Storage.
- Cloudflare Pages Free cho frontend.
- PWA responsive cho desktop và thiết bị di động.

## Phân hệ

1. Tài khoản và hồ sơ.
2. Nhiều CLB, thành viên và phân quyền theo CLB.
3. Đội bóng, cầu thủ và đội hình.
4. Import/export Excel có preview và validation.
5. Quỹ, thu chi, công nợ, thanh toán và báo cáo.
6. Kho, tài sản, cấp phát, thu hồi và kiểm kê.
7. Trận đấu, tập luyện, điểm danh và thống kê.
8. Sinh nhật, sự kiện, thông báo và kỷ luật.
9. Tuyển quân, tài trợ và biểu quyết.
10. Website CLB công khai và cài đặt CLB.
11. Audit log, backup, khôi phục và kiểm thử release.

## Nguyên tắc bảo mật

- Dữ liệu CLB phải được cô lập bằng RLS.
- Một tài khoản có thể thuộc nhiều CLB.
- Một CLB có thể có nhiều người quản lý.
- Không đặt secret key, database password hoặc service key trong bundle frontend.
- Số tiền dùng PostgreSQL `numeric`; frontend không được sửa trực tiếp số dư.
- Nghiệp vụ tài chính phải gọi RPC transaction có kiểm tra quyền và audit.

## Tiêu chí release

Chỉ phát hành khi build, unit test, database test, RLS tenant isolation, finance transaction test, import/export test, authentication test và PWA smoke test đều có bằng chứng PASS.
