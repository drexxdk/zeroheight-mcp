#!/usr/bin/env node

/**
 * Test script to call the `cancel-job` MCP tool on the local server.
 * Usage: npx tsx src/e2e/jobs-cancel-job.test.ts <jobId>
 */

import { config as dotenvConfig } from "dotenv";
dotenvConfig({ path: ".env.local" });
import { MCP_API_KEY } from "@/utils/config";

const jobId = process.argv[2];

async function runCancel() {
  const API_URL = "http://localhost:3000/api/mcp";
  if (!MCP_API_KEY) {
    console.error("❌ Error: MCP_API_KEY environment variable not set");
    process.exit(1);
  }

  if (!jobId) {
    console.error("Usage: npx tsx src/e2e/jobs-cancel-job.test.ts <jobId>");
    process.exit(2);
  }

  console.log(`Calling cancel-job for id=${jobId}...`);

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

runCancel();
