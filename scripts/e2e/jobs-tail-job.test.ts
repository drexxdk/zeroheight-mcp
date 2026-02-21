#!/usr/bin/env tsx
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";
// Supabase config will be imported dynamically below so env is loaded first
import logger from "../../src/utils/logger";

const jobId = process.argv[2];
const intervalArgIndex = process.argv.findIndex((s) => s === "--interval");
const interval =
  intervalArgIndex >= 0 ? Number(process.argv[intervalArgIndex + 1]) : 5;

if (!jobId) {
  logger.error(
    "Usage: npx tsx src/e2e/jobs-tail-job.test.ts <jobId> [--interval N]",
  );
  process.exit(2);
}

const cfg = await import("@/utils/config");
if (
  !cfg.config.env.nextPublicSupabaseUrl ||
  !cfg.config.env.supabaseServiceRoleKey
) {
  logger.error("Missing Supabase config in .env.local");
  process.exit(2);
}

const supabase = createClient(
  cfg.config.env.nextPublicSupabaseUrl,
  cfg.config.env.supabaseServiceRoleKey,
);

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

let lastLogs = "";

async function fetchOnce(): Promise<{ finished: boolean }> {
  const { data, error } = await supabase
    .from("tasks")
    .select("id, status, logs, started_at, finished_at, error")
    .eq("id", jobId)
    .limit(1)
    .maybeSingle();

  if (error) {
    logger.error("Supabase error:", error.message || error);
    return { finished: false };
  }

  if (!data) {
    logger.log(`No job found with id=${jobId}`);
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

  logger.log(
    `\n[status=${status} started=${started_at} finished=${finished_at} error=${err}]\n`,
  );

  return {
    finished:
      status === "completed" || status === "failed" || status === "cancelled",
  };
}

async function runTail(): Promise<void> {
  logger.log(`Tailing job ${jobId} every ${interval}s...`);
  while (true) {
    try {
      const { finished } = await fetchOnce();
      if (finished) {
        logger.log("Job finished; stopping tail.");
        process.exit(0);
      }
    } catch (e) {
      logger.error("Tail error:", e instanceof Error ? e.message : String(e));
    }
    await sleep(interval * 1000);
  }
}

runTail();
