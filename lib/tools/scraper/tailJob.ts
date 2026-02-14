import { z } from "zod";
import { createErrorResponse, createSuccessResponse } from "../../common";
import { getClient } from "../../common/supabaseClients";

export const tailJobTool = {
  title: "tail-job",
  description: "Return job metadata and logs for a given jobId.",
  inputSchema: z.object({ jobId: z.string(), tail: z.number().optional() }),
  handler: async ({ jobId, tail }: { jobId: string; tail?: number }) => {
    try {
      const { client: supabase } = getClient();
      if (!supabase)
        return createErrorResponse("Supabase client not configured");

      const { data, error } = await supabase
        .from("scrape_jobs")
        .select("id, status, logs, started_at, finished_at")
        .eq("id", jobId)
        .limit(1)
        .maybeSingle();

      if (error) return createErrorResponse(error.message || String(error));
      if (!data) return createErrorResponse(`No job found with id=${jobId}`);

      // Optionally tail last N lines if client provided `tail`, naive split
      let logs = data.logs as string | null;
      if (typeof tail === "number" && logs) {
        const lines = logs.split(/\r?\n/);
        logs = lines.slice(-tail).join("\n");
      }

      return createSuccessResponse({
        id: data.id,
        status: data.status,
        started_at: data.started_at,
        finished_at: data.finished_at,
        logs,
      });
    } catch (e: unknown) {
      return createErrorResponse(String(e instanceof Error ? e.message : e));
    }
  },
};
