import { createClient } from "@supabase/supabase-js";
import type { Database } from './database.schema';

// Supabase client will be created when needed
let supabase: ReturnType<typeof createClient<Database>> | null = null;

export function getSupabaseClient(): ReturnType<typeof createClient<Database>> | null {
  if (!supabase) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_ACCESS_TOKEN; // Use anon key for regular operations
    if (supabaseUrl && supabaseKey) {
      supabase = createClient<Database>(supabaseUrl, supabaseKey);
    }
  }
  return supabase;
}

export function getSupabaseAdminClient(): ReturnType<typeof createClient<Database>> | null {
  // Use service role key only for admin operations like creating buckets
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (supabaseUrl && supabaseKey) {
    return createClient<Database>(supabaseUrl, supabaseKey);
  }
  return null;
}

// Common error response helper
export function createErrorResponse(message: string) {
  return {
    content: [{ type: "text" as const, text: message }],
  };
}

// Common success response helper
export function createSuccessResponse(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
  };
}

// Map SQL types to TypeScript types
export function mapSqlTypeToTs(sqlType: string): string {
  const typeMap: Record<string, string> = {
    'integer': 'number',
    'bigint': 'number',
    'smallint': 'number',
    'decimal': 'number',
    'numeric': 'number',
    'real': 'number',
    'double precision': 'number',
    'serial': 'number',
    'bigserial': 'number',
    'character varying': 'string',
    'varchar': 'string',
    'character': 'string',
    'char': 'string',
    'text': 'string',
    'boolean': 'boolean',
    'date': 'string',
    'time': 'string',
    'timestamp': 'string',
    'timestamp with time zone': 'string',
    'timestamp without time zone': 'string',
    'json': 'Record<string, unknown>',
    'jsonb': 'Record<string, unknown>',
    'uuid': 'string',
  };

  return typeMap[sqlType] || 'unknown';
}