#!/usr/bin/env tsx
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";
import {
  NEXT_PUBLIC_SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  SUPABASE_ACCESS_TOKEN,
} from "@/lib/config";

const jobId = process.argv[2];
if (!jobId) {
  console.error("Usage: npx tsx src/e2e/jobs-inspect-job.test.ts <jobId>");
  process.exit(2);
}

const SUPABASE_URL = NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ACCESS_TOKEN;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Missing Supabase config in .env.local");
  process.exit(2);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function inspect() {
  const { data, error } = await supabase
    .from("scrape_jobs")
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
