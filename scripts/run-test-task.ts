import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

async function main() {
  const { testTaskTool } = await import("../src/tools/scraper/testTask");

  console.log("Calling test task tool (default 15 minutes)...");
  const res = await testTaskTool.handler();
  console.log("Tool response:", JSON.stringify(res, null, 2));
}

main().catch((e) => {
  console.error("Error running test task:", e);
  process.exit(1);
});
