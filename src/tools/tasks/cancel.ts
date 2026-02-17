import { getSupabaseAdminClient } from "@/utils/common";
import { markJobCancelledInDb } from "./utils/jobStore";
import { z } from "zod";

export const tasksCancelTool = {
  title: "tasks-cancel",
  description: "Cancel a task by id (marks as cancelled).",
  inputSchema: z.object({ taskId: z.string() }),
  handler: async ({ taskId }: { taskId: string }) => {
    try {
      const admin = getSupabaseAdminClient();
      if (!admin)
        return {
          error: { code: -32000, message: "Admin client not configured" },
        };
      await markJobCancelledInDb({ jobId: taskId });
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
