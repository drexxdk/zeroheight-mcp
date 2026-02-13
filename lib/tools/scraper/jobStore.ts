import { getSupabaseAdminClient } from "../../common";
import type { Scrape_jobsType } from "../../database.types";
import type { Json } from "../../database.schema";

export type JobRecord = Scrape_jobsType;

const table = "scrape_jobs" as const;

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export async function createJobInDb(
  name: string,
  args?: Record<string, unknown>,
) {
  const id = genId();
  const supabase = getSupabaseAdminClient();
  if (!supabase) throw new Error("Supabase admin client not configured");
  const payloadArgs: Json | null = args
    ? (JSON.parse(JSON.stringify(args)) as Json)
    : null;
  const { error } = await supabase
    .from(table)
    .insert([{ id, name, status: "queued", args: payloadArgs }]);
  if (error) throw error;
  return id;
}

export async function claimNextJob(): Promise<JobRecord | null> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) throw new Error("Supabase admin client not configured");
  // Attempt to find a queued job and mark it running (simple optimistic flow)
  const { data: rows, error } = await supabase
    .from(table)
    .select("*")
    .eq("status", "queued")
    .order("created_at", { ascending: true })
    .limit(1);

  if (error) throw error;
  if (!rows || rows.length === 0) return null;

  const job = (rows as JobRecord[])[0];

  const { error: updErr } = await supabase
    .from(table)
    .update({ status: "running", started_at: new Date().toISOString() })
    .eq("id", job.id);
  if (updErr) throw updErr;
  return { ...job, status: "running", started_at: new Date().toISOString() };
}

export async function appendJobLog(jobId: string, line: string) {
  const supabase = getSupabaseAdminClient();
  if (!supabase) throw new Error("Supabase admin client not configured");
  // Read current logs and append
  const { data, error } = await supabase
    .from(table)
    .select("logs")
    .eq("id", jobId)
    .single();
  if (error) throw error;
  const current = (data && (data as JobRecord).logs) || "";
  const updated = current + (current ? "\n" : "") + line;
  const { error: updateErr } = await supabase
    .from(table)
    .update({ logs: updated })
    .eq("id", jobId);
  if (updateErr) throw updateErr;
}

export async function finishJob(
  jobId: string,
  success: boolean,
  errorMsg?: string,
) {
  const supabase = getSupabaseAdminClient();
  if (!supabase) throw new Error("Supabase admin client not configured");
  const payload: Record<string, unknown> = {
    finished_at: new Date().toISOString(),
    status: success ? "completed" : "failed",
  };
  if (errorMsg) (payload as Record<string, unknown>)["error"] = errorMsg;

  const { error } = await supabase.from(table).update(payload).eq("id", jobId);
  if (error) throw error;
}

export async function getJobFromDb(jobId: string) {
  const supabase = getSupabaseAdminClient();
  if (!supabase) throw new Error("Supabase admin client not configured");
  const { data, error } = await supabase
    .from(table)
    .select("*")
    .eq("id", jobId)
    .single();
  if (error) return null;
  return data as JobRecord;
}
