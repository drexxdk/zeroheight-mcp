import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const ids = process.argv.slice(2);
  if (ids.length === 0) {
    console.error(
      "Usage: npx tsx scripts/tasks/cancel-task.ts <taskId> [<taskId> ...]",
    );
    process.exit(2);
  }

  try {
    const { tasksCancelTool } =
      await import("../../src/tools/scraper/tasksTools");
    for (const id of ids) {
      const res = await tasksCancelTool.handler({ taskId: id });
      console.log(JSON.stringify(res, null, 2));
    }
  } catch (e) {
    console.error("Cancel script failed:", e instanceof Error ? e.message : e);
    process.exit(1);
  }
}

main();
