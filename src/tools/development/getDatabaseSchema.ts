import { z } from "zod";
import { readFileSync } from "fs";
import { join } from "path";
import { createErrorResponse } from "@/utils/toolResponses";
import type { ToolDefinition } from "@/tools/toolTypes";

export type DatabaseSchemaResult = { content: string };

const dbSchemaInput = z.object({});

export const getDatabaseSchemaTool: ToolDefinition<
  typeof dbSchemaInput,
  DatabaseSchemaResult | ReturnType<typeof createErrorResponse>
> = {
  title: "DEVELOPMENT_get-database-schema",
  description:
    "Retrieve TypeScript type definitions for the complete database schema.",
  inputSchema: dbSchemaInput,
  outputSchema: z.object({ content: z.string() }),
  handler: async () => {
    try {
      // Read the database schema file
      const schemaPath = join(process.cwd(), "database.schema.ts");
      const schemaContent = readFileSync(schemaPath, "utf-8");

      return { content: schemaContent };
    } catch (error) {
      return createErrorResponse({
        message: `Error reading database schema file: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  },
};
