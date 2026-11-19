import { escapeHtml as e, initials } from './utils.js';
import { getSupabaseClient } from './supabase-client.js';

const signed = new Map();
const storage = getSupabaseClient();
storage?.auth.onAuthStateChange((event) => { if (event === 'SIGNED_OUT') signed.clear(); });

const cacheKey = (kind, id, version, clubId) => `${kind}:${id || ''}:${clubId || ''}:${version || ''}`;
export async function primeImageUrls(items = []) {
  if (!storage) return;
  const unique = [...new Map(items.filter((item) => item?.version).map((item) => [cacheKey(item.kind, item.id, item.version, item.clubId), item])).values()];
  await Promise.all(unique.map(async (item) => {
    const key = cacheKey(item.kind, item.id, item.version, item.clubId);
    if (signed.get(key)?.expiresAt > Date.now()) return;
    const result = await storage.storage.from('fcms-private').createSignedUrl(item.version, 3600);
    if (!result.error && result.data?.signedUrl) signed.set(key, { url: result.data.signedUrl, expiresAt: Date.now() + 3500 * 1000 });
  }));
}

export function imageUrl(kind, id, version, clubId) {
  if (!version) return '';
  const entry = signed.get(cacheKey(kind, id, version, clubId));
  return entry?.expiresAt > Date.now() ? entry.url : '';
}

export function avatar(name, url = '', extraClass = '') {
  return `<span class="avatar ${e(extraClass)}"><span>${e(initials(name || ''))}</span>${url ? `<img src="${e(url)}" alt="" loading="lazy">` : ''}</span>`;
}
