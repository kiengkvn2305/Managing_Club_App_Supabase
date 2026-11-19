# Công việc tiếp theo

1. [x] Đã áp dụng toàn bộ 8 migrations lên Supabase project và kiểm chứng schema sạch (`npx supabase db lint`).
2. [x] Đã chạy toàn bộ 53 pgTAP tests và 49 integration tests kiểm tra RLS, tenant isolation, Storage, concurrency, replay protection và khóa kỳ tài chính.
3. [x] Đã hoàn thiện adapter đồng bộ đóng quỹ tự động cho thành viên chưa nộp tiền (`/dues`).
4. [ ] Deploy Cloudflare Pages preview; kiểm tra biến môi trường, cache, SPA fallback và service worker.
5. [ ] Hoàn thiện các UI nghiệp vụ còn lại: mùa giải, sự kiện nâng cao, website CLB công khai.
6. [ ] Chạy Excel import/export lớn, PWA và responsive smoke trên thiết bị di động thật (Android / iOS).
7. [ ] Nghiệm thu toàn bộ tiêu chí trong [docs/MIGRATION_CHECKLIST.md](docs/MIGRATION_CHECKLIST.md) trước khi phát hành production.

Không dùng dữ liệu giả để đánh dấu hoàn thành. Mọi giới hạn phải được ghi lại trong [PROGRESS.md](PROGRESS.md).
