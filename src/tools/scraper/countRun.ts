import { z } from "zod";
import { createErrorResponse } from "@/lib/common";
import { getClient } from "@/lib/common/supabaseClients";
import util from "util";

function formatError(e: unknown): string {
  if (e == null) return String(e);
  if (typeof e === "string") return e;
  if (e instanceof Error) return e.message || String(e);
  try {
    return JSON.stringify(e, Object.getOwnPropertyNames(e), 2);
  } catch {
    try {
      return util.inspect(e, { depth: 6 });
    } catch {
      return String(e);
    }
  }
}

export const countRunTool = {
  title: "count-run",
  description:
    "Count pages and images inserted during a scrape job time window.",
  inputSchema: z.object({ jobId: z.string() }),
  handler: async ({ jobId }: { jobId: string }) => {
    try {
      const { client: supabase } = getClient();
      if (!supabase)
        return createErrorResponse("Supabase client not configured");

      const { data: job, error: jobErr } = await supabase
        .from("scrape_jobs")
        .select("started_at, finished_at")
        .eq("id", jobId)
        .limit(1)
        .maybeSingle();

      if (jobErr) return createErrorResponse(formatError(jobErr));
      if (!job) return createErrorResponse(`No job found with id=${jobId}`);

      const started = job.started_at as string | null;
      const finished = job.finished_at as string | null;
      if (!started)
        return createErrorResponse("Job has no started_at timestamp");
      if (!finished)
        return createErrorResponse("Job has no finished_at timestamp");

      const { count: pagesCount, error: pagesErr } = await supabase
        .from("pages")
        .select("id", { count: "exact", head: true })
        .gte("scraped_at", started)
        .lte("scraped_at", finished);

      if (pagesErr) return createErrorResponse(formatError(pagesErr));

      // Get page ids inserted in window to count linked images
      const { data: pagesData, error: pagesDataErr } = await supabase
        .from("pages")
        .select("id")
        .gte("scraped_at", started)
        .lte("scraped_at", finished);

      if (pagesDataErr) return createErrorResponse(formatError(pagesDataErr));

      const pageIds = Array.isArray(pagesData)
        ? pagesData.map((p) => p.id)
        : [];
      let imagesCount = 0;
      if (pageIds.length > 0) {
        const { count: imgsCount, error: imgsErr } = await supabase
          .from("images")
          .select("id", { count: "exact", head: true })
          .in("page_id", pageIds);
        if (imgsErr) return createErrorResponse(formatError(imgsErr));
        imagesCount = imgsCount ?? 0;
      }

      // Return JSON string so the MCP handler transmits it as text reliably
      const result = {
        jobId,
        window: { started, finished },
        pagesInserted: pagesCount ?? 0,
        imagesLinked: imagesCount,
      };

      // Return explicit envelope with JSON text to avoid any cross-module coercion issues
      const envelope = {
        content: [
          { type: "text" as const, text: JSON.stringify(result, null, 2) },
        ],
      };

      return envelope;
    } catch (e: unknown) {
      return createErrorResponse(formatError(e));
    }
  },
};
// helper removed — prefer calling `countRunTool.handler` through MCP
