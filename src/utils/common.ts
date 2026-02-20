import { createClient } from "@supabase/supabase-js";
import type { Database } from "../database.schema";
import { config } from "./config";

// Supabase client will be created when needed
let supabase: ReturnType<typeof createClient<Database>> | null = null;

export function getSupabaseClient(): ReturnType<
  typeof createClient<Database>
> | null {
  if (!supabase) {
    const supabaseUrl = config.env.nextPublicSupabaseUrl;
    const supabaseKey = config.env.supabaseAccessToken; // Use anon key for regular operations
    if (supabaseUrl && supabaseKey) {
      supabase = createClient<Database>(supabaseUrl, supabaseKey);
    }
  }
  return supabase;
}

export function getSupabaseAdminClient(): ReturnType<
  typeof createClient<Database>
> | null {
  // Use service role key only for admin operations like creating buckets
  const supabaseUrl = config.env.nextPublicSupabaseUrl;
  const supabaseKey = config.env.supabaseServiceRoleKey;
  if (supabaseUrl && supabaseKey) {
    return createClient<Database>(supabaseUrl, supabaseKey);
  }
  return null;
}

// Common error response helper
export { createErrorResponse, createSuccessResponse } from "./toolResponses";

// Map SQL types to TypeScript types
export function mapSqlTypeToTs({ sqlType }: { sqlType: string }): string {
  const typeMap: Record<string, string> = {
    integer: "number",
    bigint: "number",
    smallint: "number",
    decimal: "number",
    numeric: "number",
    real: "number",
    "double precision": "number",
    serial: "number",
    bigserial: "number",
    "character varying": "string",
    varchar: "string",
    character: "string",
    char: "string",
    text: "string",
    boolean: "boolean",
    date: "string",
    time: "string",
    timestamp: "string",
    "timestamp with time zone": "string",
    "timestamp without time zone": "string",
    json: "Record<string, unknown>",
    jsonb: "Record<string, unknown>",
    uuid: "string",
  };

  return typeMap[sqlType] || "unknown";
}
