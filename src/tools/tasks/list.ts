import { getSupabaseAdminClient } from "@/utils/common";
import { z } from "zod";

export const tasksListTool = {
  title: "tasks-list",
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
