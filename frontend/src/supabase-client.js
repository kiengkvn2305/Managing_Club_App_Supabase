import { createClient } from '@supabase/supabase-js';

// One Auth client shared by data and private images, including Vite hot reload.
export function getSupabaseClient(env = import.meta.env || {}) {
  const url = env.VITE_SUPABASE_URL;
  const key = env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  const cache = globalThis.__fcms_client_cache__;
  if (cache?.url === url && cache.key === key) return cache.client;
  const client = createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
  globalThis.__fcms_client_cache__ = { url, key, client };
  return client;
}
