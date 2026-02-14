#!/usr/bin/env node

/**
 * Test script to call the `clear-zeroheight-data` MCP tool on the local server.
 * Usage: npx tsx src/scripts/test-clear-data.ts
 */

import { config as dotenvConfig } from "dotenv";
dotenvConfig({ path: ".env.local" });

async function runClear() {
  const API_URL = "http://localhost:3000/api/mcp";
  const API_KEY = process.env.MCP_API_KEY;

  if (!API_KEY) {
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
      arguments: { apiKey: API_KEY },
    },
  });

  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": API_KEY,
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

runClear();
