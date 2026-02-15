#!/usr/bin/env tsx
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";
import {
  NEXT_PUBLIC_SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  SUPABASE_ACCESS_TOKEN,
} from "@/lib/config";

const jobId = process.argv[2];
const intervalArgIndex = process.argv.findIndex((s) => s === "--interval");
const interval =
  intervalArgIndex >= 0 ? Number(process.argv[intervalArgIndex + 1]) : 5;

if (!jobId) {
  console.error(
    "Usage: npx tsx src/e2e/jobs-tail-job.test.ts <jobId> [--interval N]",
  );
  process.exit(2);
}

const SUPABASE_URL = NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ACCESS_TOKEN;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Missing Supabase config in .env.local");
  process.exit(2);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

let lastLogs = "";

async function fetchOnce() {
  const { data, error } = await supabase
    .from("scrape_jobs")
    .select("id, status, logs, started_at, finished_at, error")
    .eq("id", jobId)
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("Supabase error:", error.message || error);
    return { finished: false };
  }

  if (!data) {
    console.log(`No job found with id=${jobId}`);
    return { finished: true };
  }

  type JobRow = {
    id: string;
    status: string;
    logs: string | null;
    started_at: string | null;
    finished_at: string | null;
    error: string | null;
  };

  const {
    status,
    logs = "",
    started_at,
    finished_at,
    error: err,
  } = data as JobRow;

  const safeLogs = logs ?? "";

  if (safeLogs !== lastLogs) {
    const newPart = safeLogs.startsWith(lastLogs)
      ? safeLogs.slice(lastLogs.length)
      : safeLogs;
    process.stdout.write(newPart);
    lastLogs = safeLogs;
  }

  console.log(
    `\n[status=${status} started=${started_at} finished=${finished_at} error=${err}]\n`,
  );

  return { finished: status === "finished" || status === "failed" };
}

async function runTail() {
  console.log(`Tailing job ${jobId} every ${interval}s...`);
  while (true) {
    try {
      const { finished } = await fetchOnce();
      if (finished) {
        console.log("Job finished; stopping tail.");
        process.exit(0);
      }
    } catch (e) {
      console.error("Tail error:", e instanceof Error ? e.message : String(e));
    }
    await sleep(interval * 1000);
  }
}

runTail();
