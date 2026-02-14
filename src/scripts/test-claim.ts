#!/usr/bin/env node
import { config as dotenvConfig } from "dotenv";
dotenvConfig({ path: ".env.local" });

async function run() {
  const url = "http://localhost:3000/api/jobs/claim";
  const key = process.env.SERVER_API_KEY || process.env.MCP_API_KEY || "";
  console.log("POST", url, "with key?", !!key);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-server-api-key": key },
    });
    const text = await res.text();
    console.log("status", res.status);
    console.log(text);
  } catch (e) {
    console.error("fetch failed", e);
  }
}

run();
