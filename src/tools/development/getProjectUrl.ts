import { z } from "zod";
import {
  createErrorResponse,
  createSuccessResponse,
} from "@/lib/toolResponses";
import { NEXT_PUBLIC_SUPABASE_URL } from "@/lib/config";

export const getProjectUrlTool = {
  title: "get-project-url",
  description: "Returns the Supabase project API URL.",
  inputSchema: z.object({}),
  handler: async () => {
    const url = NEXT_PUBLIC_SUPABASE_URL;
    if (!url) {
      return createErrorResponse(
        "Error: NEXT_PUBLIC_SUPABASE_URL not configured",
      );
    }
    return createSuccessResponse(url);
  },
};
