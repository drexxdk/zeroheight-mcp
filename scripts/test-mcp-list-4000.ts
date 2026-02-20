#!/usr/bin/env tsx
// This script uses dynamic imports and expects to be run with `tsx` (npx tsx)
import { config as dotenvConfig } from "dotenv";
dotenvConfig({ path: ".env.local" });

async function main(): Promise<void> {
  // dynamically import config to ensure environment is loaded and aliases work
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
  console.log("STATUS", res.status);
  try {
    const parsed = JSON.parse(text);
    console.log(JSON.stringify(parsed, null, 2));
  } catch {
    console.log(text);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
