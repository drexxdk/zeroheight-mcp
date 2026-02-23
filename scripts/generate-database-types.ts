#!/usr/bin/env tsx
// Run with: npx tsx scripts/generate-database-types.ts
import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

// Move all logic into `main` so the script has a single entrypoint and can
// asynchronously import the project logger without triggering environment
// validation during module import.
async function main(): Promise<void> {
  // Function to extract table names from the generated Database type
  const extractTableNames = (): string[] => {
    const schemaPath = join(
      process.cwd(),
      "src",
      "generated",
      "database-schema.ts",
    );
    const content = readFileSync(schemaPath, "utf-8");

    // Find the Tables section
    const tablesStart = content.indexOf("Tables: {");
    if (tablesStart === -1) return [];

    // Find the end of Tables (look for the closing } at the same level)
    let braceCount = 0;
    let endIndex = tablesStart + 9; // after 'Tables: {'
    for (let i = endIndex; i < content.length; i++) {
      if (content[i] === "{") braceCount++;
      if (content[i] === "}") {
        braceCount--;
        if (braceCount === -1) {
          // back to the Tables level
          endIndex = i;
          break;
        }
      }
    }

    const tablesContent = content.substring(tablesStart + 9, endIndex);

    // Extract table names - look for top-level keys before ': {'
    const tableNames: string[] = [];
    const lines = tablesContent.split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith("//") && trimmed.includes(": {")) {
        const tableName = trimmed.split(":")[0].trim();
        if (
          tableName &&
          tableName !== "Row" &&
          tableName !== "Insert" &&
          tableName !== "Update"
        ) {
          tableNames.push(tableName);
        }
      }
    }

    return tableNames;
  };

  // Function to map TypeScript types to Zod validators
  const mapTypeToZod = (tsType: string): string => {
    // Handle nullable types
    if (tsType.includes(" | null")) {
      const baseType = tsType.replace(" | null", "");
      return `${mapTypeToZod(baseType)}.nullable()`;
    }

    // Basic type mappings
    switch (tsType) {
      case "string":
        return "z.string()";
      case "number":
        return "z.number()";
      case "boolean":
        return "z.boolean()";
      default:
        // For complex types, default to any
        return "z.any()";
    }
  };

  // Function to parse Row type for a table
  const parseTableRow = (
    tableName: string,
    content: string,
  ): Record<string, string> => {
    // Find the table section
    const tableRegex = new RegExp(
      `${tableName}:\\s*{([\\s\\S]*?)}\\s*},?\\s*(?=\\w+:|$)`,
      "i",
    );
    const tableMatch = content.match(tableRegex);
    if (!tableMatch) return {};

    const tableContent = tableMatch[1];

    // Find the Row section
    const rowRegex = /Row:\s*{([^{}]*(?:{[^{}]*}[^{}]*)*)}/;
    const rowMatch = tableContent.match(rowRegex);
    if (!rowMatch) return {};

    const rowContent = rowMatch[1];

    // Parse fields
    const fields: Record<string, string> = {};
    const fieldRegex = /(\w+):\s*([^;\n]+)/g;
    let match: RegExpExecArray | null;
    while ((match = fieldRegex.exec(rowContent)) !== null) {
      const fieldName = match[1];
      const fieldType = match[2].trim();
      fields[fieldName] = fieldType;
    }

    return fields;
  };

  // Function to generate Zod schema for a table by parsing the Database type
  const generateZodSchema = (tableName: string): string => {
    const schemaPath = join(
      process.cwd(),
      "src",
      "generated",
      "database-schema.ts",
    );
    const content = readFileSync(schemaPath, "utf-8");

    const fields = parseTableRow(tableName, content);

    if (Object.keys(fields).length === 0) {
      // Fallback if parsing fails
      return `z.object({\n  id: z.number(),\n  // Could not parse table schema\n})`;
    }

    // Generate Zod object
    const fieldDefs = Object.entries(fields)
      .map(([field, type]) => `  ${field}: ${mapTypeToZod(type)},`)
      .join("\n");

    return `z.object({\n${fieldDefs}\n})`;
  };

  // Generate schemas dynamically from extracted table names
  const generateSchemasFromDatabase = (): {
    schemas: string[];
    types: string[];
  } => {
    const tableNames = extractTableNames();
    const schemas: string[] = [];
    const types: string[] = [];

    tableNames.forEach((tableName) => {
      const schemaName = `public${tableName.charAt(0).toUpperCase() + tableName.slice(1)}Schema`;
      const typeName = `${tableName.charAt(0).toUpperCase() + tableName.slice(1)}Type`;

      schemas.push(
        `export const ${schemaName} = ${generateZodSchema(tableName)};`,
      );
      types.push(`export type ${typeName} = z.infer<typeof ${schemaName}>;`);
    });

    return { schemas, types };
  };

  try {
    const { schemas, types } = generateSchemasFromDatabase();

    // Generate the schemas.ts content
    const schemasContent = `import { z } from 'zod';\nimport type { Database } from './database-schema';\n\n// Auto-generated Zod schemas based on database-schema.ts\n\n${schemas.join("\n\n")}\n\n// Export inferred types\n${types.join("\n")}\n\n// Database type for reference\nexport type SupabaseDatabase = Database;\n`;

    // Write to src/database-types.ts
    const outputPath = join(
      process.cwd(),
      "src",
      "generated",
      "database-types.ts",
    );
    writeFileSync(outputPath, schemasContent, "utf-8");

    // Load logger asynchronously so this script can run even when importing
    // other src modules would trigger environment validation at import-time.
    const { default: logger } = await import("../src/utils/logger");
    logger.log(
      "Schemas and types generated dynamically from database-schema.ts! Written to src/database-types.ts",
    );
  } catch (err) {
    // Avoid depending on project logger when failing to generate
    try {
      process.stderr.write(
        `Failed to generate database types: ${String(err)}\n`,
      );
    } catch {
      /* swallow */
    }
    process.exitCode = 1;
  }
}

main();
