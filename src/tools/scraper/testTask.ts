import { z } from "zod";
import {
  createErrorResponse,
  createSuccessResponse,
} from "@/utils/toolResponses";
import {
  createTestJobInDb,
  appendJobLog,
  finishJob,
  getJobFromDb,
  claimJobById,
} from "./jobStore";

export const testTaskTool = {
  title: "testtask",
  description:
    "Start a safe test task that ticks once per second for a duration (minutes).",
  inputSchema: z.object({
    durationMinutes: z
      .number()
      .int()
      .positive()
      .optional()
      .describe("Duration in minutes; defaults to 10"),
  }),
  handler: async ({ durationMinutes }: { durationMinutes?: number } = {}) => {
    const minutes = durationMinutes ?? 15;
    try {
      const jobId = await createTestJobInDb("testtask", {
        durationMinutes: minutes,
      });

      if (!jobId) {
        return createErrorResponse("Failed to create test job");
      }

      // mark the job as running so it appears active in the DB
      try {
        await claimJobById(jobId as string);
      } catch (e) {
        // ignore claim failures; job will remain queued but background worker can still run
      }

      (async () => {
        try {
          const totalSeconds = minutes * 60;
          for (let i = 1; i <= totalSeconds; i++) {
            const j = await getJobFromDb(jobId as string);
            if (j && j.status === "cancelled") {
              await appendJobLog(jobId as string, "Job cancelled by user");
              await finishJob(jobId as string, false, undefined, "cancelled");
              return;
            }
            await appendJobLog(jobId as string, `tick ${i}/${totalSeconds}`);
            await new Promise((res) => setTimeout(res, 1000));
          }
          await appendJobLog(jobId as string, "Test task completed");
          await finishJob(jobId as string, true, { message: "completed" });
        } catch (e) {
          const errMsg = e instanceof Error ? e.message : String(e);
          await appendJobLog(jobId as string, `Error: ${errMsg}`);
          await finishJob(jobId as string, false, undefined, errMsg);
        }
      })();

      return createSuccessResponse({ message: "Test task started", jobId });
    } catch (e) {
      return createErrorResponse(
        `Test task failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  },
};
