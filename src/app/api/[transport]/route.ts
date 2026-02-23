import { createMcpHandler } from "mcp-handler";
import { NextRequest } from "next/server";
import { authenticateRequest } from "@/utils/auth";
// database tool exports trimmed; only specific tools imported below
import {
  getDatabaseSchemaTool,
  getDatabaseTypesTool,
} from "@/tools/development";
import { scrapeTool } from "@/tools/scraper";
import { clearAllDataTool, queryDataTool } from "@/tools/database";
import {
  tasksGetTool,
  tasksResultTool,
  tasksListTool,
  tasksCancelTool,
  testTaskTool,
  tasksTailTool,
} from "@/tools/tasks";
import type { ToolResponse } from "@/utils/toolResponses";
import {
  normalizeToToolResponse,
  createErrorResponse,
} from "@/utils/toolResponses";
import { isRecord } from "../../../utils/common/typeGuards";
import { parseJsonText } from "@/utils/server/apiHelpers";
import logger from "@/utils/logger";

// Argument normalization is handled in tool wrappers when required.

const handler = createMcpHandler(
  async (server) => {
    // Register MCP tools. Task/job tools persist status/logs to the DB via
    // the jobStore; inspector/tailer tools are registered where needed.

    // SEP-1686: Task tools
    // Wrap a tool handler and coerce its result into a `ToolResponse` so the
    // MCP server receives a consistent shape regardless of the handler's raw
    // return value.
    const wrapTool = <S extends import("zod").ZodTypeAny>(tool: {
      handler: (a: import("zod").infer<S>) => Promise<unknown>;
      inputSchema: S;
      outputSchema?: import("zod").ZodTypeAny;
    }) => {
      return async (args: unknown): Promise<ToolResponse> => {
        try {
          // Validate input with the tool's Zod schema.
          const parsedIn = tool.inputSchema.safeParse(args);
          if (!parsedIn.success) {
            return createErrorResponse({
              message: "Tool input failed validation",
            });
          }
          const res = await tool.handler(parsedIn.data);
          try {
            logger.debug("wrapTool handler raw result", {
              type: typeof res,
              value:
                typeof res === "object" ? JSON.stringify(res) : String(res),
            });
          } catch {
            /* ignore logging errors */
          }
          // If the handler already returned a `ToolResponse` shape, accept it
          // as-is and bypass per-tool outputSchema validation. This allows
          // handlers to return `createErrorResponse()` without requiring every
          // tool to union its output schema with the error shape.
          if (isRecord(res)) {
            const maybeContent = Reflect.get(res, "content");
            if (Array.isArray(maybeContent)) {
              const allText = maybeContent.every(
                (it) =>
                  isRecord(it) &&
                  Reflect.get(it, "type") === "text" &&
                  typeof Reflect.get(it, "text") === "string",
              );
              if (allText) return res as ToolResponse;
            }
          }

          // If the tool provided an outputSchema, validate the result before
          // normalization. If validation fails, return an error ToolResponse.
          if (tool.outputSchema) {
            const parsedOut = tool.outputSchema.safeParse(res);
            if (!parsedOut.success) {
              logger.error(
                "Tool output validation failed:",
                parsedOut.error.format(),
              );
              return createErrorResponse({
                message: "Tool output failed validation",
              });
            }
          }

          return normalizeToToolResponse(res);
        } catch (e) {
          logger.error("wrapTool error:", e);
          return createErrorResponse({ message: "Tool execution error" });
        }
      };
    };
    server.registerTool(
      tasksGetTool.title,
      {
        title: tasksGetTool.title,
        description: tasksGetTool.description,
        inputSchema: tasksGetTool.inputSchema,
      },
      wrapTool(tasksGetTool),
    );

    server.registerTool(
      tasksResultTool.title,
      {
        title: tasksResultTool.title,
        description: tasksResultTool.description,
        inputSchema: tasksResultTool.inputSchema,
      },
      wrapTool(tasksResultTool),
    );

    server.registerTool(
      tasksListTool.title,
      {
        title: tasksListTool.title,
        description: tasksListTool.description,
        inputSchema: tasksListTool.inputSchema,
      },
      wrapTool(tasksListTool),
    );

    server.registerTool(
      tasksCancelTool.title,
      {
        title: tasksCancelTool.title,
        description: tasksCancelTool.description,
        inputSchema: tasksCancelTool.inputSchema,
      },
      wrapTool(tasksCancelTool),
    );

    // Test tool to create demo tasks
    server.registerTool(
      testTaskTool.title,
      {
        title: testTaskTool.title,
        description: testTaskTool.description,
        inputSchema: testTaskTool.inputSchema,
      },
      wrapTool(testTaskTool),
    );

    server.registerTool(
      tasksTailTool.title,
      {
        title: tasksTailTool.title,
        description: tasksTailTool.description,
        inputSchema: tasksTailTool.inputSchema,
      },
      wrapTool(tasksTailTool),
    );

    // Database inspection & management tools (some utilities removed)

    // Development & deployment tools (tools/call examples are accepted)
    server.registerTool(
      getDatabaseSchemaTool.title,
      {
        title: getDatabaseSchemaTool.title,
        description: getDatabaseSchemaTool.description,
        inputSchema: getDatabaseSchemaTool.inputSchema,
      },
      wrapTool(getDatabaseSchemaTool),
    );

    // Some deployment helper tools removed

    // Example: { "method": "tools/call", "params": { "name": "Get Database Types", "arguments": {} } }
    server.registerTool(
      getDatabaseTypesTool.title,
      {
        title: getDatabaseTypesTool.title,
        description: getDatabaseTypesTool.description,
        inputSchema: getDatabaseTypesTool.inputSchema,
      },
      wrapTool(getDatabaseTypesTool),
    );
    // Scraper-related tools
    server.registerTool(
      clearAllDataTool.title,
      {
        title: clearAllDataTool.title,
        description: clearAllDataTool.description,
        inputSchema: clearAllDataTool.inputSchema,
      },
      wrapTool(clearAllDataTool),
    );

    server.registerTool(
      scrapeTool.title,
      {
        title: scrapeTool.title,
        description: scrapeTool.description,
        inputSchema: scrapeTool.inputSchema,
      },
      wrapTool(scrapeTool),
    );

    server.registerTool(
      queryDataTool.title,
      {
        title: queryDataTool.title,
        description: queryDataTool.description,
        inputSchema: queryDataTool.inputSchema,
      },
      wrapTool(queryDataTool),
    );
  },
  {},
  {
    basePath: "/api",
    maxDuration: 300, // 5 minutes for scraping
    verboseLogs: true,
    sseEndpoint: "/mcp",
  },
);
// Widen the handler type to accept plain `Request` in addition to `NextRequest`.
const permissiveHandler = handler as (req: Request) => Promise<Response>;

