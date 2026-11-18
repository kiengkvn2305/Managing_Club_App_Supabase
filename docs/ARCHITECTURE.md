# Kiến trúc FCMS PRO Supabase

```text
Browser / PWA
  └─ Vite + HTML/CSS/Vanilla JavaScript
       ├─ Supabase Auth JWT
       ├─ PostgREST + RLS
       ├─ PostgreSQL RPC / transactions
       └─ Supabase Storage private bucket + signed URLs
Cloudflare Pages chỉ serve static frontend.
```

[supabase/](../supabase/) là boundary backend duy nhất. [architecture_index.md](../.github/modernize/rearchitecture/artifacts/architecture_index.md) giữ mapping chi tiết của kiến trúc hiện tại.
