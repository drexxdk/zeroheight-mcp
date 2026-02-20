import { z } from "zod";
import { createSuccessResponse } from "@/utils/toolResponses";
import type { ToolDefinition } from "@/tools/toolTypes";

const tasksTailInput = z.object({ taskId: z.string() }).required();

export const tasksTailTool: ToolDefinition<typeof tasksTailInput> = {
  title: "tasks-tail",
  description: "Get SSE tail URL for a taskId (returns path to SSE endpoint)",
  inputSchema: tasksTailInput,
  handler: async ({ taskId }: z.infer<typeof tasksTailInput>) => {
    // Return the relative SSE endpoint URL so clients can open an SSE connection.
    const url = `/api/tasks/tail?taskId=${encodeURIComponent(taskId)}`;
    return createSuccessResponse({ data: { url } });
  },
};

// Provide a compatibility export so the app route or other callers can
// programmatically invoke the SSE handler from the tools module. This keeps
// callers flexible even if the route implementation lives under `app/`.
export async function sseHandler(req: Request): Promise<Response> {
  const mod = await import("@/app/api/tasks/tail/route");
  if (mod && typeof mod.GET === "function") {
    return await mod.GET(req as Request);
  }
  return new Response(JSON.stringify({ error: "SSE handler not available" }), {
    status: 500,
  });
}
