# Existing technology stack

- Backend: PHP 8.2+ target, Laravel 12, Sanctum/session-cookie authentication, Eloquent, Laravel migrations, PHPUnit, MySQL 8.4 production path and SQLite local test path.
- Frontend: JavaScript modules only (no TypeScript), HTML, CSS, Vite 8, Node.js >=22.12, ExcelJS, Capacitor 8 packages, browser Service Worker and Web App Manifest.
- Build/package: Composer in `backend/composer.json`; npm workspace scripts at root and `frontend/package.json`; Docker/Compose files for the original Laravel/MySQL path.
- Existing auth/runtime config: Laravel `.env` uses `DB_*`, session and mail settings; Vite previously proxied `/api` and `/sanctum` to Laravel.
- Target additions in this repository: `@supabase/supabase-js`, public Vite `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`, Supabase SQL migrations/RLS/RPCs. No service-role key is part of the browser runtime.

## Migration blockers recorded from source

- Laravel controllers return Laravel resource/pagination shapes, while Supabase PostgREST returns rows; the adapter must preserve the UI's existing response shapes.
- Laravel transactions and `lockForUpdate()` protect finance, dues and inventory; equivalent target writes must be RPCs, not client-side balance updates.
- Laravel policies use both role and title, so RLS helpers must check the database membership row rather than any frontend role value.
- Some existing modules are larger than the initial Supabase adapter. Unsupported routes must remain explicit errors until implemented; they must not silently fabricate data.
