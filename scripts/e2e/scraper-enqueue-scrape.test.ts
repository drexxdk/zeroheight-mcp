#!/usr/bin/env node

/**
 * Test script to enqueue a scrape via the MCP `scrape` tool.
 * Usage: npx tsx src/e2e/scraper-enqueue-scrape.test.ts [pageUrl1 pageUrl2 ...]
 */

import { config as dotenvConfig } from "dotenv";
import logger from "../../src/utils/logger";
dotenvConfig({ path: ".env.local" });

const args = process.argv.slice(2);
const pageUrls = args.length > 0 ? args : undefined;

async function runEnqueue(): Promise<void> {
  const cfg = await import("@/utils/config");
  if (!cfg.config.env.zeroheightMcpAccessToken) {
    logger.error(
      "❌ Error: ZEROHEIGHT_MCP_ACCESS_TOKEN environment variable not set",
    );
    process.exit(1);
  }

  logger.log(`Enqueueing scrape (pageUrls=${pageUrls ? pageUrls.length : 0})`);

  const body = JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: {
      name: "scrape",
      arguments: { pageUrls },
    },
  });

  try {
    const res = await fetch(cfg.config.server.mcpUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": cfg.config.env.zeroheightMcpAccessToken,
        Accept: "application/json, text/event-stream",
      },
      body,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    const text = await res.text();
    logger.log("Response:\n", text);
  } catch (e) {
    logger.error("Request failed:", e instanceof Error ? e.message : String(e));
    process.exit(1);
  }
}

runEnqueue();
