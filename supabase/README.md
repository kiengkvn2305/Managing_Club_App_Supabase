# FCMS PRO Supabase

This directory contains the Supabase backend for FCMS PRO: PostgreSQL schema, RLS policies, RPC functions, Storage policies and local database tests.

## Apply

1. Create a Supabase project.
2. Run the SQL migration in `migrations/20261119000000_fcms_supabase.sql` with the Supabase CLI or SQL editor.
3. In Supabase Auth, configure the site URL and redirect URLs to the Cloudflare Pages URL.
4. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in the frontend environment.

The SQL is safe for a new Supabase project. It does not import or delete existing data. Data import is a separate, explicit operation.
