import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

async function main() {
  // Simple positional arg style (like tail-job-admin.ts). Optional first
  // positional argument is treated as minutes. Default to 5 minutes.
  const arg = process.argv[2];
  let durationMinutes = arg ? Number(arg) : 5;
  if (Number.isNaN(durationMinutes) || durationMinutes <= 0) {
    console.warn(
      `Invalid duration provided (${String(arg)}). Falling back to default 5 minutes.`,
    );
    durationMinutes = 5;
  }

  // Reuse start-task helper for consistent behavior with other scripts
  const { runTool } = await import("./start-task");

  const res = await runTool(
    "../../src/tools/scraper/testTask",
    "testTaskTool",
    {
      durationMinutes,
    },
  );
  console.log("Tool returned:", JSON.stringify(res, null, 2));
}

main().catch((e) => {
  console.error("Error running test task:", e instanceof Error ? e.message : e);
  process.exit(1);
});
