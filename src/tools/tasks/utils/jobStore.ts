import type { TasksType } from "@/database.types";
import type { Json } from "@/database.schema";
import { getSupabaseAdminClient } from "@/utils/common";
import { config } from "@/utils/config";
import { isRecord, isJson, getProp } from "../../../utils/common/typeGuards";
import logger from "@/utils/logger";

export type JobRecord = TasksType;

export async function createJobInDb({
  name,
  args,
}: {
  name: string;
  args?: Record<string, unknown> | null;
}): Promise<string | null> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    logger.error("createJobInDb: admin supabase client not available");
    return null;
  }

  const id =
    Date.now().toString(36) +
    Math.random()
      .toString(36)
      .slice(
        config.hashing.jobIdRandomStart,
        config.hashing.jobIdRandomStart + config.hashing.jobIdRandomLen,
      );
  // Ensure `args` is JSON-serializable and compatible with the DB `Json` type.
  let argsPayload: Json | null = null;
  if (args) {
    try {
      const parsed = JSON.parse(JSON.stringify(args));
      // Validate JSON-serializability before assigning to `Json`.
      // Use the runtime guard to avoid an unchecked `as Json` cast.
      // If it isn't serializable, fall back to `null`.
      if (isJson(parsed)) argsPayload = parsed;
      else argsPayload = null;
    } catch {
      argsPayload = null;
    }
  }
  const payload = {
    id,
    name,
    // SEP-1686: initial state should be `working` (the request is being processed)
    status: "working",
    args: argsPayload,
  };

  try {
    const { error } = await supabase.from("tasks").insert([payload]);
    if (error) {
      const errObj = error;
      const details =
        isRecord(errObj) && "details" in errObj
          ? String(errObj["details"])
          : undefined;
      const hint =
        isRecord(errObj) && "hint" in errObj
          ? String(errObj["hint"])
          : undefined;
      const code =
        isRecord(errObj) && "code" in errObj
          ? String(errObj["code"])
          : undefined;
      let msg: string;
      if (isRecord(errObj) && typeof getProp(errObj, "message") === "string") {
        msg = String(getProp(errObj, "message"));
      } else {
        msg = String(error);
      }
      logger.error("createJobInDb supabase error:", {
        message: msg,
        details,
        hint,
        code,
      });
      return null;
    }
    // ignore returned row data; we use our generated `id` value as the job id
  } catch (e) {
    logger.error("createJobInDb unexpected error:", String(e));
    return null;
  }
  return id;
}

export async function createTestJobInDb({
  name,
  args,
  testRunId = Date.now().toString(36) +
    Math.random()
      .toString(36)
      .slice(
        config.hashing.jobIdRandomStart,
        config.hashing.jobIdRandomStart + config.hashing.testRunIdRandomLen,
      ),
}: {
  name: string;
  args?: Record<string, unknown> | null;
  testRunId?: string;
}): Promise<string | null> {
  const merged: Record<string, unknown> = {
    ...(args || {}),
    __testRunId: testRunId,
  };
  const id = await createJobInDb({ name, args: merged });
  if (!id) {
    logger.error(
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
      logger.error("claimNextJob update error:", updErr);
      return null;
    }
    return {
      ...(job as JobRecord),
      // maintain SEP `working` status; mark started_at locally
      status: "working",
      started_at: new Date().toISOString(),
    } as JobRecord;
  } catch (e) {
    logger.error("claimNextJob error:", e);
    return null;
  }
}

export async function claimJobById({
  jobId,
}: {
  jobId: string;
}): Promise<JobRecord | null> {
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
    logger.error("claimJobById error:", e);
    return null;
  }
}

export async function appendJobLog({
  jobId,
  line,
}: {
  jobId: string;
  line: string;
}): Promise<void> {
  if (!jobId) {
    logger.warn("appendJobLog called with empty jobId - skipping");
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
      logger.warn("appendJobLog select error:", error);
      return;
    }
    let current = "";
    if (data && isRecord(data) && typeof getProp(data, "logs") === "string") {
      current = String(getProp(data, "logs"));
    }
    const updated = current + (current ? "\n" : "") + line;
    const { error: updateErr } = await supabase
      .from("tasks")
      .update({ logs: updated })
      .eq("id", jobId);
    if (updateErr) logger.warn("appendJobLog update error:", updateErr);
  } catch (e) {
    logger.warn(`appendJobLog failed for jobId=${jobId}: ${String(e)}`);
  }
}

export async function finishJob({
  jobId,
  success,
  result,
  errorMsg,
}: {
  jobId: string;
  success: boolean;
  result?: unknown;
  errorMsg?: string;
}): Promise<void> {
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
      logger.warn("finishJob read error:", readError);
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
    if (error) logger.warn("finishJob update error:", error);
  } catch (e) {
    logger.warn("finishJob failed:", e);
  }
}

export async function markJobCancelledInDb({
  jobId,
}: {
  jobId: string;
}): Promise<void> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return;
  try {
    const { error } = await supabase
      .from("tasks")
      .update({ status: "cancelled", finished_at: new Date().toISOString() })
      .eq("id", jobId);
    if (error) logger.warn("markJobCancelledInDb error:", error);
  } catch (e) {
    logger.warn("markJobCancelledInDb failed:", e);
  }
}

export async function deleteJobInDb({
  jobId,
}: {
  jobId: string;
}): Promise<void> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return;
  try {
    const { error } = await supabase.from("tasks").delete().eq("id", jobId);
    if (error) logger.warn("deleteJobInDb error:", error);
  } catch (e) {
    logger.warn("deleteJobInDb failed:", e);
  }
}

export async function deleteJobsByTestRun({
  testRunId,
}: {
  testRunId: string;
}): Promise<void> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return;
  try {
    const { error } = await supabase
      .from("tasks")
      .delete()
      .contains("args", { __testRunId: testRunId });
    if (error) logger.warn("deleteJobsByTestRun error:", error);
  } catch (e) {
    logger.warn("deleteJobsByTestRun failed:", e);
  }
}

export async function getJobFromDb({
  jobId,
}: {
  jobId: string;
}): Promise<JobRecord | null> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from("tasks")
      .select("*")
      .eq("id", jobId)
      .maybeSingle();
    if (error) {
      logger.error("getJobFromDb error:", error);
      return null;
    }
    return data as JobRecord | null;
  } catch (e) {
    logger.error("getJobFromDb failed:", e);
    return null;
  }
}
