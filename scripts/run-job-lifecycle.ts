#!/usr/bin/env tsx
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import {
  createJobInDb,
  claimNextJob,
  appendJobLog,
  finishJob,
  getJobFromDb,
} from "../lib/tools/scraper/jobStore";

async function run() {
  try {
    console.log("Creating test job...");
    const id = await createJobInDb("test-job-run", { foo: "bar" });
    console.log("Created job id:", id);

    console.log("Claiming next job...");
    const claimed = await claimNextJob();
    console.log("Claimed:", claimed ? claimed.id : null);

    console.log("Appending log...");
    await appendJobLog(id, "first log line from test");

    console.log("Finishing job...");
    await finishJob(id, true);

    console.log("Fetching job...");
    const job = await getJobFromDb(id);
    console.log(JSON.stringify(job, null, 2));
  } catch (e) {
    console.error(
      "Error during job lifecycle test:",
      e instanceof Error ? e.message : e,
    );
    process.exit(1);
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
