import test from "node:test";
import assert from "node:assert/strict";
import { createApiClient, ApiError } from "../src/api-supabase.js";

test("Supabase client refuses requests when public configuration is missing", async () => {
  const api = createApiClient();
  await assert.rejects(api.get("/auth/user"), (error) => {
    assert.ok(error instanceof ApiError);
    assert.equal(error.status, 500);
    return true;
  });
});

test("Supabase client exposes the standard request methods", () => {
  const api = createApiClient();
  for (const method of ["request", "get", "post", "patch", "delete"]) {
    assert.equal(typeof api[method], "function");
  }
});
