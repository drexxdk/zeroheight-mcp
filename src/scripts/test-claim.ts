#!/usr/bin/env node
import { config as dotenvConfig } from "dotenv";
dotenvConfig({ path: ".env.local" });

import { claimNextJob } from "@/tools/scraper/jobStore";

async function run() {
  try {
    const job = await claimNextJob();
    if (!job) {
      console.log("No queued job to claim");
      return;
    }
    console.log("Claimed job:", JSON.stringify(job, null, 2));
  } catch (e) {
    console.error("claim failed", e instanceof Error ? e.message : e);
  }
}

run();