// Adapter to allow forwarding plain `Request` instances to the MCP handler.
type HandlerForRequest = (req: Request) => Promise<Response>;
const handlerForRequest: HandlerForRequest = async (req) => {
  const res = await permissiveHandler(req as unknown as Request);
  try {
    const text = await res.text();
    logger.debug("[mcp] handler response body", { body: text });
    // Recreate the Response since the body stream has been consumed.
    const headersObj: Record<string, string> = {};
    res.headers.forEach((v, k) => (headersObj[k] = v));
    return new Response(text, { status: res.status, headers: headersObj });
  } catch (e) {
    logger.warn("[mcp] failed to log handler response body", e);
    return res;
  }
};

// Export the underlying MCP handler for reuse by the JSON wrapper route.
export const mcpHandler = handler;

async function handleGetHeadForwarding(
  request: NextRequest,
  forwardedHeaders: Headers,
  handlerFn: (req: Request) => Promise<Response>,
): Promise<Response | undefined> {
  logger.debug("[mcp] forwarding GET/HEAD to handler", {
    method: request.method,
    url: request.url,
    accept: forwardedHeaders.get("accept"),
  });
  try {
    const res = await handlerFn(request as unknown as Request);
    if (res && res.status === 405) {
      logger.debug(
        "[mcp] handler returned 405 for GET/HEAD — attempting POST fallback",
      );
      const rpc = JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/list",
        params: {},
      });
      const forwardedPostHeaders = new Headers(forwardedHeaders);
      forwardedPostHeaders.set("content-type", "application/json");
      forwardedPostHeaders.set("accept", "application/json, text/event-stream");

      const postResp = await handlerFn(
        new Request(request.url, {
          method: "POST",
          headers: forwardedPostHeaders,
          body: rpc,
        }),
      );
      const postCt = postResp.headers.get("content-type") || "";
      if (postCt.includes("text/event-stream")) return postResp;

      const json = await postResp.text();
      const stream = new ReadableStream({
        start(controller) {
          const sse = `event: message\ndata: ${json}\n\n`;
          controller.enqueue(new TextEncoder().encode(sse));
          controller.close();
        },
      });

      return new Response(stream, {
        status: 200,
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
        },
      });
    }
    return res;
  } catch (err) {
    logger.error("[mcp] handler threw while handling GET/HEAD:", err);
    const msg = err instanceof Error ? err.message : String(err);
    const rpc = {
      jsonrpc: "2.0",
      id: null,
      error: { code: -32000, message: `Handler error: ${msg}` },
    };
    return new Response(JSON.stringify(rpc), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

async function authenticateAndParse(request: NextRequest): Promise<{
  isValid: boolean;
  error?: string;
  bodyText: string | null;
  contentType: string;
  parsed: Record<string, unknown> | null;
}> {
  const auth = authenticateRequest({ request });

  let bodyText: string | null = null;
  try {
    bodyText = await request.text();
  } catch {
    bodyText = null;
  }

  const contentType = request.headers.get("content-type") || "";
  let parsed: Record<string, unknown> | null = null;
  if (contentType.includes("application/json") && bodyText) {
    parsed = parseJsonText(bodyText);
  }

  return {
    isValid: auth.isValid,
    error: auth.error,
    bodyText,
    contentType,
    parsed,
  };
}

// Authenticate the request. Lightweight task tools may be short-circuited
// to call handlers directly; other requests are forwarded to the MCP handler.
async function authenticatedHandler(request: NextRequest): Promise<Response> {
  const {
    isValid,
    error,
    bodyText,
    contentType: _contentType,
    parsed: _parsed,
  } = await authenticateAndParse(request);

  if (!isValid) {
    return new Response(
      JSON.stringify({
        jsonrpc: "2.0",
        error: { code: -32600, message: error },
        id: null,
      }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }

  // When forwarding to the MCP handler, recreate a Request with the same
  // body and headers so the handler can consume it normally.
  const forwardedHeaders = new Headers(request.headers);
  // Ensure the handler sees both JSON and SSE acceptable so it will
  // produce a JSON response for tools/list while remaining compatible
  // with streaming transports.
  forwardedHeaders.set("accept", "application/json, text/event-stream");

  const method = (request.method || "GET").toUpperCase();
  const hasBodyMethod = ["POST", "PUT", "PATCH", "DELETE"].includes(method);

  // For streaming transports (GET/HEAD) forward the original `NextRequest`
  // to allow streaming. If the MCP handler rejects GET (405), fall back to a
  // POST `tools/list` JSON-RPC call and return the result as an SSE event.
  if (method === "GET" || method === "HEAD") {
    // Diagnostic logging to understand 405 responses in this environment
    logger.debug("[mcp] forwarding GET/HEAD to handler", {
      method: request.method,
      url: request.url,
      accept: forwardedHeaders.get("accept"),
    });

    const maybe = await handleGetHeadForwarding(
      request,
      forwardedHeaders,
      handlerForRequest,
    );
    if (maybe) return maybe;
  }

  // For non-GET methods, reconstruct a Request with the same body so the MCP handler can read it.
  const forwardedReq = new Request(request.url, {
    method,
    headers: forwardedHeaders,
    body: hasBodyMethod ? (bodyText ?? undefined) : undefined,
  });

  return handlerForRequest(forwardedReq);
}

export {
  authenticatedHandler as GET,
  authenticatedHandler as POST,
  authenticatedHandler as PUT,
  authenticatedHandler as PATCH,
  authenticatedHandler as DELETE,
  authenticatedHandler as HEAD,
  authenticatedHandler as OPTIONS,
};
