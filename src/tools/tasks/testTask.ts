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
} from "./utils/jobStore";
import type { ToolDefinition } from "@/tools/toolTypes";

const testTaskInputSchema = z.object({
  durationMinutes: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Duration in minutes; defaults to 10"),
});

export const testTaskTool: ToolDefinition<typeof testTaskInputSchema> = {
  title: "test-task",
  description:
    "Start a safe test task that ticks once per second for a duration (minutes).",
  inputSchema: testTaskInputSchema,
  handler: async ({
    durationMinutes,
  }: z.infer<typeof testTaskInputSchema> = {}) => {
    const minutes = durationMinutes ?? 15;
    try {
      const jobId = await createTestJobInDb({
        name: "testtask",
        args: { durationMinutes: minutes },
      });

      if (!jobId) {
        return createErrorResponse({ message: "Failed to create test job" });
      }

      // mark the job as running so it appears active in the DB
      try {
        await claimJobById({ jobId: jobId as string });
      } catch {
        // ignore claim failures; job may remain unclaimed but background worker can still run
      }

      (async () => {
        try {
          const totalSeconds = minutes * 60;
          for (let i = 1; i <= totalSeconds; i++) {
            const j = await getJobFromDb({ jobId: jobId as string });
            if (j && j.status === "cancelled") {
              await appendJobLog({
                jobId: jobId as string,
                line: "Job cancelled by user",
              });
              await finishJob({
                jobId: jobId as string,
                success: false,
                result: undefined,
                errorMsg: "cancelled",
              });
              return;
            }
            await appendJobLog({
              jobId: jobId as string,
              line: `tick ${i}/${totalSeconds}`,
            });
            await new Promise((res) => setTimeout(res, 1000));
          }
          await appendJobLog({
            jobId: jobId as string,
            line: "Test task completed",
          });
          await finishJob({
            jobId: jobId as string,
            success: true,
            result: { message: "completed" },
          });
        } catch (e) {
          const errMsg = e instanceof Error ? e.message : String(e);
          await appendJobLog({
            jobId: jobId as string,
            line: `Error: ${errMsg}`,
          });
          await finishJob({
            jobId: jobId as string,
            success: false,
            result: undefined,
            errorMsg: errMsg,
          });
        }
      })();

      return createSuccessResponse({
        data: { message: "Test task started", jobId },
      });
    } catch (e) {
      return createErrorResponse({
        message: `Test task failed: ${e instanceof Error ? e.message : String(e)}`,
      });
    }
  },
};
