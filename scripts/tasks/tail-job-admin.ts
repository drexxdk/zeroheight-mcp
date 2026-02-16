import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

async function main() {
  const { getSupabaseAdminClient } = await import("../../src/utils/common");
  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    console.error("Admin supabase client not configured");
    process.exit(1);
  }
  const jobId = process.argv[2];
  if (!jobId) {
    console.error("Usage: npx tsx scripts/tasks/tail-job-admin.ts <taskId>");
    process.exit(2);
  }
  console.log("Fetching job via admin client:", jobId);
  const { data, error } = await supabase
    .from("tasks")
    .select("id, status, logs, started_at, finished_at")
    .eq("id", jobId)
    .maybeSingle();
  if (error) {
    console.error("Supabase error:", error);
    process.exit(1);
  }
  if (!data) {
    console.log("No job found with id=", jobId);
    return;
  }
  console.log(JSON.stringify(data, null, 2));
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
