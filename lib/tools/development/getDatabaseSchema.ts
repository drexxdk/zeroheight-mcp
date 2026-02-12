import { z } from "zod";
import { readFileSync } from "fs";
import { join } from "path";
import { createErrorResponse, createSuccessResponse } from "../../common";

export const generateTypescriptTypesTool = {
  title: "Get Database Schema",
  description:
    "Returns the TypeScript database schema types from the database.schema.ts file.",
  inputSchema: z.object({}),
  handler: async () => {
    try {
      // Read the database schema file
      const schemaPath = join(process.cwd(), "lib", "database.schema.ts");
      const schemaContent = readFileSync(schemaPath, "utf-8");

      return createSuccessResponse(schemaContent);
    } catch (error) {
      return createErrorResponse(
        `Error reading database schema file: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  },
};
