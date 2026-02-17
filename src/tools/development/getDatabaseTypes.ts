import { z } from "zod";
import { readFileSync } from "fs";
import { join } from "path";
import {
  createErrorResponse,
  createSuccessResponse,
} from "@/utils/toolResponses";
import type { ToolDefinition } from "@/tools/toolTypes";

const dbTypesInput = z.object({});

export const databaseTypesTool: ToolDefinition<typeof dbTypesInput> = {
  title: "DEVELOPMENT_get-database-types",
  description: "Retrieve TypeScript type definitions for the database schema.",
  inputSchema: dbTypesInput,
  handler: async () => {
    try {
      // Read the database schema file
      const schemaPath = join(process.cwd(), "src", "database.types.ts");
      const schemaContent = readFileSync(schemaPath, "utf-8");

      return createSuccessResponse({ data: schemaContent });
    } catch (error) {
      return createErrorResponse({
        message: `Error reading database schema file: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  },
};
