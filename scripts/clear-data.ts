#!/usr/bin/env node

/**
 * Test script to call the `clear-zeroheight-data` MCP tool on the local server.
 * Usage: npx tsx src/e2e/maintenance-clear-data.test.ts
 */
import { config } from "dotenv";

// Load environment variables before importing app code that reads them
config({ path: ".env.local" });

// Import config after dotenv has been loaded so `src/lib/config.ts`
// reads the environment correctly at module initialization.
const { MCP_API_KEY } = await import("../src/utils/config");

async function main() {
  const API_URL = "http://localhost:3000/api/mcp";
  if (!MCP_API_KEY) {
    console.error("❌ Error: MCP_API_KEY environment variable not set");
    process.exit(1);
  }

  console.log(`Calling clear-zeroheight-data (destructive) ...`);

  const body = JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: {
      name: "clear-zeroheight-data",
      arguments: { apiKey: MCP_API_KEY },
    },
  });

  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": MCP_API_KEY,
        Accept: "application/json, text/event-stream",
      },
      body,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    const text = await res.text();
    console.log("Response:\n", text);
  } catch (e) {
    console.error(
      "Request failed:",
      e instanceof Error ? e.message : String(e),
    );
    process.exit(1);
  }
}

main();
