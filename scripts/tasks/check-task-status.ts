#!/usr/bin/env tsx

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import logger from "../../src/utils/logger";

async function main(): Promise<void> {
  const ids = process.argv.slice(2);
  if (ids.length === 0) {
    logger.error("Usage: npx tsx scripts/tasks/check-task-status.ts <taskId>");
    process.exit(2);
  }
  const { getJobFromDb } = await import("../../src/tools/tasks/utils/jobStore");
  for (const jobId of ids) {
    logger.log(`Checking status for jobId=${jobId}...`);
    const job = await getJobFromDb({ jobId });
    logger.log(JSON.stringify(job, null, 2));
  }
}

main().catch((e) => {
  logger.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
