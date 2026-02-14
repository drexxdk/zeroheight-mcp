import { z } from "zod";
import {
  createErrorResponse,
  createSuccessResponse,
  getSupabaseAdminClient,
} from "@/lib/common";
import { cancelJob as cancelInProcessJob } from "./jobManager";

export const cancelJobTool = {
  title: "cancel-job",
  description:
    "Cancel a queued or running job. Deletes queued rows or marks running jobs as canceled.",
  inputSchema: z.object({ jobId: z.string() }),
  handler: async ({ jobId }: { jobId: string }) => {
    try {
      const supabase = getSupabaseAdminClient();
      if (!supabase)
        return createErrorResponse("Supabase admin client not configured");

      // Fetch current status
      const { data, error } = await supabase
        .from("scrape_jobs")
        .select("status")
        .eq("id", jobId)
        .limit(1)
        .maybeSingle();

      if (error) return createErrorResponse(error.message || String(error));
      if (!data) {
        // If no DB row, try to cancel an in-process job manager job
        try {
          const inproc = cancelInProcessJob(jobId);
          if (inproc)
            return createSuccessResponse({
              jobId,
              action: "inprocess_cancelled",
            });
        } catch {
          // ignore
        }
        return createErrorResponse(`No job found with id=${jobId}`);
      }

      const status = (data as { status?: string }).status || "";

      if (status === "queued") {
        // Mark queued row as cancelled to preserve history
        const { error: updErr } = await supabase
          .from("scrape_jobs")
          .update({
            status: "cancelled",
            finished_at: new Date().toISOString(),
          })
          .eq("id", jobId);
        if (updErr)
          return createErrorResponse(updErr.message || String(updErr));
        // Also mark in-process job manager if present
        try {
          cancelInProcessJob(jobId);
        } catch {
          // ignore
        }
        return createSuccessResponse({
          jobId,
          action: "marked_cancelled",
          previousStatus: status,
        });
      }

      if (status === "running") {
        // Mark running job as cancelled in DB so external workers can see it
        const { error: updErr } = await supabase
          .from("scrape_jobs")
          .update({
            status: "cancelled",
            finished_at: new Date().toISOString(),
          })
          .eq("id", jobId);
        if (updErr)
          return createErrorResponse(updErr.message || String(updErr));
        // Signal in-process job manager
        try {
          cancelInProcessJob(jobId);
        } catch {
          // ignore
        }
        return createSuccessResponse({
          jobId,
          action: "marked_cancelled",
          previousStatus: status,
        });
      }

      // For other statuses, report informationally
      return createErrorResponse(
        `Cannot cancel job ${jobId} with status='${status}'`,
      );
    } catch (e: unknown) {
      return createErrorResponse(String(e instanceof Error ? e.message : e));
    }
  },
};
