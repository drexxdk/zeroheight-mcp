import { z } from "zod";
import { createErrorResponse } from "@/utils/toolResponses";
import { config } from "@/utils/config";
import type { ToolDefinition } from "@/tools/toolTypes";
import { getJobFromDb } from "./utils/jobStore";
import { isRecord } from "@/utils/common/typeGuards";

const tasksTailInput = z.object({
  taskId: z.string(),
  sinceLine: z.preprocess((val) => {
    if (typeof val === "string") {
      const n = Number(val);
      return Number.isFinite(n) ? n : val;
    }
    return val;
  }, z.number().int().nonnegative().optional()),
  timeoutMs: z.preprocess((val) => {
    if (typeof val === "string") {
      const n = Number(val);
      return Number.isFinite(n) ? n : val;
    }
    return val;
  }, z.number().int().nonnegative().optional()),
  intervalMs: z.preprocess((val) => {
    if (typeof val === "string") {
      const n = Number(val);
      return Number.isFinite(n) ? n : val;
    }
    return val;
  }, z.number().int().nonnegative().optional()),
});

export type TasksTailResult = {
  task: {
    taskId: string;
    status: string;
    lines: string[];
    nextCursor: number;
    finished_at?: string | null;
    error?: string | null;
  };
};

export const tasksTailTool: ToolDefinition<
  typeof tasksTailInput,
  TasksTailResult | ReturnType<typeof createErrorResponse>
> = {
  title: "TASKS_tail",
  description: "Tail logs for a taskId (polls DB and returns new log lines).",
  inputSchema: tasksTailInput,
  outputSchema: z.object({
    task: z.object({
      taskId: z.string(),
      status: z.string(),
      lines: z.array(z.string()),
      nextCursor: z.number().int(),
      finished_at: z.string().nullable().optional(),
      error: z.string().nullable().optional(),
    }),
  }),
  handler: async ({ taskId, sinceLine, timeoutMs, intervalMs }) => {
    try {
      const poll =
        typeof timeoutMs === "number"
          ? timeoutMs
          : config.server.defaultTimeoutMs;
      const interval =
        typeof intervalMs === "number" ? Math.max(200, intervalMs) : 1000;
      const start = Date.now();

      let cursor = typeof sinceLine === "number" ? sinceLine : 0;

      while (Date.now() - start < poll) {
        const j = await getJobFromDb({ jobId: taskId });
        if (!j)
          return createErrorResponse({
            message: `No task found with id=${taskId}`,
          });

        const raw = j.logs ?? "";
        const lines = raw === "" ? [] : String(raw).split(/\r?\n/);
        if (lines.length > cursor) {
          const newLines = lines.slice(cursor);
          cursor = lines.length;
          return formatTailLinesResult(j, newLines, cursor);
        }

        if (
          j.status &&
          ["completed", "failed", "cancelled"].includes(j.status)
        ) {
          // terminal but no new lines — return terminal state
          return formatTailTerminalResult(j, cursor);
        }

        await new Promise((r) => setTimeout(r, interval));
      }

      return {
        task: { taskId, status: "running", lines: [], nextCursor: cursor },
      };
    } catch (e) {
      return createErrorResponse({
        message: String(e instanceof Error ? e.message : e),
      });
    }
  },
};

function formatTailLinesResult(
  j: unknown,
  newLines: string[],
  cursor: number,
): TasksTailResult | ReturnType<typeof createErrorResponse> {
  if (!isRecord(j))
    return createErrorResponse({ message: "Invalid job record" });
  return {
    task: {
      taskId: String(j.id),
      status: String(j.status),
      lines: newLines,
      nextCursor: cursor,
      finished_at: (j.finished_at as string) ?? null,
      error: (j.error as string) ?? null,
    },
  };
}

function formatTailTerminalResult(
  j: unknown,
  cursor: number,
): TasksTailResult | ReturnType<typeof createErrorResponse> {
  if (!isRecord(j))
    return createErrorResponse({ message: "Invalid job record" });
  return {
    task: {
      taskId: String(j.id),
      status: String(j.status),
      lines: [],
      nextCursor: cursor,
      finished_at: (j.finished_at as string) ?? null,
      error: (j.error as string) ?? null,
    },
  };
}
