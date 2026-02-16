#!/usr/bin/env -S node
import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const jobId = process.argv[2] || "mlp7rl59t4gw1o";
  try {
    const { tasksCancelTool } = await import("../src/tools/scraper/tasksTools");
    const res = await tasksCancelTool.handler({ taskId: jobId });
    console.log(JSON.stringify(res, null, 2));
  } catch (e) {
    console.error("Cancel script failed:", e);
    process.exit(1);
  }
}

main();
