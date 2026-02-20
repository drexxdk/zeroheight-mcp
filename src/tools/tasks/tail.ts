import { z } from "zod";
import { createSuccessResponse, createErrorResponse } from "@/utils/toolResponses";
import type { ToolDefinition } from "@/tools/toolTypes";
import { getJobFromDb } from "./utils/jobStore";

const tasksTailInput = z
  .object({
    taskId: z.string(),
    sinceLine: z.number().int().nonnegative().optional(),
    timeoutMs: z.number().int().nonnegative().optional(),
    intervalMs: z.number().int().nonnegative().optional(),
  })
  .required();

export const tasksTailTool: ToolDefinition<typeof tasksTailInput> = {
  title: "TASKS_tail",
  description:
    "Tail logs for a taskId (polls DB and returns new log lines).",
  inputSchema: tasksTailInput,
  handler: async ({ taskId, sinceLine, timeoutMs, intervalMs }) => {
    try {
      const poll = typeof timeoutMs === "number" ? timeoutMs : 30000;
      const interval = typeof intervalMs === "number" ? Math.max(200, intervalMs) : 1000;
      const start = Date.now();

      let cursor = typeof sinceLine === "number" ? sinceLine : 0;

      while (Date.now() - start < poll) {
        const j = await getJobFromDb({ jobId: taskId });
        if (!j) return createErrorResponse({ message: `No task found with id=${taskId}` });

        const raw = j.logs ?? "";
        const lines = raw === "" ? [] : String(raw).split(/\r?\n/);
        if (lines.length > cursor) {
          const newLines = lines.slice(cursor);
          cursor = lines.length;
          return createSuccessResponse({
            data: {
              taskId: j.id,
              status: j.status,
              lines: newLines,
              nextCursor: cursor,
              finished_at: j.finished_at ?? null,
              error: j.error ?? null,
            },
          });
        }

        if (j.status && ["completed", "failed", "cancelled"].includes(j.status)) {
          // terminal but no new lines — return terminal state
          return createSuccessResponse({
            data: {
              taskId: j.id,
              status: j.status,
              lines: [],
              nextCursor: cursor,
              finished_at: j.finished_at ?? null,
              error: j.error ?? null,
            },
          });
        }

        await new Promise((r) => setTimeout(r, interval));
      }

      return createSuccessResponse({ data: { taskId, status: "running", lines: [], nextCursor: cursor } });
    } catch (e) {
      return createErrorResponse({ message: String(e instanceof Error ? e.message : e) });
    }
  },
};
