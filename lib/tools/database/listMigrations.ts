import { z } from "zod";
import { createErrorResponse, createSuccessResponse } from "../../common";
import { getClient } from "../../common/supabaseClients";

export const listMigrationsTool = {
  title: "list-migrations",
  description: "List all database migrations in chronological order.",
  inputSchema: z.object({}),
  handler: async () => {
    const { client } = getClient();
    if (!client) {
      return createErrorResponse("Error: Supabase client not configured");
    }

    try {
      // Use untyped client for system tables
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const untypedClient = client as any;
      const migrationsTable = "schema_migrations" as const;
      const { data: migrations, error } = await untypedClient
        .from(migrationsTable)
        .select("*")
        .order("version", { ascending: false });

      if (error) {
        return createErrorResponse(
          `Error getting migrations: ${error.message}`,
        );
      }

      return createSuccessResponse(migrations);
    } catch (error) {
      return createErrorResponse(
        `Error listing migrations: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  },
};
