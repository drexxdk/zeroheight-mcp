import { createErrorResponse, createSuccessResponse } from "../../common";
import { getClient } from "../../common/supabaseClients";
import { performBucketClear } from "../../image-utils";

async function clearZeroheightData() {
  try {
    console.log("Clearing existing Zeroheight data...");

    const { client: supabase, storage } = getClient();

    console.log("Supabase client available:", !!supabase);
    console.log("Admin-capable storage available:", !!storage.listBuckets);

    if (supabase) {
      const imagesTable = "images" as const;
      const pagesTable = "pages" as const;
      // Clear images table
      console.log("Clearing images table...");
      const { error: imagesError } = await supabase
        .from(imagesTable)
        .delete()
        .neq("id", 0); // Delete all rows

      if (imagesError) {
        console.error("Error clearing images table:", imagesError);
        return createErrorResponse(
          "Error clearing images table: " + imagesError.message,
        );
      } else {
        console.log("Images table cleared");
      }

      // Clear pages table
      console.log("Clearing pages table...");
      const { error: pagesError } = await supabase
        .from(pagesTable)
        .delete()
        .neq("id", 0); // Delete all rows

      if (pagesError) {
        console.error("Error clearing pages table:", pagesError);
        return createErrorResponse(
          "Error clearing pages table: " + pagesError.message,
        );
      } else {
        console.log("Pages table cleared");
      }

      // Clear finished/terminal scrape_jobs rows (completed, failed, cancelled)
      console.log(
        "Clearing terminal scrape_jobs rows (completed, failed, cancelled)...",
      );
      try {
        const { error: jobsError } = await supabase
          .from("scrape_jobs")
          .delete()
          .in("status", ["completed", "failed", "cancelled"]);
        if (jobsError) {
          console.error("Error clearing terminal scrape_jobs:", jobsError);
        } else {
          console.log("Terminal scrape_jobs rows cleared");
        }
      } catch (err) {
        console.error("Unexpected error while clearing scrape_jobs:", err);
      }

      // Clear storage bucket (use configured bucket name if provided)
      const bucketResult = await performBucketClear(supabase);

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
