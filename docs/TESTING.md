# Kiểm thử FCMS PRO

## Local commands

```powershell
npm run setup
npm test
npm run test:frontend
npm run test:supabase
npx supabase db lint
npx supabase test db
npm run build
```

## Kết quả gần nhất

- Frontend unit tests: 30 PASS.
- Supabase static tests: 4 PASS.
- PostgreSQL pgTAP tests: 33/33 PASS trên 2 file, gồm tenant/schema và financial workflow runtime.
- PostgreSQL lint: không có schema errors.
- Vite production build: PASS.
- Browser smoke local: Auth, tạo CLB, tạo đội và đọc dữ liệu thật: PASS.

## Cần kiểm thử trước production

- Hai tài khoản truy cập hai CLB để xác nhận tenant isolation.
- Hai quản lý ghi cùng giao dịch để xác nhận locking/idempotency.
- Partial payment, reversal, approval và period locking.
- Excel file lớn, dòng trùng, lỗi validation và formula injection.
- Upload private Storage và signed URL hết hạn.
- PWA install/update/offline trên Android, iPhone và Windows.
- Cloudflare Pages preview với Auth redirect thực tế.

Không đánh dấu PASS cho các mục chưa chạy trên môi trường tương ứng.
