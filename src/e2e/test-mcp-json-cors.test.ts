#!/usr/bin/env node

import { config } from "dotenv";
config({ path: ".env.local" });

// Load runtime config inside main to ensure dotenv has been applied first

async function main() {
  const { MCP_API_KEY, MCP_URL, MCP_CORS_ORIGIN } =
    await import("@/utils/config");
  if (!MCP_URL) {
    console.error("MCP_URL not set (from src/utils/config)");
    process.exit(1);
  }

  const expectedOrigin = MCP_CORS_ORIGIN;
  if (!expectedOrigin) {
    console.error(
      "MCP_CORS_ORIGIN is not set — test requires explicit MCP_CORS_ORIGIN in .env.local",
    );
    process.exit(1);
  }

  // Compute JSON wrapper URL (ensure no duplicate slashes)
  const base = MCP_URL.replace(/\/api\/mcp\/?$/, "");
  const jsonUrl = base + "/api/mcp/json";

  console.log("Testing CORS on:", jsonUrl);

  // 1) OPTIONS preflight
  const opts = await fetch(jsonUrl, {
    method: "OPTIONS",
    headers: {
      Origin: "http://example.com",
    },
  });

  if (opts.status !== 204) {
    console.error("Expected 204 from OPTIONS preflight, got", opts.status);
    process.exit(1);
  }

  const acao = opts.headers.get("access-control-allow-origin");
  if (!acao) {
    console.error("Missing Access-Control-Allow-Origin on OPTIONS response");
    process.exit(1);
  }

  if (acao !== expectedOrigin) {
    console.error(
      `Access-Control-Allow-Origin mismatch: expected ${expectedOrigin}, got ${acao}`,
    );
    process.exit(1);
  }

  console.log("OPTIONS CORS header OK ->", acao);

  // 2) POST call should also include CORS headers
  if (!MCP_API_KEY) {
    console.error(
      "MCP_API_KEY not set; cannot perform authenticated POST test",
    );
    process.exit(1);
  }

  const postRes = await fetch(jsonUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${MCP_API_KEY}`,
      Origin: "http://example.com",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/list",
      params: {},
    }),
  });

  const postAca = postRes.headers.get("access-control-allow-origin");
  if (!postAca) {
    console.error("Missing Access-Control-Allow-Origin on POST response");
    console.error("Status:", postRes.status);
    const txt = await postRes.text().catch(() => "");
    console.error("Body:", txt.slice(0, 1000));
    process.exit(1);
  }

  if (postAca !== expectedOrigin) {
    console.error(
      `Access-Control-Allow-Origin mismatch on POST: expected ${expectedOrigin}, got ${postAca}`,
    );
    process.exit(1);
  }

  console.log("POST CORS header OK ->", postAca);

  console.log("✅ /api/mcp/json CORS integration test passed");
}

main().catch((e) => {
  console.error("Test failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});
