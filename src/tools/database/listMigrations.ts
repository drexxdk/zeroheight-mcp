import { z } from "zod";
import {
  createErrorResponse,
  createSuccessResponse,
} from "@/utils/toolResponses";
import { getClient } from "@/utils/common/supabaseClients";
import { DATABASE_URL, ALLOW_AUTO_CREATE_SCHEMA_MIGRATIONS } from "@/utils/config";

export const listMigrationsTool = {
  title: "list-migrations",
  description: "List all database migrations in chronological order.",
  inputSchema: z.object({}),
  handler: async () => {
    const { client: supabase } = getClient();
    if (!supabase) {
      return createErrorResponse({
        message: "Error: Supabase client not configured",
      });
    }

    try {
      // Use untyped client for system tables
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const untypedClient = supabase as any;
      const migrationsTable = "schema_migrations" as const;
      const { data: migrations, error } = await untypedClient
        .from(migrationsTable)
        .select("*")
        .order("version", { ascending: false });

      if (error) {
        // If the migrations table is not present in the DB, attempt an
        // idempotent creation when allowed, otherwise fall back to
        // listing the repository's local migration files (useful in dev).
        const msg = String(error.message || error);
        if (msg.includes("Could not find the table") || msg.includes("schema_migrations")) {
          // If env allows auto-creation and a DATABASE_URL is present,
          // try to create the table using a direct Postgres connection.
          const allowCreate = ALLOW_AUTO_CREATE_SCHEMA_MIGRATIONS;
          const dbUrl = DATABASE_URL;
          if (allowCreate && dbUrl) {
            try {
              // Dynamically import pg to avoid adding runtime cost unless used
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const { Client } = await import("pg") as any;
              const client = new Client({ connectionString: dbUrl });
              await client.connect();
              const createSql = `CREATE TABLE IF NOT EXISTS public.schema_migrations (
  version text PRIMARY KEY,
  dirty boolean DEFAULT false,
  inserted_at timestamptz DEFAULT now()
);`;
              await client.query(createSql);
              await client.end();

              // After creating, try the original query again
              const { data: migrationsAfter, error: errAfter } = await untypedClient
                .from(migrationsTable)
                .select("*")
                .order("version", { ascending: false });
              if (errAfter) {
                // Fall back to filesystem listing if anything still fails
                throw errAfter;
              }
              return createSuccessResponse({ data: migrationsAfter });
            } catch (createErr) {
              // If create attempt failed, fall through to filesystem fallback
              // and include the creation error in the message for visibility.
              try {
                const fs = await import("fs/promises");
                const path = await import("path");
                const migrationsDir = path.join(process.cwd(), "migrations");
                const entries = await fs.readdir(migrationsDir, { withFileTypes: true });
                const files = entries
                  .filter((e) => e.isFile())
                  .map((e) => e.name)
                  .sort()
                  .reverse();
                return createSuccessResponse({ data: files });
              } catch (fsErr) {
                return createErrorResponse({
                  message: `Error creating schema_migrations (${createErr instanceof Error ? createErr.message : String(createErr)}) and fallback failed: ${fsErr instanceof Error ? fsErr.message : String(fsErr)}`,
                });
              }
            }
          }

          // Default fallback: list migrations from local repo
          try {
            const fs = await import("fs/promises");
            const path = await import("path");
            const migrationsDir = path.join(process.cwd(), "migrations");
            const entries = await fs.readdir(migrationsDir, { withFileTypes: true });
            const files = entries
              .filter((e) => e.isFile())
              .map((e) => e.name)
              .sort()
              .reverse();
            return createSuccessResponse({ data: files });
          } catch (fsErr) {
            return createErrorResponse({
              message: `Error getting migrations from DB (${msg}) and fallback failed: ${fsErr instanceof Error ? fsErr.message : String(fsErr)}`,
            });
          }
        }

        return createErrorResponse({
          message: `Error getting migrations: ${error.message}`,
        });
      }

      return createSuccessResponse({ data: migrations });
    } catch (error) {
      return createErrorResponse({
        message: `Error listing migrations: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  },
};
