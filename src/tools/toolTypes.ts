import type { z } from "zod";
import type { ToolResponse } from "@/utils/toolResponses";

// Generic tool definition used across tool modules. By default tools may
// return `ToolResponse`, but callers can specialize the output type `O`
// to return domain-shaped objects. Handlers that return non-ToolResponse
// values will be normalized by the MCP wrapper when registered.
export type ToolDefinition<I extends z.ZodTypeAny, O = ToolResponse> = {
  title: string;
  description: string;
  inputSchema: I;
  // Optional runtime output schema to validate the handler result before
  // it's normalized and sent to consumers.
  outputSchema?: z.ZodTypeAny;
  handler: (input: z.infer<I>) => Promise<O>;
};
