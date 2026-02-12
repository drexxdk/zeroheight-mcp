import { z } from "zod";
import { getSupabaseClient, createErrorResponse } from "../../common";

export const executeSqlTool = {
  title: "execute-sql",
  description: "Execute a SQL query on the database.",
  inputSchema: z.object({
    query: z.string().describe("The SQL query to execute"),
  }),
  handler: async () => {
    const client = getSupabaseClient();
    if (!client) {
      return createErrorResponse("Error: Supabase client not configured");
    }

    try {
      // Note: Direct SQL execution is not available through Supabase client
      // This would require a custom RPC function or direct database access
      return createErrorResponse(
        "Direct SQL execution is not supported. Use Supabase Dashboard or create custom RPC functions for complex queries.",
      );
    } catch (error) {
      return createErrorResponse(
        `Error executing SQL: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  },
};
