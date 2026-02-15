import { readFileSync, writeFileSync } from "fs";
import { join } from "path";

// This script generates Zod schemas based on the generated lib/database.schema.ts
// Run with: npm run generate-database-types (which runs generate-database-schema first)

// Function to extract table names from the generated Database type
function extractTableNames(): string[] {
  const schemaPath = join(process.cwd(), "src", "lib", "database.schema.ts");
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
}

// Function to map TypeScript types to Zod validators
function mapTypeToZod(tsType: string): string {
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
}

// Function to parse Row type for a table
function parseTableRow(
  tableName: string,
  content: string,
): Record<string, string> {
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
  let match;
  while ((match = fieldRegex.exec(rowContent)) !== null) {
    const fieldName = match[1];
    const fieldType = match[2].trim();
    fields[fieldName] = fieldType;
  }

  return fields;
}

// Function to generate Zod schema for a table by parsing the Database type
function generateZodSchema(tableName: string): string {
  const schemaPath = join(process.cwd(), "src", "lib", "database.schema.ts");
  const content = readFileSync(schemaPath, "utf-8");

  const fields = parseTableRow(tableName, content);

  if (Object.keys(fields).length === 0) {
    // Fallback if parsing fails
    return `z.object({
  id: z.number(),
  // Could not parse table schema
})`;
  }

  // Generate Zod object
  const fieldDefs = Object.entries(fields)
    .map(([field, type]) => `  ${field}: ${mapTypeToZod(type)},`)
    .join("\n");

  return `z.object({\n${fieldDefs}\n})`;
}

// Generate schemas dynamically from extracted table names
function generateSchemasFromDatabase() {
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
}

const { schemas, types } = generateSchemasFromDatabase();

// Generate the schemas.ts content
const schemasContent = `import { z } from 'zod';
import type { Database } from './database.schema';

// Auto-generated Zod schemas based on database.schema.ts

${schemas.join("\n\n")}

// Export inferred types
${types.join("\n")}

// Database type for reference
export type SupabaseDatabase = Database;
`;

// Write to lib/schemas.ts
const outputPath = join(process.cwd(), "src", "lib", "database.types.ts");
writeFileSync(outputPath, schemasContent, "utf-8");

console.log(
  "Schemas and types generated dynamically from database.schema.ts! Written to lib/database.types.ts",
);
