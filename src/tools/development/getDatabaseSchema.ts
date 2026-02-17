import { z } from "zod";
import { readFileSync } from "fs";
import { join } from "path";
import {
  createErrorResponse,
  createSuccessResponse,
} from "@/utils/toolResponses";

export const generateTypescriptTypesTool = {
  title: "DEVELOPMENT_get-database-schema",
  description:
    "Retrieve TypeScript type definitions for the complete database schema.",
  inputSchema: z.object({}),
  handler: async () => {
    try {
      // Read the database schema file
      const schemaPath = join(process.cwd(), "database.schema.ts");
      const schemaContent = readFileSync(schemaPath, "utf-8");

      return createSuccessResponse({ data: schemaContent });
    } catch (error) {
      return createErrorResponse({
        message: `Error reading database schema file: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  },
};
