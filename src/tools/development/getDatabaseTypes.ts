import { z } from "zod";
import { readFileSync } from "fs";
import { join } from "path";
import { createErrorResponse, createSuccessResponse } from "@/lib/common";

export const databaseTypesTool = {
  title: "get-database-types",
  description: "Retrieve TypeScript type definitions for the database schema.",
  inputSchema: z.object({}),
  handler: async () => {
    try {
      // Read the database schema file
      const schemaPath = join(process.cwd(), "lib", "database.types.ts");
      const schemaContent = readFileSync(schemaPath, "utf-8");

      return createSuccessResponse(schemaContent);
    } catch (error) {
      return createErrorResponse(
        `Error reading database schema file: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  },
};
