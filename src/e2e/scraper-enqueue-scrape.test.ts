#!/usr/bin/env node

/**
 * Test script to enqueue a scrape via the MCP `scrape-zeroheight-project` tool.
 * Usage: npx tsx src/e2e/scraper-enqueue-scrape.test.ts [pageUrl1 pageUrl2 ...]
 */

import { config as dotenvConfig } from "dotenv";
dotenvConfig({ path: ".env.local" });

const args = process.argv.slice(2);
const pageUrls = args.length > 0 ? args : undefined;

async function runEnqueue() {
  const API_URL = "http://localhost:3000/api/mcp";
  const API_KEY = process.env.MCP_API_KEY;

  if (!API_KEY) {
    console.error("❌ Error: MCP_API_KEY environment variable not set");
    process.exit(1);
  }

  console.log(`Enqueueing scrape (pageUrls=${pageUrls ? pageUrls.length : 0})`);

  const body = JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: {
      name: "scrape-zeroheight-project",
      arguments: { pageUrls },
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

runEnqueue();
