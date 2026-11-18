import { escapeHtml as e, initials } from './utils.js';
import { createClient } from '@supabase/supabase-js';

const signed = new Map();
const viteEnv = import.meta.env || {};
const storage = viteEnv.VITE_SUPABASE_URL && viteEnv.VITE_SUPABASE_ANON_KEY
  ? createClient(viteEnv.VITE_SUPABASE_URL, viteEnv.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: true } })
  : null;

const cacheKey = (kind, id, version, clubId) => `${kind}:${id || ''}:${clubId || ''}:${version || ''}`;
export async function primeImageUrls(items = []) {
  if (!storage) return;
  const unique = [...new Map(items.filter((item) => item?.version).map((item) => [cacheKey(item.kind, item.id, item.version, item.clubId), item])).values()];
  await Promise.all(unique.map(async (item) => {
    const key = cacheKey(item.kind, item.id, item.version, item.clubId);
    if (signed.has(key)) return;
    const result = await storage.storage.from('fcms-private').createSignedUrl(item.version, 3600);
    if (!result.error && result.data?.signedUrl) signed.set(key, result.data.signedUrl);
  }));
}

export function imageUrl(kind, id, version, clubId) {
  if (!version) return '';
  return signed.get(cacheKey(kind, id, version, clubId)) || '';
}

export function avatar(name, url = '', extraClass = '') {
  return `<span class="avatar ${e(extraClass)}"><span>${e(initials(name || ''))}</span>${url ? `<img src="${e(url)}" alt="" loading="lazy">` : ''}</span>`;
}
