#!/usr/bin/env tsx

import { runTool } from "./start-task";
import logger from "../../src/utils/logger";

async function main(): Promise<void> {
  const taskId = process.argv[2];
  if (!taskId) {
    logger.error("Usage: npx tsx scripts/tasks/check-task.ts <taskId>");
    process.exit(1);
  }

  try {
    const res = await runTool("../../src/tools/tasks/get", "tasksGetTool", {
      taskId,
    });
    logger.log(JSON.stringify(res, null, 2));
  } catch (e) {
    logger.error("Check task failed:", e instanceof Error ? e.message : e);
    process.exit(2);
  }
}

main();
