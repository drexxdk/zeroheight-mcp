import { z } from "zod";
import {
  createErrorResponse,
  createSuccessResponse,
} from "@/lib/toolResponses";

export const getProjectUrlTool = {
  title: "get-project-url",
  description: "Returns the Supabase project API URL.",
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
