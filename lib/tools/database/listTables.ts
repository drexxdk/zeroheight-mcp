import { z } from "zod";
import {
  getSupabaseClient,
  createErrorResponse,
  createSuccessResponse,
} from "../../common";

export const listTablesTool = {
  title: "list-tables",
  description: "List all tables in the database.",
  inputSchema: z.object({}),
  handler: async () => {
    const client = getSupabaseClient();
    if (!client) {
      return createErrorResponse("Error: Supabase client not configured");
    }

    try {
      // Return known tables from the database schema
      const knownTables = ["pages", "images"];

      return createSuccessResponse(knownTables);
    } catch (error) {
      return createErrorResponse(
        `Error listing tables: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  },
};
