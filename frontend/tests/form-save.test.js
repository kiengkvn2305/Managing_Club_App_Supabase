import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ui = readFileSync(new URL('../src/components/ui.js', import.meta.url), 'utf8');
const app = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const api = readFileSync(new URL('../src/supabase-api.js', import.meta.url), 'utf8');

test('dialog and form saves expose loading state and keep errors in the form', () => {
  assert.match(ui, /dataset\.submitting/);
  assert.match(ui, /Đang lưu…/);
  assert.match(ui, /showErrors\(form, error\.errors/);
  assert.match(app, /setAttribute\("aria-busy", "true"\)/);
  assert.match(app, /originalButtonHtml/);
});

test('profile reads only non-sensitive columns required by the frontend', () => {
  assert.match(api, /from\("profiles"\)\.select\("id,name,email,avatar_path,created_at,updated_at"\)/);
  assert.doesNotMatch(api, /from\("profiles"\)\.select\("\*"\)/);
});
