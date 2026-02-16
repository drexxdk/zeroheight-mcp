#!/usr/bin/env tsx
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import {
  createTestJobInDb,
  claimJobById,
  appendJobLog,
  finishJob,
  getJobFromDb,
  markJobCancelledInDb,
  deleteJobInDb,
} from "@/tools/tasks/utils/jobStore";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function run() {
  console.log("Creating test job...");
  const id = await createTestJobInDb({
    name: "test-job-full-flow",
    args: { foo: "bar" },
  });
  if (!id) {
    console.error("Failed to create job");
    process.exit(1);
  }
  console.log("Created job id:", id);

  // Verify initial state is `working` per SEP-1686
  const before = await getJobFromDb({ jobId: id });
  if (!before) {
    console.error("Failed to read job after creation");
    process.exit(4);
  }
  if (before.status !== "working") {
    console.error(
      "Expected job to be 'working' after creation, got:",
      before.status,
    );
    process.exit(5);
  }

  // Start a background "worker" that will claim and run the job.
  const worker = (async () => {
    console.log("Worker: claiming job by id...");
    const claimed = await claimJobById({ jobId: id });
    if (!claimed) {
      console.error("Worker: no job claimed");
      return;
    }
    console.log("Worker: claimed", claimed.id);

    // Simulate work and periodically check DB for cancellation
    for (let i = 0; i < 30; i++) {
      await appendJobLog({ jobId: claimed.id, line: `worker log ${i}` });
      const job = await getJobFromDb({ jobId: claimed.id });
      if (job && job.status === "cancelled") {
        console.log("Worker: detected cancellation");
        await appendJobLog({
          jobId: claimed.id,
          line: "worker detected cancellation",
        });
        await finishJob({
          jobId: claimed.id,
          success: false,
          result: undefined,
          errorMsg: "cancelled by test",
        });
        return;
      }
      await sleep(200);
    }

    // Completed normally
    console.log("Worker: finished normally");
    await finishJob({ jobId: claimed.id, success: true });
  })();

  // Give the worker a moment to start and write a couple logs
  await sleep(500);

  console.log("Main: reading job (pre-cancel)...");
  const pre = await getJobFromDb({ jobId: id });
  console.log(JSON.stringify(pre, null, 2));
  if (!pre) {
    console.error("Failed to read job before cancel");
    process.exit(6);
  }
  if (pre.status !== "running" && pre.status !== "working") {
    console.error(
      "Expected job to be 'running' or 'working' before cancel, got:",
      pre.status,
    );
    process.exit(7);
  }
  if (!pre.started_at) {
    console.error("Expected job to have 'started_at' set before cancel");
    process.exit(8);
  }

  // Cancel the job
  console.log("Main: cancelling job...");
  await markJobCancelledInDb({ jobId: id });

  // Wait for worker to observe cancellation and finish
  await worker;

  console.log("Main: fetching final job record...");
  const final = await getJobFromDb({ jobId: id });
  console.log(JSON.stringify(final, null, 2));

  if (!final) process.exit(2);
  if (final.status !== "cancelled") {
    console.error("Expected job to be cancelled, got:", final.status);
    process.exit(3);
  }

  console.log(
    "Test successful: job was claimed, cancelled, and worker respected cancellation.",
  );

  // cleanup test job
  try {
    await deleteJobInDb({ jobId: id });
    console.log("Cleaned up test job", id);
  } catch (e) {
    console.warn("Cleanup failed:", e instanceof Error ? e.message : e);
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
