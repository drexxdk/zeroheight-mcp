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
  title: "get_database_schema",
  description:
    "Retrieve TypeScript type definitions for the complete database schema.",
  inputSchema: dbSchemaInput,
  outputSchema: z.union([
    z.object({ content: z.string() }),
    // Allow returning a ToolResponse (error shape) from handler
    z.object({
      content: z.array(z.object({ type: z.literal("text"), text: z.string() })),
    }),
  ]),
  handler: async () => {
    try {
      // Read the database schema file
      const schemaPath = join(
        process.cwd(),
        "src",
        "generated",
        "database-schema.ts",
      );
      const schemaContent = readFileSync(schemaPath, "utf-8");

      return { content: schemaContent };
    } catch (error) {
      return createErrorResponse({
        message: `Error reading database schema file: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  },
};
