#!/usr/bin/env tsx

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

async function main() {
  const ids = process.argv.slice(2);
  if (ids.length === 0) {
    console.error(
      "Usage: npx tsx scripts/tasks/tail-job-long.ts <taskId> [timeoutMs]",
    );
    process.exit(2);
  }
  const timeoutMsArg = Number(process.argv[3] ?? "300000"); // default 5 minutes
  const timeoutMs = Number.isFinite(timeoutMsArg) ? timeoutMsArg : 300000;

  const { tasksResultTool } = await import("../../src/tools/tasks");
  for (const jobId of ids) {
    console.log(
      "Querying task result (long wait):",
      jobId,
      `timeoutMs=${timeoutMs}`,
    );
    const res = await tasksResultTool.handler({
      taskId: jobId,
      timeoutMs,
    });
    console.log(JSON.stringify(res, null, 2));
  }
}

main().catch((e) => {
  console.error("Error tailing job:", e instanceof Error ? e.message : e);
  process.exit(1);
});
