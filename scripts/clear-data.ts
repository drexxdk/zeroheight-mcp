#!/usr/bin/env node

/**
 * Test script to call the `clear-database` MCP tool on the local server.
 * Usage: npx tsx src/e2e/maintenance-clear-data.test.ts
 */
import { config } from "dotenv";

// Load environment variables before importing app code that reads them
config({ path: ".env.local" });

// Import config after dotenv has been loaded so `src/lib/config.ts`
// reads the environment correctly at module initialization.
const { ZEROHEIGHT_MCP_ACCESS_TOKEN, MCP_URL } =
  await import("../src/utils/config");

async function main(): Promise<void> {
  if (!ZEROHEIGHT_MCP_ACCESS_TOKEN) {
    console.error(
      "❌ Error: ZEROHEIGHT_MCP_ACCESS_TOKEN environment variable not set",
    );
    process.exit(1);
  }

  console.log(`Calling clear-database (destructive) ...`);

  const body = JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: {
      name: "clear-database",
      arguments: { apiKey: ZEROHEIGHT_MCP_ACCESS_TOKEN },
    },
  });

  try {
    const res = await fetch(MCP_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": ZEROHEIGHT_MCP_ACCESS_TOKEN,
        Accept: "application/json, text/event-stream",
      },
      body,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    const text = await res.text();
    try {
      const parsed = JSON.parse(text);
      console.log(JSON.stringify(parsed, null, 2));
    } catch {
      console.log("Response:\n", text);
    }
  } catch (e) {
    console.error(
      "Request failed:",
      e instanceof Error ? e.message : String(e),
    );
    process.exit(1);
  }
}

main();
