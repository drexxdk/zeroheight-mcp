import { z } from "zod";
import {
  getSupabaseClient,
  createErrorResponse,
  createSuccessResponse,
} from "../common";

export const listTablesTool = {
  title: "List Tables",
  description: "List all tables in the database.",
  inputSchema: z.object({}),
  handler: async () => {
    const client = getSupabaseClient();
    if (!client) {
      return createErrorResponse("Error: Supabase client not configured");
    }

    try {
      // Get table information using untyped client for system tables
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const untypedClient = client as any;
      const { data: tables, error } = await untypedClient
        .from("information_schema.tables")
        .select("table_name")
        .eq("table_schema", "public")
        .neq("table_name", "schema_migrations"); // Exclude migrations table

      if (error) {
        return createErrorResponse(`Error getting tables: ${error.message}`);
      }

      const tableNames =
        tables?.map((table: { table_name: string }) => table.table_name) || [];
      return createSuccessResponse(tableNames);
    } catch (error) {
      return createErrorResponse(
        `Error listing tables: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  },
};

export const executeSqlTool = {
  title: "Execute SQL",
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

export const listMigrationsTool = {
  title: "List Migrations",
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

export const getLogsTool = {
  title: "Get Logs",
  description: "Get recent logs from the database.",
  inputSchema: z.object({}),
  handler: async () => {
    const client = getSupabaseClient();
    if (!client) {
      return createErrorResponse("Error: Supabase client not configured");
    }

    try {
      // This would typically query a logs table
      // For now, return a message that logs are not implemented
      return createErrorResponse(
        "Logs functionality not yet implemented. This would query a logs table in the database.",
      );
    } catch (error) {
      return createErrorResponse(
        `Error getting logs: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  },
};
