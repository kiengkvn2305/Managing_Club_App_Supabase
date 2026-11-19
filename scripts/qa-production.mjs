import { writeFileSync, mkdirSync } from 'node:fs';
const root = 'https://managing-club-app-supabase.pages.dev';
const evidence = [];
async function probe(path) {
  const r = await fetch(new URL(path, root), { cache: 'no-store' });
  const text = await r.text();
  evidence.push({ path, status:r.status, mime:r.headers.get('content-type'), cache:r.headers.get('cache-control'), html:/^\s*<!doctype html/i.test(text), bytes:text.length });
  return text;
}
const index = await probe('/');
const entry = index.match(/src="(\/assets\/index-[^"]+\.js)"/)?.[1];
if (!entry) throw Error('Production entry not found');
const bundle = await probe(entry);
const assets = new Set([...bundle.matchAll(/["'`]([^"'`]*?(?:exceljs|web-)[^"'`]*?\.js)["'`]/g)].map(m=>'/assets/'+m[1].split('/').pop()));
for (const asset of assets) await probe(asset);
for (const path of ['/assets/exceljs.min-Cw5QacKC.js','/assets/qa-missing-never-exists.js','/sw.js','/manifest.webmanifest','/icons/icon-192.png','/icons/icon-512.png','/icons/maskable-512.png']) await probe(path);
mkdirSync('qa-reports/evidence',{recursive:true});
writeFileSync('qa-reports/evidence/production-http.json', JSON.stringify({at:new Date().toISOString(),entry,safeProfile:bundle.includes('id,name,email,avatar_path,created_at,updated_at'),evidence},null,2));
console.log(JSON.stringify(evidence,null,2));
