import { z } from "zod";
import { readFileSync } from "fs";
import { join } from "path";
import { createErrorResponse } from "@/utils/toolResponses";
import type { ToolDefinition } from "@/tools/toolTypes";

export type DatabaseTypesResult = {
  content: string;
};

const dbTypesInput = z.object({});

export const getDatabaseTypesTool: ToolDefinition<
  typeof dbTypesInput,
  DatabaseTypesResult | ReturnType<typeof createErrorResponse>
> = {
  title: "DEVELOPMENT_get-database-types",
  description: "Retrieve TypeScript type definitions for the database schema.",
  inputSchema: dbTypesInput,
  outputSchema: z.object({ content: z.string() }),
  handler: async () => {
    try {
      // Read the database schema file
      const schemaPath = join(
        process.cwd(),
        "src",
        "generated",
        "database-types.ts",
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
