#!/usr/bin/env tsx

import { runTool } from "./start-task";

async function main() {
  const taskId = process.argv[2];
  if (!taskId) {
    console.error("Usage: npx tsx scripts/tasks/check-task.ts <taskId>");
    process.exit(1);
  }

  try {
    const res = await runTool("../../src/tools/tasks/get", "tasksGetTool", {
      taskId,
    });
    console.log(JSON.stringify(res, null, 2));
  } catch (e) {
    console.error("Check task failed:", e instanceof Error ? e.message : e);
    process.exit(2);
  }
}

main();
