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
