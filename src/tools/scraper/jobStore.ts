import type { Scrape_jobsType } from "@/lib/database.types";
import type { Json } from "@/lib/database.schema";
import { getSupabaseAdminClient } from "@/lib/common";
import {
  JOBID_RANDOM_START,
  JOBID_RANDOM_LEN,
  TESTRUNID_RANDOM_LEN,
} from "@/lib/config";

export type JobRecord = Scrape_jobsType;

export async function createJobInDb(
  name: string,
  args?: Record<string, unknown> | null,
) {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return null;

  const id =
    Date.now().toString(36) +
    Math.random()
      .toString(36)
      .slice(JOBID_RANDOM_START, JOBID_RANDOM_START + JOBID_RANDOM_LEN);
  // Ensure `args` is compatible with the DB `Json` type expected by the
  // generated Supabase client types.
  const payload = {
    id,
    name,
    status: "queued",
    args: (args ? (args as unknown as Json) : null) as Json | null,
  };

  const { error } = await supabase.from("scrape_jobs").insert([payload]);
  if (error) {
    console.error("createJobInDb supabase error:", error);
    return null;
  }
  return id;
}

export async function createTestJobInDb(
  name: string,
  args?: Record<string, unknown> | null,
  testRunId = Date.now().toString(36) +
    Math.random()
      .toString(36)
      .slice(JOBID_RANDOM_START, JOBID_RANDOM_START + TESTRUNID_RANDOM_LEN),
) {
  const merged = { ...(args || {}), __testRunId: testRunId } as Record<
    string,
    unknown
  >;
  return createJobInDb(name, merged);
}

export async function claimNextJob(): Promise<JobRecord | null> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return null;

  try {
    const { data: rows, error } = await supabase
      .from("scrape_jobs")
      .select("*")
      .eq("status", "queued")
      .order("created_at", { ascending: true })
      .limit(1);
    if (error || !rows || rows.length === 0) return null;
    const job = rows[0] as JobRecord;
    const { error: updErr } = await supabase
      .from("scrape_jobs")
      .update({ status: "running", started_at: new Date().toISOString() })
      .eq("id", job.id);
    if (updErr) {
      console.error("claimNextJob update error:", updErr);
      return null;
    }
    return {
      ...(job as JobRecord),
      status: "running",
      started_at: new Date().toISOString(),
    } as JobRecord;
  } catch (e) {
    console.error("claimNextJob error:", e);
    return null;
  }
}

export async function claimJobById(jobId: string): Promise<JobRecord | null> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from("scrape_jobs")
      .update({ status: "running", started_at: new Date().toISOString() })
      .eq("id", jobId)
      .eq("status", "queued")
      .select()
      .maybeSingle();
    if (error || !data) return null;
    return { ...(data as JobRecord), status: "running" } as JobRecord;
  } catch (e) {
    console.error("claimJobById error:", e);
    return null;
  }
}

export async function appendJobLog(jobId: string, line: string) {
  if (!jobId) {
    console.warn("appendJobLog called with empty jobId - skipping");
    return;
  }
  const supabase = getSupabaseAdminClient();
  if (!supabase) return;
  try {
    const { data, error } = await supabase
      .from("scrape_jobs")
      .select("logs")
      .eq("id", jobId)
      .maybeSingle();
    if (error) {
      console.warn("appendJobLog select error:", error);
      return;
    }
    const current = (data && (data as { logs?: string }).logs) || "";
    const updated = current + (current ? "\n" : "") + line;
    const { error: updateErr } = await supabase
      .from("scrape_jobs")
      .update({ logs: updated })
      .eq("id", jobId);
    if (updateErr) console.warn("appendJobLog update error:", updateErr);
  } catch (e) {
    console.warn(`appendJobLog failed for jobId=${jobId}: ${String(e)}`);
  }
}

export async function finishJob(
  jobId: string,
  success: boolean,
  errorMsg?: string,
) {
  const body: Record<string, unknown> = { success };
  if (errorMsg) body.error = errorMsg;
  const supabase = getSupabaseAdminClient();
  if (!supabase) return;
  const payload: Record<string, unknown> = {
    finished_at: new Date().toISOString(),
    status: success ? "completed" : "failed",
  };
  if (errorMsg) payload.error = errorMsg;

  try {
    const { data: existingData, error: readError } = await supabase
      .from("scrape_jobs")
      .select("status")
      .eq("id", jobId)
      .maybeSingle();
    if (readError) {
      console.warn("finishJob read error:", readError);
      return;
    }
    if (
      existingData &&
      (existingData as { status?: string }).status === "cancelled"
    ) {
      return;
    }
    const { error } = await supabase
      .from("scrape_jobs")
      .update(payload)
      .eq("id", jobId);
    if (error) console.warn("finishJob update error:", error);
  } catch (e) {
    console.warn("finishJob failed:", e);
  }
}

export async function markJobCancelledInDb(jobId: string) {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return;
  try {
    const { error } = await supabase
      .from("scrape_jobs")
      .update({ status: "cancelled", finished_at: new Date().toISOString() })
      .eq("id", jobId);
    if (error) console.warn("markJobCancelledInDb error:", error);
  } catch (e) {
    console.warn("markJobCancelledInDb failed:", e);
  }
}

export async function deleteJobInDb(jobId: string) {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return;
  try {
    const { error } = await supabase
      .from("scrape_jobs")
      .delete()
      .eq("id", jobId);
    if (error) console.warn("deleteJobInDb error:", error);
  } catch (e) {
    console.warn("deleteJobInDb failed:", e);
  }
}

export async function deleteJobsByTestRun(testRunId: string) {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return;
  try {
    const { error } = await supabase
      .from("scrape_jobs")
      .delete()
      .contains("args", { __testRunId: testRunId });
    if (error) console.warn("deleteJobsByTestRun error:", error);
  } catch (e) {
    console.warn("deleteJobsByTestRun failed:", e);
  }
}

export async function getJobFromDb(jobId: string) {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from("scrape_jobs")
      .select("*")
      .eq("id", jobId)
      .maybeSingle();
    if (error) {
      console.error("getJobFromDb error:", error);
      return null;
    }
    return data as JobRecord | null;
  } catch (e) {
    console.error("getJobFromDb failed:", e);
    return null;
  }
}
