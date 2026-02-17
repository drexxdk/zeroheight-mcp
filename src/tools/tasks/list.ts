import { getSupabaseAdminClient } from "@/utils/common";
import { z } from "zod";
import {
  createErrorResponse,
  createSuccessResponse,
} from "@/utils/toolResponses";
import type { ToolDefinition } from "@/tools/toolTypes";

const tasksListInput = z
  .object({
    limit: z.number().int().positive().optional(),
    offset: z.number().int().nonnegative().optional(),
  })
  .optional();

export const tasksListTool: ToolDefinition<typeof tasksListInput> = {
  title: "tasks-list",
  description: "List tasks (simple pagination: limit, offset).",
  inputSchema: tasksListInput,
  handler: async (args?: z.infer<typeof tasksListInput>) => {
    const { limit, offset } = args ?? {};
    try {
      const admin = getSupabaseAdminClient();
      if (!admin)
        return createErrorResponse({ message: "Admin client not configured" });
      const l = limit ?? 50;
      const o = offset ?? 0;
      const { data, error } = await admin
        .from("tasks")
        .select("id, name, status, created_at, started_at, finished_at")
        .order("created_at", { ascending: false })
        .range(o, o + l - 1);
      if (error)
        return createErrorResponse({ message: error.message || String(error) });
      return createSuccessResponse({
        data: { items: data ?? [], limit: l, offset: o },
      });
    } catch (e: unknown) {
      return createErrorResponse({
        message: String(e instanceof Error ? e.message : e),
      });
    }
  },
};
