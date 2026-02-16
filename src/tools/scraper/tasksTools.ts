import { z } from "zod";
import { getSupabaseAdminClient } from "@/utils/common";
import { getJobFromDb, markJobCancelledInDb } from "./jobStore";

const TERMINAL = new Set(["completed", "failed", "cancelled"]);

const SERVER_SUGGESTED_TTL_MS = 60000; // 1 minute
const SERVER_MAX_TTL_MS = 60 * 60 * 1000; // 1 hour

function mapStatusToSep(status: string) {
  if (status === "queued" || status === "running") return "working";
  return status;
}

export const tasksGetTool = {
  title: "tasks/get",
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
      const j = await getJobFromDb(taskId);
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
          status: mapStatusToSep(j.status),
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

export const tasksResultTool = {
  title: "tasks/result",
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
        const j = await getJobFromDb(taskId);
        if (!j)
          return {
            error: { code: -32001, message: `No task found with id=${taskId}` },
          };
        if (TERMINAL.has(j.status)) {
          // Prefer stored structured result when present (safe type-guard)
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
              status: mapStatusToSep(j.status),
              result: maybe.result,
              ttl,
            };
          }
          // Fallback: return logs + status
          const ttl =
            typeof requestedTtlMs === "number"
              ? Math.min(requestedTtlMs, SERVER_MAX_TTL_MS)
              : SERVER_SUGGESTED_TTL_MS;
          return {
            taskId: j.id,
            status: mapStatusToSep(j.status),
            logs: j.logs ?? null,
            started_at: j.started_at ?? null,
            finished_at: j.finished_at ?? null,
            error: j.error ?? null,
            ttl,
          };
        }
        // wait
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

export const tasksListTool = {
  title: "tasks/list",
  description: "List tasks (simple pagination: limit, offset).",
  inputSchema: z
    .object({
      limit: z.number().int().positive().optional(),
      offset: z.number().int().nonnegative().optional(),
    })
    .optional(),
  handler: async (args?: { limit?: number; offset?: number }) => {
    const { limit, offset } = args ?? {};
    try {
      const admin = getSupabaseAdminClient();
      if (!admin)
        return {
          error: { code: -32000, message: "Admin client not configured" },
        };
      const l = limit ?? 50;
      const o = offset ?? 0;
      const { data, error } = await admin
        .from("tasks")
        .select("id, name, status, created_at, started_at, finished_at")
        .order("created_at", { ascending: false })
        .range(o, o + l - 1);
      if (error)
        return {
          error: { code: -32003, message: error.message || String(error) },
        };
      return { items: data ?? [], limit: l, offset: o };
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

export const tasksCancelTool = {
  title: "tasks/cancel",
  description: "Cancel a task by id (marks as cancelled).",
  inputSchema: z.object({ taskId: z.string() }),
  handler: async ({ taskId }: { taskId: string }) => {
    try {
      const admin = getSupabaseAdminClient();
      if (!admin)
        return {
          error: { code: -32000, message: "Admin client not configured" },
        };
      await markJobCancelledInDb(taskId);
      return { taskId, action: "cancelled" };
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
