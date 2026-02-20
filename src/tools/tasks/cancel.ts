import { getSupabaseAdminClient } from "@/utils/common";
import { markJobCancelledInDb } from "./utils/jobStore";
import { z } from "zod";
import { createErrorResponse } from "@/utils/toolResponses";
import type { ToolDefinition } from "@/tools/toolTypes";
import type { TasksCancelResult } from "./types";

const tasksCancelInput = z.object({ taskId: z.string() });

export const tasksCancelTool: ToolDefinition<
  typeof tasksCancelInput,
  TasksCancelResult | ReturnType<typeof createErrorResponse>
> = {
  title: "TASKS_cancel",
  description: "Cancel a task by id (marks as cancelled).",
  inputSchema: tasksCancelInput,
  outputSchema: z.object({
    taskId: z.string(),
    action: z.literal("cancelled"),
  }),
  handler: async ({ taskId }: z.infer<typeof tasksCancelInput>) => {
    try {
      const admin = getSupabaseAdminClient();
      if (!admin)
        return createErrorResponse({ message: "Admin client not configured" });
      await markJobCancelledInDb({ jobId: taskId });
      return { taskId, action: "cancelled" as const };
    } catch (e) {
      return createErrorResponse({
        message: String(e instanceof Error ? e.message : e),
      });
    }
  },
};
