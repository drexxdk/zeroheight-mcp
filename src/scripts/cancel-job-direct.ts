#!/usr/bin/env node

/**
 * Direct cancel script: updates the `scrape_jobs` row to `cancelled`
 * Usage: npx tsx src/scripts/cancel-job-direct.ts <jobId>
 */
import { config as dotenvConfig } from "dotenv";
dotenvConfig({ path: ".env.local" });

import { getSupabaseAdminClient } from "@/lib/common";

const jobId = process.argv[2];

async function main() {
  if (!jobId) {
    console.error("Usage: npx tsx src/scripts/cancel-job-direct.ts <jobId>");
    process.exit(2);
  }

  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    console.error("Supabase admin client not configured (check env vars)");
    process.exit(1);
  }

  try {
    // Check current status
    const { data, error } = await supabase
      .from("scrape_jobs")
      .select("status")
      .eq("id", jobId)
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    if (!data) {
      console.error(`No job found with id=${jobId}`);
      process.exit(1);
    }

    const status = (data as { status?: string }).status || "";

    if (status === "cancelled") {
      console.log(`Job ${jobId} is already cancelled`);
      process.exit(0);
    }

    const { error: updErr } = await supabase
      .from("scrape_jobs")
      .update({ status: "cancelled", finished_at: new Date().toISOString() })
      .eq("id", jobId);

    if (updErr) throw updErr;

    console.log(`Job ${jobId} marked cancelled (previousStatus=${status})`);
    process.exit(0);
  } catch (e) {
    console.error(
      "Error cancelling job:",
      e instanceof Error ? e.message : String(e),
    );
    process.exit(1);
  }
}

void main();
