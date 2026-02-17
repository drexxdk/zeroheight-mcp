import type { z } from "zod";
import type { ToolResponse } from "@/utils/toolResponses";

// Generic tool definition used across tool modules
export type ToolDefinition<I extends z.ZodTypeAny> = {
  title: string;
  description: string;
  inputSchema: I;
  // Handlers MUST return a normalized ToolResponse
  handler: (input: z.infer<I>) => Promise<ToolResponse>;
};
