import { z } from "zod";
import { createErrorResponse, createSuccessResponse } from "../../common";
import { getClient } from "../../common/supabaseClients";

export const inspectJobTool = {
  title: "inspect-job",
  description:
    "Inspect a scrape job row by jobId and return its metadata and logs.",
  inputSchema: z.object({ jobId: z.string() }),
  handler: async ({ jobId }: { jobId: string }) => {
    try {
      const { client: supabase } = getClient();
      if (!supabase)
        return createErrorResponse("Supabase client not configured");

      const { data, error } = await supabase
        .from("scrape_jobs")
        .select("*")
        .eq("id", jobId)
        .limit(1)
        .maybeSingle();

      if (error) return createErrorResponse(error.message || String(error));
      if (!data) return createErrorResponse(`No job found with id=${jobId}`);

      return createSuccessResponse(data);
    } catch (e: unknown) {
      return createErrorResponse(String(e instanceof Error ? e.message : e));
    }
  },
};
