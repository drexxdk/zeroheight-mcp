#!/usr/bin/env tsx
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";

const jobId = process.argv[2];
if (!jobId) {
  console.error("Usage: npx tsx scripts/test-inspect-job.ts <jobId>");
  process.exit(2);
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ACCESS_TOKEN;

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
