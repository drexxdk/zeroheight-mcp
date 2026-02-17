import { getSupabaseAdminClient } from "@/utils/common";
import { getJobFromDb } from "./utils/jobStore";
import {
  mapStatusToSep,
  SERVER_SUGGESTED_TTL_MS,
  SERVER_MAX_TTL_MS,
} from "./utils";
import { z } from "zod";

export const tasksGetTool = {
  title: "tasks-get",
  description: "Get task status and metadata by taskId (SEP-1686).",
  inputSchema: z
    .object({
      taskId: z.string(),
      requestedTtlMs: z.number().int().nonnegative().optional(),
    })
    .required(),
  handler: async ({
    taskId,
    requestedTtlMs,
  }: {
    taskId: string;
    requestedTtlMs?: number;
  }) => {
    try {
      console.log("tasks/get handler called with", { taskId, requestedTtlMs });
      const admin = getSupabaseAdminClient();
      if (!admin)
        return {
          error: { code: -32000, message: "Admin client not configured" },
        };
      const j = await getJobFromDb({ jobId: taskId });
      if (!j)
        return {
          error: { code: -32001, message: `No task found with id=${taskId}` },
        };

      const ttl =
        typeof requestedTtlMs === "number"
          ? Math.min(requestedTtlMs, SERVER_MAX_TTL_MS)
          : SERVER_SUGGESTED_TTL_MS;
      const res = {
        task: {
          taskId: j.id,
          status: mapStatusToSep({ status: j.status }),
          statusMessage: j.error ?? null,
          createdAt: j.created_at ?? null,
          lastUpdatedAt: j.finished_at ?? j.started_at ?? null,
          ttl,
          pollInterval: 5000,
        },
      };
      return res;
    } catch (e: unknown) {
      return {
        error: {
          code: -32099,
          message: String(e instanceof Error ? e.message : e),
        },
      };
    }
  },
};
