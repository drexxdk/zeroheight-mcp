import {
  createErrorResponse,
  createSuccessResponse,
} from "@/utils/toolResponses";
import { getClient } from "@/utils/common/supabaseClients";
import { getSupabaseAdminClient } from "@/utils/common";
import { performBucketClear } from "@/utils/image-utils";
import { MCP_API_KEY } from "@/utils/config";

async function clearDatabase() {
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
      return createErrorResponse({ message: errMsg });
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
        return createErrorResponse({
          message: "Error clearing images table: " + imagesError.message,
        });
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
        return createErrorResponse({
          message: "Error clearing pages table: " + pagesError.message,
        });
      } else {
        console.log(`Pages table cleared (${getRowCount(pagesData)} rows)`);
      }

      // Clear finished/terminal tasks rows (completed, failed, cancelled)
      console.log(
        "Clearing terminal tasks rows (completed, failed, cancelled)...",
      );
      try {
        const { data: jobsData, error: jobsError } = await adminClient
          .from("tasks")
          .delete()
          .in("status", ["completed", "failed", "cancelled"]);
        if (jobsError) {
          console.error("Error clearing terminal tasks:", jobsError);
        } else {
          console.log(
            `Terminal tasks rows cleared (${getRowCount(jobsData)} rows)`,
          );
        }
      } catch (err) {
        console.error("Unexpected error while clearing tasks:", err);
      }

      // Clear storage bucket (use configured bucket name if provided)

      const bucketResult = await performBucketClear({
        clientInstance: adminClient,
      });

      console.log("All Zeroheight data cleared successfully");
      return createSuccessResponse({
        data: {
          message: "Zeroheight data cleared successfully",
          bucket: bucketResult.bucket,
          foundCount: bucketResult.foundCount,
          foundFiles: bucketResult.foundFiles,
          availableBuckets: bucketResult.availableBuckets,
          deletedCount: bucketResult.deletedCount,
          deleteErrors: bucketResult.deleteErrors,
        },
      });
    } else {
      const errorMsg = "Supabase clients not available, cannot clear data";
      console.log(errorMsg);
      return createErrorResponse({ message: errorMsg });
    }
  } catch (error) {
    console.error("Error clearing Zeroheight data:", error);
    return createErrorResponse({
      message: "Error clearing Zeroheight data: " + (error as Error).message,
    });
  }
}

import { z } from "zod";

export const clearAllDataTool = {
  title: "clear-all-data",
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
    const expectedApiKey = MCP_API_KEY;
    if (!expectedApiKey) {
      return createErrorResponse({
        message: "MCP_API_KEY environment variable not configured",
      });
    }

    if (apiKey !== expectedApiKey) {
      return createErrorResponse({ message: "Invalid MCP API key provided" });
    }

    return await clearDatabase();
  },
};
