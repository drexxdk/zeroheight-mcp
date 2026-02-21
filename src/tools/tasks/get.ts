import { getSupabaseAdminClient } from "@/utils/common";
import { getJobFromDb } from "./utils/jobStore";
import { mapStatusToSep } from "./utils";
import { config } from "@/utils/config";
import { z } from "zod";
import { createErrorResponse } from "@/utils/toolResponses";
import type { ToolDefinition } from "@/tools/toolTypes";
import type { TasksGetResult } from "./types";

const tasksGetInput = z
  .object({
    taskId: z.string(),
    requestedTtlMs: z.number().int().nonnegative().optional(),
  })
  .required();

export const tasksGetTool: ToolDefinition<
  typeof tasksGetInput,
  TasksGetResult | ReturnType<typeof createErrorResponse>
> = {
  title: "TASKS_get",
  description: "Get task status and metadata by taskId (SEP-1686).",
  inputSchema: tasksGetInput,
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
    taskId,
    requestedTtlMs,
  }: z.infer<typeof tasksGetInput>) => {
    try {
      console.log("tasks/get handler called with", { taskId, requestedTtlMs });
      const admin = getSupabaseAdminClient();
      if (!admin)
        return createErrorResponse({ message: "Admin client not configured" });
      const j = await getJobFromDb({ jobId: taskId });
      if (!j)
        return createErrorResponse({
          message: `No task found with id=${taskId}`,
        });

      const ttl =
        typeof requestedTtlMs === "number"
          ? Math.min(requestedTtlMs, config.server.maxTtlMs)
          : config.server.suggestedTtlMs;
      const res = {
        task: {
          taskId: j.id,
          status: mapStatusToSep({ status: j.status }),
          statusMessage: j.error ?? null,
          createdAt: j.created_at ?? null,
          lastUpdatedAt: j.finished_at ?? j.started_at ?? null,
          ttl,
          pollInterval: config.server.pollIntervalMs,
        },
      };
      return res;
    } catch (e) {
      return createErrorResponse({
        message: String(e instanceof Error ? e.message : e),
      });
    }
  },
};
