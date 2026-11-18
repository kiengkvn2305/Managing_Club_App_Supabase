# Backup và khôi phục Supabase

## Trước khi thay đổi schema

```powershell
npx supabase db dump --linked --file backup-schema.sql
```

Với dữ liệu production, dùng cơ chế backup của Supabase project và lưu bản sao ngoài workspace. Không commit database password, access token hoặc file dump chứa dữ liệu cá nhân.

## Khôi phục local

Chỉ khôi phục vào database local/disposable sau khi kiểm tra đường dẫn và nội dung file:

```powershell
npx supabase start
Get-Content .\backup-schema.sql | docker exec -i supabase_db_fcms-pro psql -U postgres -d postgres
```

## Khôi phục production

Thực hiện trong maintenance window, xác nhận backup gần nhất, kiểm tra migration version và chạy smoke test Auth/RLS/tài chính sau khôi phục. Không dùng reset database production.
