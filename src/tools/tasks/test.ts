import { z } from "zod";
import { createErrorResponse } from "@/utils/toolResponses";
import {
  createTestJobInDb,
  appendJobLog,
  finishJob,
  getJobFromDb,
  claimJobById,
} from "./utils/jobStore";
import { mapStatusToSep, SERVER_SUGGESTED_TTL_MS } from "./utils";
import type { ToolDefinition } from "@/tools/toolTypes";
import type { TasksGetResult } from "./types";

const testTaskInputSchema = z.object({
  durationMinutes: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Duration in minutes; defaults to 10"),
});

export const testTaskTool: ToolDefinition<
  typeof testTaskInputSchema,
  TasksGetResult | ReturnType<typeof createErrorResponse>
> = {
  title: "TASKS_test",
  description:
    "Start a safe test task that ticks once per second for a duration (minutes).",
  inputSchema: testTaskInputSchema,
  outputSchema: z.object({
    task: z.object({
      taskId: z.string(),
      status: z.string(),
      statusMessage: z.string().nullable().optional(),
      createdAt: z.string().nullable().optional(),
      lastUpdatedAt: z.string().nullable().optional(),
      ttl: z.number().optional(),
      pollInterval: z.number().optional(),
    }),
  }),
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
        await claimJobById({ jobId });
      } catch {
        // ignore claim failures; job may remain unclaimed but background worker can still run
      }

      (async () => {
        try {
          const totalSeconds = minutes * 60;
          for (let i = 1; i <= totalSeconds; i++) {
            const j = await getJobFromDb({ jobId });
            if (j && j.status === "cancelled") {
              await appendJobLog({
                jobId,
                line: "Job cancelled by user",
              });
              await finishJob({
                jobId,
                success: false,
                result: undefined,
                errorMsg: "cancelled",
              });
              return;
            }
            await appendJobLog({
              jobId,
              line: `tick ${i}/${totalSeconds}`,
            });
            await new Promise((res) => setTimeout(res, 1000));
          }
          await appendJobLog({ jobId, line: "Test task completed" });
          await finishJob({
            jobId,
            success: true,
            result: { message: "completed" },
          });
        } catch (e) {
          const errMsg = e instanceof Error ? e.message : String(e);
          await appendJobLog({ jobId, line: `Error: ${errMsg}` });
          await finishJob({
            jobId,
            success: false,
            result: undefined,
            errorMsg: errMsg,
          });
        }
      })();

      const createdAt = new Date().toISOString();
      const taskResponse = {
        task: {
          taskId: jobId,
          status: mapStatusToSep({ status: "working" }),
          statusMessage: "Test task is now in progress.",
          createdAt,
          lastUpdatedAt: null,
          ttl: SERVER_SUGGESTED_TTL_MS,
          pollInterval: 5000,
        },
      };
      return taskResponse;
    } catch (e) {
      return createErrorResponse({
        message: `Test task failed: ${e instanceof Error ? e.message : String(e)}`,
      });
    }
  },
};
