#!/usr/bin/env tsx
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";
// Supabase config will be loaded dynamically after dotenv
import logger from "../../src/utils/logger";

const jobId = process.argv[2];
if (!jobId) {
  logger.error("Usage: npx tsx src/e2e/jobs-inspect-job.test.ts <jobId>");
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

async function inspect(): Promise<void> {
  const { data, error } = await supabase
    .from("tasks")
    .select("*")
    .eq("id", jobId)
    .limit(1);

  if (error) {
    logger.error("Supabase error:", error.message || error);
    process.exit(2);
  }

  if (!data || data.length === 0) {
    logger.log(`No job found with id=${jobId}`);
    return;
  }

  logger.log(JSON.stringify(data[0], null, 2));
}

inspect().catch((e) => {
  logger.error(e);
  process.exit(1);
});
