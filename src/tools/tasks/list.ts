import { getSupabaseAdminClient } from "@/utils/common";
import { z } from "zod";
import { createErrorResponse } from "@/utils/toolResponses";
import type { ToolDefinition } from "@/tools/toolTypes";
import type { TasksListResult } from "./types";

const tasksListInput = z
  .object({
    limit: z.number().int().positive().optional(),
    offset: z.number().int().nonnegative().optional(),
  })
  .optional();

export const tasksListTool: ToolDefinition<
  typeof tasksListInput,
  TasksListResult | { error: string } | ReturnType<typeof createErrorResponse>
> = {
  title: "TASKS_list",
  description: "List tasks (simple pagination: limit, offset).",
  inputSchema: tasksListInput,
  outputSchema: z.object({
    items: z.array(z.record(z.string(), z.unknown())),
    limit: z.number().int(),
    offset: z.number().int(),
  }),
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
      if (error) return { error: error.message || String(error) };
      return { items: data ?? [], limit: l, offset: o };
    } catch (e) {
      return createErrorResponse({
        message: String(e instanceof Error ? e.message : e),
      });
    }
  },
};
