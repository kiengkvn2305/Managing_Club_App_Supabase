# Kiến trúc Supabase hiện tại

## Thành phần

- `supabase/migrations/`: schema PostgreSQL, constraints, indexes, RLS và RPC.
- `frontend/src/supabase-api.js`: adapter nghiệp vụ dùng Supabase client.
- `frontend/src/api-supabase.js`: API entrypoint cho ứng dụng.
- `supabase/tests/`: pgTAP kiểm tra schema, RLS và business functions.
- `supabase/functions/`: nơi đặt server-side function khi cần secret hoặc webhook.

## Nguyên tắc dữ liệu

Mọi bảng thuộc CLB có `club_id`, foreign key và RLS. Quyền được quyết định từ `club_members`, không từ dữ liệu gửi lên frontend. Tài chính và tồn kho dùng RPC để khóa dòng, kiểm tra tenant, kiểm tra quyền và ghi audit trong một transaction.

## Triển khai

1. Tạo project Supabase staging hoặc production trống.
2. Chạy `npx supabase link --project-ref <ref>`.
3. Chạy `npx supabase db push`.
4. Cấu hình Auth Site URL và redirect URL.
5. Đặt `VITE_SUPABASE_URL` và `VITE_SUPABASE_ANON_KEY` cho Cloudflare Pages.
6. Chạy test local/staging trước khi publish.

Migration không tự xóa dữ liệu hiện hữu. Import dữ liệu là một quy trình riêng cần backup, mapping UUID, checksum và rollback plan.
