#!/usr/bin/env tsx
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import {
  createTestJobInDb,
  claimJobById,
  appendJobLog,
  finishJob,
  getJobFromDb,
  deleteJobInDb,
} from "@/tools/tasks/utils/jobStore";

async function run(): Promise<void> {
  try {
    console.log("Creating test job...");
    const id = await createTestJobInDb({
      name: "test-job-run",
      args: { foo: "bar" },
    });
    if (!id) {
      console.error("Failed to create job in DB");
      process.exit(1);
    }
    console.log("Created job id:", id);

    console.log("Claiming job by id...");
    const claimed = await claimJobById({ jobId: id });
    console.log("Claimed:", claimed ? claimed.id : null);

    console.log("Appending log...");
    await appendJobLog({ jobId: id, line: "first log line from test" });

    console.log("Finishing job...");
    await finishJob({ jobId: id, success: true });

    console.log("Fetching job...");
    const job = await getJobFromDb({ jobId: id });
    console.log(JSON.stringify(job, null, 2));

    // cleanup
    await deleteJobInDb({ jobId: id });
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
