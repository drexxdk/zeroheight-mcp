import { getSupabaseAdminClient } from "@/utils/common";
import { getJobFromDb } from "./utils/jobStore";
import { TERMINAL, SERVER_SUGGESTED_TTL_MS, SERVER_MAX_TTL_MS } from "./utils";
import { z } from "zod";
import {
  createErrorResponse,
  createSuccessResponse,
} from "@/utils/toolResponses";
import { isRecord } from "@/utils/common/typeGuards";
import type { ToolDefinition } from "@/tools/toolTypes";

const tasksResultInput = z.object({
  taskId: z.string(),
  timeoutMs: z.number().optional(),
  requestedTtlMs: z.number().int().nonnegative().optional(),
});

export const tasksResultTool: ToolDefinition<typeof tasksResultInput> = {
  title: "tasks-result",
  description:
    "Retrieve task result (blocks until terminal) — returns task metadata and logs.",
  inputSchema: tasksResultInput,
  handler: async ({
    taskId,
    timeoutMs,
    requestedTtlMs,
  }: z.infer<typeof tasksResultInput>) => {
    try {
      const admin = getSupabaseAdminClient();
      if (!admin)
        return createErrorResponse({ message: "Admin client not configured" });
      const poll = timeoutMs ?? 60000;
      const interval = 5000;
      const start = Date.now();

      while (Date.now() - start < poll) {
        const j = await getJobFromDb({ jobId: taskId });
        if (!j)
          return createErrorResponse({
            message: `No task found with id=${taskId}`,
          });
        if (TERMINAL.has(j.status)) {
          if (
            isRecord(j) &&
            Object.prototype.hasOwnProperty.call(j, "result") &&
            j.result != null
          ) {
            const ttl =
              typeof requestedTtlMs === "number"
                ? Math.min(requestedTtlMs, SERVER_MAX_TTL_MS)
                : SERVER_SUGGESTED_TTL_MS;
            return createSuccessResponse({
              data: {
                taskId: j.id,
                status: j.status,
                result: j.result,
                ttl,
              },
            });
          }
          const ttl =
            typeof requestedTtlMs === "number"
              ? Math.min(requestedTtlMs, SERVER_MAX_TTL_MS)
              : SERVER_SUGGESTED_TTL_MS;
          return createSuccessResponse({
            data: {
              taskId: j.id,
              status: j.status,
              logs: j.logs ?? null,
              started_at: j.started_at ?? null,
              finished_at: j.finished_at ?? null,
              error: j.error ?? null,
              ttl,
            },
          });
        }
        await new Promise((r) => setTimeout(r, interval));
      }
      return createErrorResponse({
        message: "Timeout waiting for task to reach terminal state",
      });
    } catch (e: unknown) {
      return createErrorResponse({
        message: String(e instanceof Error ? e.message : e),
      });
    }
  },
};
