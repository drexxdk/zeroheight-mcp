import { z } from "zod";
import {
  createErrorResponse,
  createSuccessResponse,
} from "@/utils/toolResponses";
import { NEXT_PUBLIC_SUPABASE_URL } from "@/utils/config";

export const getProjectUrlTool = {
  title: "get-project-url",
  description: "Returns the Supabase project API URL.",
  inputSchema: z.object({}),
  handler: async () => {
    const url = NEXT_PUBLIC_SUPABASE_URL;
    if (!url) {
      return createErrorResponse({
        message: "Error: NEXT_PUBLIC_SUPABASE_URL not configured",
      });
    }
    return createSuccessResponse({ data: url });
  },
};
