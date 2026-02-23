import { createErrorResponse } from "@/utils/toolResponses";
import { getClient } from "@/utils/common/supabaseClients";
import { getSupabaseAdminClient } from "@/utils/common";
import { performBucketClear } from "@/utils/image-utils";
import { config } from "@/utils/config";
import defaultLogger from "@/utils/logger";
import { z } from "zod";
import { isRecord, getProp } from "@/utils/common/typeGuards";
import { toErrorObj } from "@/utils/common/errorUtils";
import type { ToolDefinition } from "@/tools/toolTypes";

export type ClearAllDataResult = {
  message: string;
  bucket?: string | null;
  // storage/bucket details
  storageFoundCount?: number; // number of files discovered in the bucket
  storageDeletedCount?: number; // number of files deleted from the bucket
  storageDeleteErrors?: Array<{ file?: string; error: string }>;
  // database row counts
  // database row counts
  // database row counts
  imagesDeletedRows?: number;
  pagesDeletedRows?: number;
  tasksDeletedRows?: number;
  tasksRemainingRows?: number;
};

async function clearDatabase(): Promise<
  ClearAllDataResult | ReturnType<typeof createErrorResponse>
> {
  try {
    defaultLogger.log("Clearing existing Zeroheight data...");

    const { client: supabase, storage } = getClient();
    const adminClient = getSupabaseAdminClient();

    defaultLogger.log("Supabase client available:", !!supabase);
    defaultLogger.log("Supabase admin client available:", !!adminClient);
    defaultLogger.log(
      "Admin-capable storage available:",
      !!storage?.listBuckets,
    );

    if (!adminClient) {
      const errMsg =
        "Supabase admin client (service role key) not configured - cannot perform destructive clear operations";
      defaultLogger.error(errMsg);
      return createErrorResponse({ message: errMsg });
    }

    if (supabase) {
      const getRowCount = (d: unknown): number =>
        Array.isArray(d) ? d.length : 0;

      // Clear images table
      defaultLogger.log("Clearing images table...");
      const { data: imagesData, error: imagesError } = await adminClient
        .from("images")
        .delete()
        .neq("id", 0);

      if (imagesError) {
        defaultLogger.error("Error clearing images table:", imagesError);
        return createErrorResponse({
          message: "Error clearing images table: " + imagesError.message,
        });
      } else {
        defaultLogger.log(
          `Images table cleared (${getRowCount(imagesData)} rows)`,
        );
      }

      const imagesDeletedRows = getRowCount(imagesData);

      // Clear pages table
      defaultLogger.log("Clearing pages table...");
      const { data: pagesData, error: pagesError } = await adminClient
        .from("pages")
        .delete()
        .neq("id", 0);

      if (pagesError) {
        defaultLogger.error("Error clearing pages table:", pagesError);
        return createErrorResponse({
          message: "Error clearing pages table: " + pagesError.message,
        });
      } else {
        defaultLogger.log(
          `Pages table cleared (${getRowCount(pagesData)} rows)`,
        );
      }

      const pagesDeletedRows = getRowCount(pagesData);

      // Clear finished/terminal tasks rows
      defaultLogger.log(
        "Clearing terminal tasks rows (completed, failed, cancelled)...",
      );
      let tasksDeletedRows = 0;
      try {
        const { data: jobsData, error: jobsError } = await adminClient
          .from("tasks")
          .delete()
          .in("status", ["completed", "failed", "cancelled"]);
        if (jobsError) {
          defaultLogger.error("Error clearing terminal tasks:", jobsError);
        } else {
          defaultLogger.log(
            `Terminal tasks rows cleared (${getRowCount(jobsData)} rows)`,
          );
          tasksDeletedRows = getRowCount(jobsData);
        }
      } catch (err) {
        defaultLogger.error("Unexpected error while clearing tasks:", err);
      }

      // Count remaining tasks (those not deleted)
      let tasksRemainingRows = 0;
      try {
        const countRes = await adminClient
          .from("tasks")
          .select("id", { count: "exact", head: false });
        if (countRes && Array.isArray(countRes.data)) {
          tasksRemainingRows = countRes.data.length;
        }
      } catch (err) {
        defaultLogger.error("Error counting remaining tasks:", err);
      }

      const bucketResult = await performBucketClear({
        clientInstance: adminClient,
      });

      defaultLogger.log("All Zeroheight data cleared successfully");
      return {
        message:
          "Zeroheight data cleared successfully (terminal tasks removed; non-terminal tasks retained)",
        bucket: bucketResult.bucket,
        storageFoundCount: bucketResult.foundCount,
        storageDeletedCount: bucketResult.deletedCount,
        storageDeleteErrors: Array.isArray(bucketResult.deleteErrors)
          ? bucketResult.deleteErrors.map((e) => {
              if (isRecord(e)) {
                const file =
                  typeof getProp(e, "file") === "string"
                    ? String(getProp(e, "file"))
                    : typeof getProp(e, "name") === "string"
                      ? String(getProp(e, "name"))
                      : undefined;
                const errVal = getProp(e, "error");
                const norm = toErrorObj(errVal);
                const errorMsg = norm?.message ?? String(errVal ?? "");
                return { file, error: errorMsg };
              }
              return { file: undefined, error: String(e) };
            })
          : undefined,
        imagesDeletedRows,
        pagesDeletedRows,
        tasksDeletedRows,
        tasksRemainingRows,
      };
    }

    const errorMsg = "Supabase clients not available, cannot clear data";
    defaultLogger.log(errorMsg);
    return createErrorResponse({ message: errorMsg });
  } catch (error) {
    defaultLogger.error("Error clearing Zeroheight data:", error);
    const msg = error instanceof Error ? error.message : String(error);
    return createErrorResponse({
      message: "Error clearing Zeroheight data: " + msg,
    });
  }
}

const clearAllDataInput = z.object({
  apiKey: z
    .string()
    .describe(
      "MCP API key for authentication - required to confirm destructive action",
    ),
});

export const clearAllDataTool: ToolDefinition<
  typeof clearAllDataInput,
  ClearAllDataResult | ReturnType<typeof createErrorResponse>
> = {
  title: "clear_all_data",
  description:
    "Clear all data from the database and storage bucket. This removes all pages and images. REQUIRES explicit MCP API key confirmation for safety.",
  inputSchema: clearAllDataInput,
  outputSchema: z.object({
    message: z.string(),
    bucket: z.string().nullable().optional(),
    storageFoundCount: z.number().optional(),
    storageDeletedCount: z.number().optional(),
    storageDeleteErrors: z
      .array(z.object({ file: z.string().optional(), error: z.string() }))
      .optional(),
    imagesDeletedRows: z.number().optional(),
    pagesDeletedRows: z.number().optional(),
    tasksDeletedRows: z.number().optional(),
    tasksRemainingRows: z.number().optional(),
  }),
  handler: async ({ apiKey }: z.infer<typeof clearAllDataInput>) => {
    const expectedApiKey = config.env.zeroheightMcpAccessToken;
    if (!expectedApiKey) {
      return createErrorResponse({
        message:
          "ZEROHEIGHT_MCP_ACCESS_TOKEN environment variable not configured",
      });
    }

    if (apiKey !== expectedApiKey) {
      return createErrorResponse({ message: "Invalid MCP API key provided" });
    }

    return await clearDatabase();
  },
};
