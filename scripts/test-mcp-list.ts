#!/usr/bin/env tsx
// This script uses dynamic imports and expects to be run with `tsx` (npx tsx)
import { config as dotenvConfig } from "dotenv";
dotenvConfig({ path: ".env.local" });
import logger from "../src/utils/logger";

async function main(): Promise<void> {
  // dynamically import config so env is loaded and TS path aliases resolve
  const cfg = await import("@/utils/config");

  const res = await fetch(cfg.config.server.mcpUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${cfg.config.env.zeroheightMcpAccessToken}`,
      "X-API-Key": cfg.config.env.zeroheightMcpAccessToken,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "tools/list",
      params: {},
      id: 1,
    }),
  });

  const text = await res.text();
  logger.log("STATUS", res.status);
  logger.log("HEADERS", Object.fromEntries(res.headers.entries()));
  try {
    const parsed = JSON.parse(text);
    logger.log(JSON.stringify(parsed, null, 2));
  } catch {
    logger.log(text);
  }
}

main().catch((err) => {
  logger.error(err);
  process.exit(1);
});
