import { z } from "zod";
import { createErrorResponse, createSuccessResponse } from "../../common";
import { getClient } from "../../common/supabaseClients";

export const listTablesTool = {
  title: "list-tables",
  description:
    "List all tables in the database schemas to understand the data structure.",
  inputSchema: z.object({}),
  handler: async () => {
    const { client: supabase } = getClient();
    if (!supabase) {
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
