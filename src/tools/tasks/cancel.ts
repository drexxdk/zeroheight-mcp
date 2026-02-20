import { getSupabaseAdminClient } from "@/utils/common";
import { markJobCancelledInDb } from "./utils/jobStore";
import { z } from "zod";
import {
  createErrorResponse,
  createSuccessResponse,
} from "@/utils/toolResponses";
import type { ToolDefinition } from "@/tools/toolTypes";

const tasksCancelInput = z.object({ taskId: z.string() });

export const tasksCancelTool: ToolDefinition<typeof tasksCancelInput> = {
  title: "tasks-cancel",
  description: "Cancel a task by id (marks as cancelled).",
  inputSchema: tasksCancelInput,
  handler: async ({ taskId }: z.infer<typeof tasksCancelInput>) => {
    try {
      const admin = getSupabaseAdminClient();
      if (!admin)
        return createErrorResponse({ message: "Admin client not configured" });
      await markJobCancelledInDb({ jobId: taskId });
      return createSuccessResponse({ data: { taskId, action: "cancelled" } });
    } catch (e) {
      return createErrorResponse({
        message: String(e instanceof Error ? e.message : e),
      });
    }
  },
};
