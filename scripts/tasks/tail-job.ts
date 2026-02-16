import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

async function main() {
  const ids = process.argv.slice(2);
  if (ids.length === 0) {
    console.error("Usage: npx tsx scripts/tasks/tail-job.ts <taskId>");
    process.exit(2);
  }
  const { tasksResultTool } = await import("../../src/tools/tasks");
  for (const jobId of ids) {
    console.log("Querying task result:", jobId);
    const res = await tasksResultTool.handler({
      taskId: jobId,
      timeoutMs: 10000,
    });
    console.log(JSON.stringify(res, null, 2));
  }
}

main().catch((e) => {
  console.error("Error tailing job:", e instanceof Error ? e.message : e);
  process.exit(1);
});
