#!/usr/bin/env tsx

import { runTool } from "./start-task";
import logger from "../../src/utils/logger";

async function main(): Promise<void> {
  const ids = process.argv.slice(2);
  if (ids.length === 0) {
    logger.error(
      "Usage: npx tsx scripts/tasks/cancel-task.ts <taskId> [<taskId> ...]",
    );
    process.exit(2);
  }

  try {
    for (const id of ids) {
      const res = await runTool(
        "../../src/tools/tasks/cancel",
        "tasksCancelTool",
        {
          taskId: id,
        },
      );
      logger.log(JSON.stringify(res, null, 2));
    }
  } catch (e) {
    logger.error("Cancel task failed:", e instanceof Error ? e.message : e);
    process.exit(3);
  }
}

main();
