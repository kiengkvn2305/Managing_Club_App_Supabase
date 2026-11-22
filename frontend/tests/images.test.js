import test from 'node:test';
import assert from 'node:assert/strict';
import { avatar, imageUrl } from '../src/images.js';

test('image URLs require a signed Supabase Storage cache and never use legacy paths', () => {
  assert.equal(imageUrl('club', 3, 'abc', 3), '');
  assert.equal(imageUrl('background', 3, 'abc', 3), '');
  assert.equal(imageUrl('player', 4, 'abc', 3), '');
  assert.equal(imageUrl('account', 1, 'abc'), '');
  assert.equal(imageUrl('player', '../4', 'abc', 3), '');
  assert.equal(imageUrl('background', 3, null, 3), '');
  assert.equal(imageUrl('club', 3, 'data:image/png;base64,123', 3), 'data:image/png;base64,123');
  assert.equal(imageUrl('background', 3, 'https://example.com/bg.jpg', 3), 'https://example.com/bg.jpg');
  assert.match(avatar('An', '/image'), /<img src="\/image"/);
  assert.doesNotMatch(avatar('<img src=x>', ''), /<img src=x>/);
});
