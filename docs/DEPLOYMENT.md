# Triển khai Cloudflare Pages

Project chỉ có runtime Vite/Vanilla JS + Supabase và có thể triển khai trên Cloudflare Pages Free.

- Root directory: `frontend`
- Build command: `npm run build`
- Output directory: `dist`
- Variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
- SPA fallback: `frontend/public/_redirects`
- Security headers: `frontend/public/_headers`

Xem [CLOUDFLARE_DEPLOY.md](CLOUDFLARE_DEPLOY.md).
