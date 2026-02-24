import { z } from "zod";
import { createErrorResponse } from "@/utils/toolResponses";
import { getClient } from "@/utils/common/supabaseClients";
import { config } from "@/utils/config";
import defaultLogger from "@/utils/logger";
import { PageData } from "@/tools/scraper/utils/shared";
import type { ToolDefinition } from "@/tools/toolTypes";
import type { QueryDataResult } from "./types";

const queryDataInput = z.object({
  search: z
    .string()
    .optional()
    .describe("Search term to find in page titles or content"),
  searchInTitle: z
    .boolean()
    .optional()
    .default(true)
    .describe("Whether to search in page titles"),
  searchInContent: z
    .boolean()
    .optional()
    .default(true)
    .describe("Whether to search in page content"),
  url: z.string().optional().describe("Specific page URL to retrieve"),
  includeImages: z
    .boolean()
    .optional()
    .default(true)
    .describe("Whether to include image data in the response"),
  limit: z
    .number()
    .optional()
    .default(config.scraper.db.queryDefaultLimit)
    .describe("Maximum number of results to return"),
});

// Get the Supabase project URL for constructing storage URLs
const getSupabaseProjectUrl = (): string => {
  const supabaseUrl = config.env.nextPublicSupabaseUrl;
  if (!supabaseUrl) {
    defaultLogger.warn("NEXT_PUBLIC_SUPABASE_URL not found, using fallback");
    return "https://qyoexslrsblaphbcvjdk.supabase.co";
  }
  return supabaseUrl;
};

export const queryDataTool: ToolDefinition<
  typeof queryDataInput,
  QueryDataResult | ReturnType<typeof createErrorResponse>
> = {
  title: "query_data",
  description:
    "Query the cached Zeroheight data from the database. Supports searching by title/content (use `searchInTitle`/`searchInContent`), exact URL lookup, or listing; can include image data with full Supabase storage URLs.",
  inputSchema: queryDataInput,
  outputSchema: z.object({
    pages: z.array(
      z.object({
        url: z.string().nullable(),
        title: z.string().nullable(),
        content: z.string().nullable(),
        images: z.record(z.string(), z.string()),
      }),
    ),
  }),
  handler: async ({
    search,
    searchInTitle,
    searchInContent,
    url,
    includeImages,
    limit,
  }: z.infer<typeof queryDataInput>) => {
    const { client: supabase } = getClient();
    if (!supabase) {
      return createErrorResponse({
        message: "Error: Supabase client not configured",
      });
    }

    // Set defaults
    const effectiveIncludeImages = includeImages ?? true;
    const effectiveLimit = limit ?? config.scraper.db.queryDefaultLimit;

    let pages: PageData[] = [];

    if (search) {
      const runSearch = async (): Promise<null | ReturnType<
        typeof createErrorResponse
      >> => {
        const effectiveSearchInTitle = searchInTitle ?? true;
        const effectiveSearchInContent = searchInContent ?? true;

        if (!effectiveSearchInTitle && !effectiveSearchInContent) {
          return createErrorResponse({
            message:
              "When providing a search term, enable at least one of searchInTitle or searchInContent",
          });
        }

        // Execute title/content queries individually so types are inferred
        let titleResult: {
          data?: PageData[] | null;
          error?: { message: string } | null;
        } | null = null;
        let contentResult: {
          data?: PageData[] | null;
          error?: { message: string } | null;
        } | null = null;

        if (effectiveSearchInTitle) {
          titleResult = await supabase
            .from("pages")
            .select(
              "id, title, url, content, images (original_url, storage_path)",
            )
            .ilike("title", `%${search}%`);
          if (titleResult.error) {
            defaultLogger.error("Error querying titles:", titleResult.error);
            return createErrorResponse({
              message: "Error querying data: " + titleResult.error.message,
            });
          }
        }

        if (effectiveSearchInContent) {
          contentResult = await supabase
            .from("pages")
            .select(
              "id, title, url, content, images (original_url, storage_path)",
            )
            .ilike("content", `%${search}%`);
          if (contentResult.error) {
            defaultLogger.error("Error querying content:", contentResult.error);
            return createErrorResponse({
              message: "Error querying data: " + contentResult.error.message,
            });
          }
        }

        const allPages = [
          ...(titleResult?.data || []),
          ...(contentResult?.data || []),
        ];
        pages = allPages.filter(
          (page, index, self) =>
            index === self.findIndex((p) => p.id === page.id),
        );

        return null;
      };

      const searchErr = await runSearch();
      if (searchErr) return searchErr;
    } else if (url) {
      // Query by URL
      const { data: urlPages, error: urlError } = await supabase
        .from("pages")
        .select("id, title, url, content, images (original_url, storage_path)")
        .eq("url", url)
        .limit(effectiveLimit);

      if (urlError) {
        defaultLogger.error("Error querying by URL:", urlError);
        return createErrorResponse({
          message: "Error querying data: " + urlError.message,
        });
      }

      pages = urlPages || [];
    } else {
      // Get all pages with limit
      const { data: allPages, error: allError } = await supabase
        .from("pages")
        .select("id, title, url, content, images (original_url, storage_path)")
        .limit(effectiveLimit);

      if (allError) {
        defaultLogger.error("Error querying all pages:", allError);
        return createErrorResponse({
          message: "Error querying data: " + allError.message,
        });
      }

      pages = allPages || [];
    }

    const result = pages.map(
      (
        page,
      ): {
        url: string | null;
        title: string | null;
        content: string | null;
        images: Record<string, string>;
      } => {
        const supabaseUrl = getSupabaseProjectUrl();
        return {
          url: page.url,
          title: page.title,
          content: page.content,
          images:
            effectiveIncludeImages && page.images
              ? Object.fromEntries(
                  page.images.map((img) => [
                    img.original_url,
                    `${supabaseUrl}/storage/v1/object/public/${config.storage.imageBucket}/${img.storage_path}`,
                  ]),
                )
              : {},
        };
      },
    );

    // Return a domain-shaped result so callers can rely on typed output.
    const out: QueryDataResult = { pages: result };
    return out;
  },
};
