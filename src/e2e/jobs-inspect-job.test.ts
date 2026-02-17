#!/usr/bin/env tsx
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";

const jobId = process.argv[2];
if (!jobId) {
  console.error("Usage: npx tsx src/e2e/jobs-inspect-job.test.ts <jobId>");
  process.exit(2);
}

let supabase: ReturnType<typeof createClient> | null = null;

async function ensureClient() {
  if (supabase) return supabase;
  const cfg = await import("@/utils/config");
  const SUPABASE_URL = cfg.NEXT_PUBLIC_SUPABASE_URL;
  const SUPABASE_KEY =
    cfg.SUPABASE_SERVICE_ROLE_KEY || cfg.SUPABASE_ACCESS_TOKEN;
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error("Missing Supabase config in .env.local");
    process.exit(2);
  }
  supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  return supabase;
}

async function inspect() {
  const sb = await ensureClient();
  const { data, error } = await sb
    .from("tasks")
    .select("*")
    .eq("id", jobId)
    .limit(1);

  if (error) {
    console.error("Supabase error:", error.message || error);
    process.exit(2);
  }

  if (!data || data.length === 0) {
    console.log(`No job found with id=${jobId}`);
    return;
  }

  console.log(JSON.stringify(data[0], null, 2));
}

inspect().catch((e) => {
  console.error(e);
  process.exit(1);
});
