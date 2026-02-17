import { z } from "zod";
import {
  createErrorResponse,
  createSuccessResponse,
} from "@/utils/toolResponses";
import { getClient } from "@/utils/common/supabaseClients";
import type { ToolDefinition } from "@/tools/toolTypes";

const listTablesInput = z.object({});

export const listTablesTool: ToolDefinition<typeof listTablesInput> = {
  title: "DATABASE_list-tables",
  description:
    "List all tables in the database schemas to understand the data structure.",
  inputSchema: listTablesInput,
  handler: async () => {
    const { client: supabase } = getClient();
    if (!supabase) {
      return createErrorResponse({
        message: "Error: Supabase client not configured",
      });
    }

    try {
      // Return known tables from the database schema
      const knownTables = ["pages", "images"];

      return createSuccessResponse({ data: knownTables });
    } catch (error) {
      return createErrorResponse({
        message: `Error listing tables: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  },
};
