#!/usr/bin/env tsx

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import logger from "../../src/utils/logger";

async function main(): Promise<void> {
  const { getSupabaseAdminClient } = await import("../../src/utils/common");
  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    logger.error("Admin supabase client not configured");
    process.exit(1);
  }
  const jobId = process.argv[2];
  if (!jobId) {
    logger.error("Usage: npx tsx scripts/tasks/tail-job-admin.ts <taskId>");
    process.exit(2);
  }
  logger.log("Fetching job via admin client:", jobId);
  const { data, error } = await supabase
    .from("tasks")
    .select("id, status, logs, started_at, finished_at")
    .eq("id", jobId)
    .maybeSingle();
  if (error) {
    logger.error("Supabase error:", error);
    process.exit(1);
  }
  if (!data) {
    logger.log("No job found with id=", jobId);
    return;
  }
  logger.log(JSON.stringify(data, null, 2));
}

main().catch((e) => {
  logger.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
