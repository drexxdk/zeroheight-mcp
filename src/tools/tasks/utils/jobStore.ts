import type { TasksType } from "@/database.types";
import type { Json } from "@/database.schema";
import { getSupabaseAdminClient } from "@/utils/common";
import {
  JOBID_RANDOM_START,
  JOBID_RANDOM_LEN,
  TESTRUNID_RANDOM_LEN,
} from "@/utils/config";

export type JobRecord = TasksType;

export async function createJobInDb(
  name: string,
  args?: Record<string, unknown> | null,
) {
  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    console.error("createJobInDb: admin supabase client not available");
    return null;
  }

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
    // SEP-1686: initial state should be `working` (the request is being processed)
    status: "working",
    args: (args ? (args as unknown as Json) : null) as Json | null,
  };

  try {
    const { error } = await supabase.from("tasks").insert([payload]);
    if (error) {
      const errObj = error as unknown;
      const details =
        errObj && typeof errObj === "object" && "details" in errObj
          ? String((errObj as Record<string, unknown>)["details"])
          : undefined;
      const hint =
        errObj && typeof errObj === "object" && "hint" in errObj
          ? String((errObj as Record<string, unknown>)["hint"])
          : undefined;
      const code =
        errObj && typeof errObj === "object" && "code" in errObj
          ? String((errObj as Record<string, unknown>)["code"])
          : undefined;
      console.error("createJobInDb supabase error:", {
        message: (error as { message?: string })?.message ?? String(error),
        details,
        hint,
        code,
      });
      return null;
    }
    // ignore returned row data; we use our generated `id` value as the job id
  } catch (e) {
    console.error("createJobInDb unexpected error:", String(e));
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
  const id = await createJobInDb(name, merged);
  if (!id) {
    console.error(
      "createTestJobInDb: failed to create job in DB (createJobInDb returned null)",
    );
  }
  return id;
}

export async function claimNextJob(): Promise<JobRecord | null> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return null;

  try {
    const { data: rows, error } = await supabase
      .from("tasks")
      .select("*")
      // pick next task that is in the SEP 'working' state but hasn't started yet
      .eq("status", "working")
      .order("created_at", { ascending: true })
      .limit(1);
    if (error || !rows || rows.length === 0) return null;
    const job = rows[0] as JobRecord;
    const { error: updErr } = await supabase
      .from("tasks")
      .update({ started_at: new Date().toISOString() })
      .eq("id", job.id);
    if (updErr) {
      console.error("claimNextJob update error:", updErr);
      return null;
    }
    return {
      ...(job as JobRecord),
      // maintain SEP `working` status; mark started_at locally
      status: "working",
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
      .from("tasks")
      // set started_at when claiming a specific job; keep SEP `working` status
      .update({ started_at: new Date().toISOString() })
      .eq("id", jobId)
      .eq("status", "working")
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
      .from("tasks")
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
      .from("tasks")
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
  result?: unknown,
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
  if (typeof result !== "undefined") payload.result = result;

  try {
    const { data: existingData, error: readError } = await supabase
      .from("tasks")
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
      .from("tasks")
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
      .from("tasks")
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
    const { error } = await supabase.from("tasks").delete().eq("id", jobId);
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
      .from("tasks")
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
      .from("tasks")
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
