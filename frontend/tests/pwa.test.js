import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
const source = readFileSync(
  new URL("../public/sw.js", import.meta.url),
  "utf8",
);
test("service worker never intercepts private API, auth, writes or cross-origin resources", () => {
  const events = {};
  vm.runInNewContext(source, {
    self: {
      location: { origin: "https://fcms.test" },
      addEventListener: (name, handler) => (events[name] = handler),
    },
    URL,
  });
  for (const [path, method] of [
    ["/rest/v1/clubs", "GET"],
    ["/auth/recovery", "GET"],
    ["/icons/crest.svg", "POST"],
    ["https://other.test/assets/x.js", "GET"],
    ["/private/photo.jpg", "GET"],
  ]) {
    let intercepted = false;
    events.fetch({
      request: {
        url: new URL(path, "https://fcms.test").href,
        method,
        mode: "cors",
      },
      respondWith: () => {
        intercepted = true;
      },
    });
    assert.equal(intercepted, false, `${method} ${path}`);
  }
});

test("PWA manifest, offline page, Cloudflare headers/redirects and mobile responsive CSS are complete", () => {
  const manifest = JSON.parse(readFileSync(new URL("../public/manifest.webmanifest", import.meta.url), "utf8"));
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.start_url, "/");
  assert.ok(manifest.icons.some((i) => i.sizes === "192x192"));
  assert.ok(manifest.icons.some((i) => i.sizes === "512x512"));
  assert.ok(manifest.icons.some((i) => i.purpose === "maskable"));

  const offlineHtml = readFileSync(new URL("../public/offline.html", import.meta.url), "utf8");
  assert.match(offlineHtml, /viewport/);
  assert.match(offlineHtml, /Kết nối lại/);

  const headers = readFileSync(new URL("../public/_headers", import.meta.url), "utf8");
  assert.match(headers, /\/sw\.js[\s\S]*Cache-Control:\s*no-cache/);
  assert.match(headers, /\/manifest\.webmanifest[\s\S]*application\/manifest\+json/);
  assert.match(headers, /X-Content-Type-Options:\s*nosniff/);

  const indexHtml = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  assert.match(indexHtml, /manifest\.webmanifest/);
  assert.match(indexHtml, /viewport-fit=cover/);
  assert.match(indexHtml, /apple-mobile-web-app-capable/);
  assert.match(indexHtml, /apple-touch-icon/);

  const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
  assert.match(css, /@media\s*\(max-width:\s*760px\)/);
  assert.match(css, /@media\s*\(max-width:\s*390px\)/);
  assert.match(css, /safe-area-inset-bottom/);
  assert.match(css, /\.shell\.mobile-menu-open\s+\.sidebar/);
  assert.match(css, /font-size:\s*16px\s*!important/);
  assert.doesNotMatch(css, /\.page-actions\s+\.button\.secondary\s*\{\s*display:\s*none/);
  assert.doesNotMatch(css, /\.page-actions\s+\.button\s*>\s*span\s*\{\s*display:\s*none/);

  const appJs = readFileSync(new URL("../src/app.js", import.meta.url), "utf8");
  assert.match(appJs, /toggle-mobile-menu/);
  assert.match(appJs, /close-mobile-menu/);

  const lineupsJs = readFileSync(new URL("../src/lineups.js", import.meta.url), "utf8");
  assert.match(lineupsJs, /pointerdown/);
  assert.match(lineupsJs, /pointermove/);
});
