import {
  createErrorResponse,
  createSuccessResponse,
} from "@/lib/toolResponses";
import { getClient } from "@/lib/common/supabaseClients";
import { getSupabaseAdminClient } from "@/lib/common";
import { performBucketClear } from "@/lib/image-utils";

async function clearZeroheightData() {
  try {
    console.log("Clearing existing Zeroheight data...");

    const { client: supabase, storage } = getClient();
    const adminClient = getSupabaseAdminClient();

    console.log("Supabase client available:", !!supabase);
    console.log("Supabase admin client available:", !!adminClient);
    console.log("Admin-capable storage available:", !!storage.listBuckets);

    if (!adminClient) {
      const errMsg =
        "Supabase admin client (service role key) not configured - cannot perform destructive clear operations";
      console.error(errMsg);
      return createErrorResponse(errMsg);
    }

    if (supabase) {
      const imagesTable = "images" as const;
      const pagesTable = "pages" as const;
      const getRowCount = (d: unknown): number =>
        Array.isArray(d) ? d.length : 0;
      // Clear images table
      console.log("Clearing images table...");
      // Use admin client to bypass RLS for destructive operations
      const { data: imagesData, error: imagesError } = await adminClient
        .from(imagesTable)
        .delete()
        .neq("id", 0); // Delete all rows

      if (imagesError) {
        console.error("Error clearing images table:", imagesError);
        return createErrorResponse(
          "Error clearing images table: " + imagesError.message,
        );
      } else {
        console.log(`Images table cleared (${getRowCount(imagesData)} rows)`);
      }

      // Clear pages table
      console.log("Clearing pages table...");
      const { data: pagesData, error: pagesError } = await adminClient
        .from(pagesTable)
        .delete()
        .neq("id", 0); // Delete all rows

      if (pagesError) {
        console.error("Error clearing pages table:", pagesError);
        return createErrorResponse(
          "Error clearing pages table: " + pagesError.message,
        );
      } else {
        console.log(`Pages table cleared (${getRowCount(pagesData)} rows)`);
      }

      // Clear finished/terminal scrape_jobs rows (completed, failed, cancelled)
      console.log(
        "Clearing terminal scrape_jobs rows (completed, failed, cancelled)...",
      );
      try {
        const { data: jobsData, error: jobsError } = await adminClient
          .from("scrape_jobs")
          .delete()
          .in("status", ["completed", "failed", "cancelled"]);
        if (jobsError) {
          console.error("Error clearing terminal scrape_jobs:", jobsError);
        } else {
          console.log(
            `Terminal scrape_jobs rows cleared (${getRowCount(jobsData)} rows)`,
          );
        }
      } catch (err) {
        console.error("Unexpected error while clearing scrape_jobs:", err);
      }

      // Clear storage bucket (use configured bucket name if provided)
      const bucketResult = await performBucketClear(adminClient);

      console.log("All Zeroheight data cleared successfully");
      return createSuccessResponse({
        message: "Zeroheight data cleared successfully",
        bucket: bucketResult.bucket,
        foundCount: bucketResult.foundCount,
        foundFiles: bucketResult.foundFiles,
        availableBuckets: bucketResult.availableBuckets,
        deletedCount: bucketResult.deletedCount,
        deleteErrors: bucketResult.deleteErrors,
      });
    } else {
      const errorMsg = "Supabase clients not available, cannot clear data";
      console.log(errorMsg);
      return createErrorResponse(errorMsg);
    }
  } catch (error) {
    console.error("Error clearing Zeroheight data:", error);
    return createErrorResponse(
      "Error clearing Zeroheight data: " + (error as Error).message,
    );
  }
}

import { z } from "zod";

export const clearZeroheightDataTool = {
  title: "clear-zeroheight-data",
  description:
    "Clear all Zeroheight design system data from the database and storage bucket. This removes all pages and images. REQUIRES explicit MCP API key confirmation for safety.",
  inputSchema: z.object({
    apiKey: z
      .string()
      .describe(
        "MCP API key for authentication - required to confirm destructive action",
      ),
  }),
  handler: async ({ apiKey }: { apiKey: string }) => {
    // Validate API key
    const expectedApiKey = process.env.MCP_API_KEY;
    if (!expectedApiKey) {
      return createErrorResponse(
        "MCP_API_KEY environment variable not configured",
      );
    }

    if (apiKey !== expectedApiKey) {
      return createErrorResponse("Invalid MCP API key provided");
    }

    return await clearZeroheightData();
  },
};
