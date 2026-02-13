import { z } from "zod";
import { createErrorResponse, createSuccessResponse } from "../../common";
import { getClient } from "../../common/supabaseClients";
import { PageData } from "./shared";

// Get the Supabase project URL for constructing storage URLs
const getSupabaseProjectUrl = () => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) {
    console.warn("NEXT_PUBLIC_SUPABASE_URL not found, using fallback");
    return "https://qyoexslrsblaphbcvjdk.supabase.co";
  }
  return supabaseUrl;
};

export const queryZeroheightDataTool = {
  title: "query-zeroheight-data",
  description:
    "Query the cached Zeroheight design system data from the database. Supports searching by title, content, or URL, and can include image data with full Supabase storage URLs.",
  inputSchema: z.object({
    search: z
      .string()
      .optional()
      .describe("Search term to find in page titles or content"),
    url: z.string().optional().describe("Specific page URL to retrieve"),
    includeImages: z
      .boolean()
      .optional()
      .default(true)
      .describe("Whether to include image data in the response"),
    limit: z
      .number()
      .optional()
      .default(10)
      .describe("Maximum number of results to return"),
  }),
  handler: async ({
    search,
    url,
    includeImages,
    limit,
  }: {
    search?: string;
    url?: string;
    includeImages?: boolean;
    limit?: number;
  }) => {
    const { client } = getClient();
    if (!client) {
      return createErrorResponse("Error: Supabase client not configured");
    }

    // Set defaults
    const effectiveIncludeImages = includeImages ?? true;
    const effectiveLimit = limit ?? 10;

    let pages: PageData[] = [];

    const pagesTable = "pages" as const;

    if (search) {
      // Use separate queries to avoid complex OR conditions that can cause parsing issues
      const titleQuery = client
        .from(pagesTable)
        .select("id, title, url, content, images (original_url, storage_path)")
        .ilike("title", `%${search}%`);
      const contentQuery = client
        .from(pagesTable)
        .select("id, title, url, content, images (original_url, storage_path)")
        .ilike("content", `%${search}%`);

      const [titleResult, contentResult] = await Promise.all([
        titleQuery,
        contentQuery,
      ]);

      if (titleResult.error) {
        console.error("Error querying titles:", titleResult.error);
        return createErrorResponse(
          "Error querying data: " + titleResult.error.message,
        );
      }
      if (contentResult.error) {
        console.error("Error querying content:", contentResult.error);
        return createErrorResponse(
          "Error querying data: " + contentResult.error.message,
        );
      }

      // Combine and deduplicate results
      const allPages = [
        ...(titleResult.data || []),
        ...(contentResult.data || []),
      ];
      pages = allPages.filter(
        (page, index, self) =>
          index === self.findIndex((p) => p.id === page.id),
      );
    } else if (url) {
      // Query by URL
      const { data: urlPages, error: urlError } = await client
        .from(pagesTable)
        .select("id, title, url, content, images (original_url, storage_path)")
        .eq("url", url)
        .limit(effectiveLimit);

      if (urlError) {
        console.error("Error querying by URL:", urlError);
        return createErrorResponse("Error querying data: " + urlError.message);
      }

      pages = urlPages || [];
    } else {
      // Get all pages with limit
      const { data: allPages, error: allError } = await client
        .from(pagesTable)
        .select("id, title, url, content, images (original_url, storage_path)")
        .limit(effectiveLimit);

      if (allError) {
        console.error("Error querying all pages:", allError);
        return createErrorResponse("Error querying data: " + allError.message);
      }

      pages = allPages || [];
    }

    const result = pages.map((page) => {
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
                  `${supabaseUrl}/storage/v1/object/public/zeroheight-images/${img.storage_path}`,
                ]),
              )
            : {},
      };
    });

    return createSuccessResponse(result);
  },
};
