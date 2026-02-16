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
} from "./jobStore";
// Uses shared `jobStore` helpers for job lifecycle and logging; no local DB logic.

export const scrapeZeroheightProjectTestTool = {
  title: "scrape-zeroheight-project-test",
  description:
    "Start a safe test scraper job that ticks once per second for a duration (minutes).",
  inputSchema: z.object({
    durationMinutes: z
      .number()
      .int()
      .positive()
      .optional()
      .describe("Duration in minutes; defaults to 10"),
  }),
  handler: async ({ durationMinutes }: { durationMinutes?: number }) => {
    const minutes = durationMinutes ?? 10;
    try {
      const jobId = await createTestJobInDb("scrape-zeroheight-project-test", {
        durationMinutes: minutes,
      });

      if (!jobId) {
        return createErrorResponse("Failed to create test job");
      }

      // Start background worker that mirrors real scraper's logging and lifecycle
      (async () => {
        try {
          const totalSeconds = minutes * 60;
          for (let i = 1; i <= totalSeconds; i++) {
            const j = await getJobFromDb(jobId as string);
            if (j && j.status === "cancelled") {
              await appendJobLog(jobId as string, "Job cancelled by user");
              await finishJob(jobId as string, false, "cancelled");
              return;
            }
            await appendJobLog(jobId as string, `tick ${i}/${totalSeconds}`);
            await new Promise((res) => setTimeout(res, 1000));
          }
          await appendJobLog(jobId as string, "Test job completed");
          await finishJob(jobId as string, true);
        } catch (e) {
          const errMsg = e instanceof Error ? e.message : String(e);
          await appendJobLog(jobId as string, `Error: ${errMsg}`);
          await finishJob(jobId as string, false, errMsg);
        }
      })();

      return createSuccessResponse({ message: "Test job started", jobId });
    } catch (e) {
      return createErrorResponse(
        `Test job failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  },
};
