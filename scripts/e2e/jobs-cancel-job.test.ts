#!/usr/bin/env node

/**
 * Test script to call the `cancel-job` MCP tool on the local server.
 * Usage: npx tsx src/e2e/jobs-cancel-job.test.ts <jobId>
 */

import { config as dotenvConfig } from "dotenv";
import logger from "../../src/utils/logger";
dotenvConfig({ path: ".env.local" });

const jobId = process.argv[2];

async function runCancel(): Promise<void> {
  const cfg = await import("@/utils/config");

  if (!cfg.config.env.zeroheightMcpAccessToken) {
    logger.error(
      "❌ Error: ZEROHEIGHT_MCP_ACCESS_TOKEN environment variable not set",
    );
    process.exit(1);
  }

  if (!jobId) {
    logger.error("Usage: npx tsx src/e2e/jobs-cancel-job.test.ts <jobId>");
    process.exit(2);
  }

  logger.log(`Calling cancel-job for id=${jobId}...`);

  const body = JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: {
      name: "cancel-job",
      arguments: { jobId },
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

runCancel();
