// Reserved for server-only workflows that cannot be safely exposed through the
// browser client. Do not put the service-role key in the frontend bundle.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

Deno.serve((_request) => new Response(JSON.stringify({ error: "not_implemented" }), {
  status: 501,
  headers: { "content-type": "application/json" },
}));
