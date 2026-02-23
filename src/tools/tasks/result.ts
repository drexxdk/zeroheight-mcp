import { getSupabaseAdminClient } from "@/utils/common";
import { getJobFromDb } from "./utils/jobStore";
import { TERMINAL } from "./utils";
import { config } from "@/utils/config";
import { z } from "zod";
import { createErrorResponse } from "@/utils/toolResponses";
import type { ToolDefinition } from "@/tools/toolTypes";
import type { TasksResultResponse } from "./types";
import { isRecord } from "@/utils/common/typeGuards";

const tasksResultInput = z.object({
  taskId: z.string(),
  timeoutMs: z.number().optional(),
  requestedTtlMs: z.number().int().nonnegative().optional(),
});

export const tasksResultTool: ToolDefinition<
  typeof tasksResultInput,
  TasksResultResponse | ReturnType<typeof createErrorResponse>
> = {
  title: "TASKS_result",
  description:
    "Retrieve task result (blocks until terminal) — returns task metadata and logs.",
  inputSchema: tasksResultInput,
  outputSchema: z.union([
    z.object({
      taskId: z.string(),
      status: z.string(),
      result: z.unknown(),
      ttl: z.number().optional(),
    }),
    z.object({
      taskId: z.string(),
      status: z.string(),
      logs: z.string().nullable(),
      started_at: z.string().nullable().optional(),
      finished_at: z.string().nullable().optional(),
      error: z.string().nullable().optional(),
      ttl: z.number().optional(),
    }),
  ]),
  handler: async ({
    taskId,
    timeoutMs,
    requestedTtlMs,
  }: z.infer<typeof tasksResultInput>) => {
    try {
      const admin = getSupabaseAdminClient();
      if (!admin)
        return createErrorResponse({ message: "Admin client not configured" });
      const poll = timeoutMs ?? config.server.pollDefaultTimeoutMs;
      const interval = config.server.pollIntervalMs;
      const start = Date.now();
      while (Date.now() - start < poll) {
        const j = await getJobFromDb({ jobId: taskId });
        if (!j)
          return createErrorResponse({
            message: `No task found with id=${taskId}`,
          });
        if (TERMINAL.has(j.status)) return formatTaskResult(j, requestedTtlMs);
        await new Promise((r) => setTimeout(r, interval));
      }
      return createErrorResponse({
        message: "Timeout waiting for task to reach terminal state",
      });
    } catch (e) {
      return createErrorResponse({
        message: String(e instanceof Error ? e.message : e),
      });
    }
  },
};

function formatTaskResult(
  j: unknown,
  requestedTtlMs?: number,
): TasksResultResponse | ReturnType<typeof createErrorResponse> {
  if (!isRecord(j))
    return createErrorResponse({ message: "Invalid job record" });
  const ttl =
    typeof requestedTtlMs === "number"
      ? Math.min(requestedTtlMs, config.server.maxTtlMs)
      : config.server.suggestedTtlMs;
  const taskId = typeof j.id === "string" ? j.id : String(j.id);
  const status = typeof j.status === "string" ? j.status : String(j.status);

  if (Object.prototype.hasOwnProperty.call(j, "result") && j.result != null) {
    return {
      taskId,
      status,
      result: j.result,
      ttl,
    } as const;
  }

  const logs = typeof j.logs === "string" ? j.logs : null;
  const started_at = typeof j.started_at === "string" ? j.started_at : null;
  const finished_at = typeof j.finished_at === "string" ? j.finished_at : null;
  const error = typeof j.error === "string" ? j.error : null;

  return {
    taskId,
    status,
    logs,
    started_at,
    finished_at,
    error,
    ttl,
  } as const;
}
