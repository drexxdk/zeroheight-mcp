import { z } from "zod";
import {
  getSupabaseClient,
  createErrorResponse,
  createSuccessResponse,
} from "../../common";

export const listMigrationsTool = {
  title: "list-migrations",
  description: "List all database migrations.",
  inputSchema: z.object({}),
  handler: async () => {
    const client = getSupabaseClient();
    if (!client) {
      return createErrorResponse("Error: Supabase client not configured");
    }

    try {
      // Use untyped client for system tables
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const untypedClient = client as any;
      const { data: migrations, error } = await untypedClient
        .from("schema_migrations")
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
