import { z } from "zod";
import {
  createErrorResponse,
  createSuccessResponse,
  getSupabaseAdminClient,
} from "../../common";

export const cancelJobTool = {
  title: "cancel-job",
  description:
    "Cancel a queued or running job. Deletes queued rows or marks running jobs as canceled.",
  inputSchema: z.object({ jobId: z.string() }),
  handler: async ({ jobId }: { jobId: string }) => {
    try {
      const admin = getSupabaseAdminClient();
      if (!admin)
        return createErrorResponse("Supabase admin client not configured");

      // Fetch current status
      const { data, error } = await admin
        .from("scrape_jobs")
        .select("status")
        .eq("id", jobId)
        .limit(1)
        .maybeSingle();

      if (error) return createErrorResponse(error.message || String(error));
      if (!data) return createErrorResponse(`No job found with id=${jobId}`);

      const status = (data as { status?: string }).status || "";

      if (status === "queued") {
        // Safe fast-path: delete the queued row
        const { error: delErr } = await admin
          .from("scrape_jobs")
          .delete()
          .eq("id", jobId);
        if (delErr)
          return createErrorResponse(delErr.message || String(delErr));
        return createSuccessResponse({
          jobId,
          action: "deleted",
          previousStatus: status,
        });
      }

      if (status === "running") {
        // Mark running job as canceled so workers that check status can notice
        const { error: updErr } = await admin
          .from("scrape_jobs")
          .update({ status: "canceled", finished_at: new Date().toISOString() })
          .eq("id", jobId);
        if (updErr)
          return createErrorResponse(updErr.message || String(updErr));
        return createSuccessResponse({
          jobId,
          action: "marked_canceled",
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
