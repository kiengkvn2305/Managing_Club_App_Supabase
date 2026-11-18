# Deploy Cloudflare Pages Free

## Cấu hình project

- Framework preset: Vite
- Root directory: `frontend`
- Build command: `npm run build`
- Output directory: `dist`
- Node version: 22.12+ (khuyến nghị Node 24 LTS)

## Environment variables

Đặt trong Settings → Environment variables cho Preview và Production:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
```

Chỉ sử dụng publishable/anon key. Không thêm service-role key.

## GitHub deployment

1. Push Project 2 lên GitHub repository riêng.
2. Cloudflare Dashboard → Workers & Pages → Create application → Pages → Connect to Git.
3. Chọn repository và branch `main`.
4. Đặt cấu hình ở trên, lưu variables.
5. Chạy Deploy và kiểm tra Preview URL.
6. Trong Supabase Auth URL Configuration, thêm Preview/Production URL tương ứng.

Không tự động mua plan hoặc bật tài nguyên trả phí. Kiểm tra quota Free trước khi thêm dịch vụ ngoài Supabase/Pages.

`frontend/public/_redirects` cung cấp SPA fallback; `frontend/public/_headers` thêm security headers. HTTPS do Cloudflare cung cấp.
