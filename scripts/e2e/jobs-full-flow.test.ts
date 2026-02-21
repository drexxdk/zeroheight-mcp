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
import logger from "../../src/utils/logger";

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function run(): Promise<void> {
  logger.log("Creating test job...");
  const id = await createTestJobInDb({
    name: "test-job-full-flow",
    args: { foo: "bar" },
  });
  if (!id) {
    logger.error("Failed to create job");
    process.exit(1);
  }
  logger.log("Created job id:", id);

  // Verify initial state is `working` per SEP-1686
  const before = await getJobFromDb({ jobId: id });
  if (!before) {
    logger.error("Failed to read job after creation");
    process.exit(4);
  }
  if (before.status !== "working") {
    logger.error(
      "Expected job to be 'working' after creation, got:",
      before.status,
    );
    process.exit(5);
  }

  // Start a background "worker" that will claim and run the job.
  const worker = (async () => {
    logger.log("Worker: claiming job by id...");
    const claimed = await claimJobById({ jobId: id });
    if (!claimed) {
      logger.error("Worker: no job claimed");
      return;
    }
    logger.log("Worker: claimed", claimed.id);

    // Simulate work and periodically check DB for cancellation
    for (let i = 0; i < 30; i++) {
      await appendJobLog({ jobId: claimed.id, line: `worker log ${i}` });
      const job = await getJobFromDb({ jobId: claimed.id });
      if (job && job.status === "cancelled") {
        logger.log("Worker: detected cancellation");
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
    logger.log("Worker: finished normally");
    await finishJob({ jobId: claimed.id, success: true });
  })();

  // Give the worker a moment to start and write a couple logs
  await sleep(500);

  logger.log("Main: reading job (pre-cancel)...");
  const pre = await getJobFromDb({ jobId: id });
  logger.log(JSON.stringify(pre, null, 2));
  if (!pre) {
    logger.error("Failed to read job before cancel");
    process.exit(6);
  }
  if (pre.status !== "running" && pre.status !== "working") {
    logger.error(
      "Expected job to be 'running' or 'working' before cancel, got:",
      pre.status,
    );
    process.exit(7);
  }
  if (!pre.started_at) {
    logger.error("Expected job to have 'started_at' set before cancel");
    process.exit(8);
  }

  // Cancel the job
  logger.log("Main: cancelling job...");
  await markJobCancelledInDb({ jobId: id });

  // Wait for worker to observe cancellation and finish
  await worker;

  logger.log("Main: fetching final job record...");
  const final = await getJobFromDb({ jobId: id });
  logger.log(JSON.stringify(final, null, 2));

  if (!final) process.exit(2);
  if (final.status !== "cancelled") {
    logger.error("Expected job to be cancelled, got:", final.status);
    process.exit(3);
  }
  logger.log(
    "Test successful: job was claimed, cancelled, and worker respected cancellation.",
  );
  // cleanup test job
  try {
    await deleteJobInDb({ jobId: id });
    logger.log("Cleaned up test job", id);
  } catch (e) {
    logger.warn("Cleanup failed:", e instanceof Error ? e.message : e);
  }
}

run().catch((e) => {
  logger.error(e);
  process.exit(1);
});
