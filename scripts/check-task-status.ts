import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

async function main() {
  const jobId = process.argv[2] || "mlp4tnvbmopnso";
  const { getJobFromDb } = await import("../src/tools/scraper/jobStore");
  console.log(`Checking status for jobId=${jobId}...`);
  const job = await getJobFromDb(jobId);
  console.log("Job:", JSON.stringify(job, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
