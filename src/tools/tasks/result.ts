import { getSupabaseAdminClient } from "@/utils/common";
import { getJobFromDb } from "./utils/jobStore";
import { TERMINAL, SERVER_SUGGESTED_TTL_MS, SERVER_MAX_TTL_MS } from "./utils";
import { z } from "zod";

export const tasksResultTool = {
  title: "tasks-result",
  description:
    "Retrieve task result (blocks until terminal) — returns task metadata and logs.",
  inputSchema: z.object({
    taskId: z.string(),
    timeoutMs: z.number().optional(),
    requestedTtlMs: z.number().int().nonnegative().optional(),
  }),
  handler: async ({
    taskId,
    timeoutMs,
    requestedTtlMs,
  }: {
    taskId: string;
    timeoutMs?: number;
    requestedTtlMs?: number;
  }) => {
    try {
      const admin = getSupabaseAdminClient();
      if (!admin)
        return {
          error: { code: -32000, message: "Admin client not configured" },
        };
      const poll = timeoutMs ?? 60000;
      const interval = 5000;
      const start = Date.now();

      while (Date.now() - start < poll) {
        const j = await getJobFromDb({ jobId: taskId });
        if (!j)
          return {
            error: { code: -32001, message: `No task found with id=${taskId}` },
          };
        if (TERMINAL.has(j.status)) {
          const maybe = j as unknown as Record<string, unknown>;
          if (
            Object.prototype.hasOwnProperty.call(maybe, "result") &&
            maybe.result != null
          ) {
            const ttl =
              typeof requestedTtlMs === "number"
                ? Math.min(requestedTtlMs, SERVER_MAX_TTL_MS)
                : SERVER_SUGGESTED_TTL_MS;
            return {
              taskId: j.id,
              status: j.status,
              result: maybe.result,
              ttl,
            };
          }
          const ttl =
            typeof requestedTtlMs === "number"
              ? Math.min(requestedTtlMs, SERVER_MAX_TTL_MS)
              : SERVER_SUGGESTED_TTL_MS;
          return {
            taskId: j.id,
            status: j.status,
            logs: j.logs ?? null,
            started_at: j.started_at ?? null,
            finished_at: j.finished_at ?? null,
            error: j.error ?? null,
            ttl,
          };
        }
        await new Promise((r) => setTimeout(r, interval));
      }
      return {
        error: {
          code: -32002,
          message: "Timeout waiting for task to reach terminal state",
        },
      };
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
