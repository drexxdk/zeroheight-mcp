#!/usr/bin/env tsx

import { config as dotenvConfig } from "dotenv";
dotenvConfig({ path: ".env.local" });

async function main(): Promise<void> {
  // dynamically import config to ensure environment is loaded and paths resolve
  const cfg = await import("@/utils/config");
  const url: string = cfg.MCP_URL;
  const key: string = cfg.ZEROHEIGHT_MCP_ACCESS_TOKEN;

  if (!url) throw new Error("MCP_URL is not configured");
  if (!key) throw new Error("ZEROHEIGHT_MCP_ACCESS_TOKEN is not configured");

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${key}`,
      "X-API-Key": key,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "tools/list",
      params: {},
      id: 1,
    }),
  });

  console.log("STATUS", res.status);
  const text = await res.text();
  try {
    console.log(JSON.stringify(JSON.parse(text), null, 2));
  } catch {
    console.log(text);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
