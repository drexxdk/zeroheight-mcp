#!/usr/bin/env tsx

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

async function main() {
  const ids = process.argv.slice(2);
  if (ids.length === 0) {
    console.error("Usage: npx tsx scripts/tasks/check-task-status.ts <taskId>");
    process.exit(2);
  }
  const { getJobFromDb } = await import("../../src/tools/tasks/utils/jobStore");
  for (const jobId of ids) {
    console.log(`Checking status for jobId=${jobId}...`);
    const job = await getJobFromDb({ jobId });
    console.log(JSON.stringify(job, null, 2));
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
