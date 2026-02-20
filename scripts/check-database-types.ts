#!/usr/bin/env tsx
import { readFileSync, writeFileSync } from "fs";
import { join } from "path";

// This script regenerates `src/database.types.ts` in-memory and compares it
// with the on-disk file. Exit code 0 if identical, 1 if different.

function extractTableNames(): string[] {
  const schemaPath = join(process.cwd(), "src", "database.schema.ts");
  const content = readFileSync(schemaPath, "utf-8");

  const tablesStart = content.indexOf("Tables: {");
  if (tablesStart === -1) return [];

  let braceCount = 0;
  let endIndex = tablesStart + 9;
  for (let i = endIndex; i < content.length; i++) {
    if (content[i] === "{") braceCount++;
    if (content[i] === "}") {
      braceCount--;
      if (braceCount === -1) {
        endIndex = i;
        break;
      }
    }
  }

  const tablesContent = content.substring(tablesStart + 9, endIndex);
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

function mapTypeToZod(tsType: string): string {
  if (tsType.includes(" | null")) {
    const baseType = tsType.replace(" | null", "");
    return `${mapTypeToZod(baseType)}.nullable()`;
  }
  switch (tsType) {
    case "string":
      return "z.string()";
    case "number":
      return "z.number()";
    case "boolean":
      return "z.boolean()";
    default:
      return "z.any()";
  }
}

function parseTableRow(
  tableName: string,
  content: string,
): Record<string, string> {
  const tableRegex = new RegExp(
    `${tableName}:\\s*{([\\s\\S]*?)}\\s*},?\\s*(?=\\w+:|$)`,
    "i",
  );
  const tableMatch = content.match(tableRegex);
  if (!tableMatch) return {};
  const tableContent = tableMatch[1];
  const rowRegex = /Row:\s*{([^{}]*(?:{[^{}]*}[^{}]*)*)}/;
  const rowMatch = tableContent.match(rowRegex);
  if (!rowMatch) return {};
  const rowContent = rowMatch[1];
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

function generateZodSchema(tableName: string): string {
  const schemaPath = join(process.cwd(), "src", "database.schema.ts");
  const content = readFileSync(schemaPath, "utf-8");
  const fields = parseTableRow(tableName, content);
  if (Object.keys(fields).length === 0) {
    return `z.object({\n  id: z.number(),\n  // Could not parse table schema\n})`;
  }
  const fieldDefs = Object.entries(fields)
    .map(([field, type]) => `  ${field}: ${mapTypeToZod(type)},`)
    .join("\n");
  return `z.object({\n${fieldDefs}\n})`;
}

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
const schemasContent = `import { z } from 'zod';
import type { Database } from './database.schema';

// Auto-generated Zod schemas based on database.schema.ts

${schemas.join("\n\n")}

// Export inferred types
${types.join("\n")}

// Database type for reference
export type SupabaseDatabase = Database;
`;

const outputPath = join(process.cwd(), "src", "database.types.ts");
const current = readFileSync(outputPath, "utf-8");
if (current !== schemasContent) {
  console.error(
    "src/database.types.ts is out of date. Run 'npx tsx scripts/generate-database-types.ts' to regenerate.",
  );
  // Write a diagnostics file to help debugging
  const tmpDir = join(process.cwd(), "tmp");
  try {
    // ensure tmp directory exists
    await (async () => {
      const { mkdirSync } = await import("fs");
      mkdirSync(tmpDir, { recursive: true });
    })();
  } catch {
    // ignore
  }
  writeFileSync(
    join(process.cwd(), "tmp", "expected-database.types.ts"),
    schemasContent,
    "utf-8",
  );
  process.exit(1);
}

console.log("src/database.types.ts is up to date.");
