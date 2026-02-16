import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

async function main() {
  const { tailJobTool } = await import("../src/tools/scraper/tailJob");
  const jobId = process.argv[2] || "mlp32d3twsjjwy"; // default to last test job
  console.log("Tailing job:", jobId);
  const res = await tailJobTool.handler({ jobId, tail: 200 });
  console.log(JSON.stringify(res, null, 2));
}

main().catch((e) => {
  console.error("Error tailing job:", e);
  process.exit(1);
});
