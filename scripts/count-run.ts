#!/usr/bin/env tsx
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";

const jobId = process.argv[2];
if (!jobId) {
  console.error("Usage: npx tsx scripts/count-run.ts <jobId>");
  process.exit(2);
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ACCESS_TOKEN;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Missing Supabase config in .env.local");
  process.exit(2);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function run() {
  const { data: jobData, error: jobErr } = await supabase
    .from("scrape_jobs")
    .select("started_at, finished_at")
    .eq("id", jobId)
    .limit(1)
    .maybeSingle();

  if (jobErr) {
    console.error("Failed to fetch job:", jobErr.message || jobErr);
    process.exit(2);
  }
  if (!jobData) {
    console.error("Job not found");
    process.exit(2);
  }

  const started = jobData.started_at;
  const finished = jobData.finished_at || new Date().toISOString();

  console.log(`Job ${jobId} window: ${started} -> ${finished}`);

  const { data: pages, error: pagesErr } = await supabase
    .from("pages")
    .select("id")
    .gte("scraped_at", started)
    .lte("scraped_at", finished);

  if (pagesErr) {
    console.error("Failed to fetch pages:", pagesErr.message || pagesErr);
    process.exit(2);
  }

  const pageIds = (pages || []).map((p: any) => p.id);
  console.log(`Pages inserted in window: ${pageIds.length}`);

  if (pageIds.length === 0) {
    console.log("Images inserted in window: 0 (no pages)");
    return;
  }

  const { count, error: imgErr } = await supabase
    .from("images")
    .select("id", { count: "exact", head: false })
    .in("page_id", pageIds);

  if (imgErr) {
    console.error("Failed to fetch images:", imgErr.message || imgErr);
    process.exit(2);
  }

  // Supabase returns data array; length is count
  console.log(`Images linked to those pages: ${(count as number) ?? (Array.isArray((count as any)) ? (count as any).length : "unknown")}`);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
