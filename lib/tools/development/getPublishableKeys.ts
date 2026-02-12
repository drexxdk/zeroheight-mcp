import { z } from "zod";
import { createErrorResponse } from "../../common";

export const getPublishableKeysTool = {
  title: "get-publishable-api-keys",
  description: "Gets all publishable API keys for the project.",
  inputSchema: z.object({}),
  handler: async () => {
    // This would require API calls to Supabase management API
    // For security, we'll return a message about checking environment variables
    return createErrorResponse(
      "API keys are configured via environment variables. Check NEXT_PUBLIC_SUPABASE_URL and SUPABASE_ACCESS_TOKEN in your .env.local file.",
    );
  },
};
