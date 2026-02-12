import { z } from "zod";
import { createErrorResponse, createSuccessResponse } from "../../common";

export const getProjectUrlTool = {
  title: "Get Project URL",
  description: "Gets the API URL for the Supabase project.",
  inputSchema: z.object({}),
  handler: async () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!url) {
      return createErrorResponse(
        "Error: NEXT_PUBLIC_SUPABASE_URL not configured",
      );
    }
    return createSuccessResponse(url);
  },
};
