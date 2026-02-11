import { z } from "zod";
import { getSupabaseClient, createErrorResponse, createSuccessResponse } from "../common";
import { mapSqlTypeToTs } from "../common";

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
      // Get table information using untyped client
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const untypedClient = client as any;
      const { data: tables, error: tablesError } = await untypedClient
        .from('information_schema.tables')
        .select('table_name')
        .eq('table_schema', 'public');

      if (tablesError) {
        return createErrorResponse(`Error getting tables: ${tablesError.message}`);
      }

      let types = 'export interface Database {\n  public: {\n    Tables: {\n';

      for (const table of tables || []) {
        const { data: columns, error: columnsError } = await untypedClient
          .from('information_schema.columns')
          .select('column_name, data_type, is_nullable')
          .eq('table_schema', 'public')
          .eq('table_name', table.table_name)
          .order('ordinal_position');

        if (columnsError) continue;

        types += `      ${table.table_name}: {\n        Row: {\n`;
        for (const col of columns || []) {
          const nullable = col.is_nullable === 'YES' ? ' | null' : '';
          types += `          ${col.column_name}: ${mapSqlTypeToTs(col.data_type)}${nullable};\n`;
        }
        types += `        }\n        Insert: {\n`;
        // Simplified - same as Row for now
        for (const col of columns || []) {
          const nullable = col.is_nullable === 'YES' ? ' | null' : '';
          types += `          ${col.column_name}: ${mapSqlTypeToTs(col.data_type)}${nullable};\n`;
        }
        types += `        }\n        Update: {\n`;
        for (const col of columns || []) {
          types += `          ${col.column_name}?: ${mapSqlTypeToTs(col.data_type)} | null;\n`;
        }
        types += `        }\n      }\n`;
      }

      types += '    }\n  }\n}\n';

      return createSuccessResponse(types);
    } catch (error) {
      return createErrorResponse(`Error generating types: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
};

export const getProjectUrlTool = {
  title: "Get Project URL",
  description: "Gets the API URL for the Supabase project.",
  inputSchema: z.object({}),
  handler: async () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!url) {
      return createErrorResponse("Error: NEXT_PUBLIC_SUPABASE_URL not configured");
    }
    return createSuccessResponse(url);
  }
};

export const getPublishableKeysTool = {
  title: "Get Publishable API Keys",
  description: "Gets all publishable API keys for the project.",
  inputSchema: z.object({}),
  handler: async () => {
    // This would require API calls to Supabase management API
    // For security, we'll return a message about checking environment variables
    return createErrorResponse("API keys are configured via environment variables. Check NEXT_PUBLIC_SUPABASE_URL and SUPABASE_ACCESS_TOKEN in your .env.local file.");
  }
};