import { z } from "zod";
import {
  getSupabaseClient,
  createErrorResponse,
  createSuccessResponse,
} from "../../common";
import { mapSqlTypeToTs } from "../../common";

// Map JavaScript values to TypeScript types
function mapJsTypeToTs(value: any): string {
  if (value === null || value === undefined) {
    return "null";
  }

  const type = typeof value;
  switch (type) {
    case "string":
      return "string";
    case "number":
      return "number";
    case "boolean":
      return "boolean";
    case "object":
      if (Array.isArray(value)) {
        return "any[]"; // Simplified
      }
      return "any"; // Simplified for objects
    default:
      return "any";
  }
}

export const generateTypescriptTypesTool = {
  title: "Generate TypeScript Types",
  description: "Generates TypeScript types for the database schema.",
  inputSchema: z.object({}),
  handler: async () => {
    const client = getSupabaseClient();
    if (!client) {
      return createErrorResponse("Error: Supabase client not configured");
    }

    try {
      // Use known tables from the database schema instead of querying information_schema
      const knownTables = ["pages", "images"];

      let types = "export interface Database {\n  public: {\n    Tables: {\n";

      // For each known table, get its column information
      for (const tableName of knownTables) {
        try {
          // Try to get a sample row to infer column types
          const { data: sampleData, error: sampleError } = await client!
            .from(tableName as "pages" | "images")
            .select("*")
            .limit(1);

          if (sampleError) {
            console.warn(`Could not get sample data for ${tableName}:`, sampleError);
            continue;
          }

          if (!sampleData || sampleData.length === 0) {
            // Table exists but is empty, use basic structure
            types += `      ${tableName}: {\n        Row: { id: number; }\n        Insert: { id?: number; }\n        Update: { id?: number; }\n      }\n`;
            continue;
          }

          const sampleRow = sampleData[0];
          const columns = Object.keys(sampleRow);

          types += `      ${tableName}: {\n        Row: {\n`;
          for (const col of columns) {
            const value = (sampleRow as any)[col];
            const tsType = mapJsTypeToTs(value);
            types += `          ${col}: ${tsType};\n`;
          }
          types += `        }\n        Insert: {\n`;
          for (const col of columns) {
            const value = (sampleRow as any)[col];
            const tsType = col === 'id' ? mapJsTypeToTs(value) + " | undefined" : mapJsTypeToTs(value);
            types += `          ${col}: ${tsType};\n`;
          }
          types += `        }\n        Update: {\n`;
          for (const col of columns) {
            const value = (sampleRow as any)[col];
            const tsType = mapJsTypeToTs(value) + " | undefined";
            types += `          ${col}: ${tsType};\n`;
          }
          types += `        }\n      }\n`;
        } catch (tableError) {
          console.warn(`Error processing table ${tableName}:`, tableError);
          continue;
        }
      }

      types += "    }\n  }\n}\n";

      return createSuccessResponse(types);
    } catch (error) {
      return createErrorResponse(
        `Error generating types: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  },
};
