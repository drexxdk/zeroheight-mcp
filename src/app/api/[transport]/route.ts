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
          const parsedIn = tool.inputSchema.safeParse(args);
          if (!parsedIn.success) {
            return createErrorResponse({
              message: "Tool input failed validation",
            });
          }
          const res = await tool.handler(parsedIn.data);

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

    // Test tool to create short-lived demo tasks
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

    // Database Inspection & Management Tools
    // Database inspection/management tools removed: execute-sql, get-logs, list-migrations, list-tables

    // Development & Deployment Tools
    // Example: { "method": "tools/call", "params": { "name": "Get Database Schema", "arguments": {} } }
    server.registerTool(
      getDatabaseSchemaTool.title,
      {
        title: getDatabaseSchemaTool.title,
        description: getDatabaseSchemaTool.description,
        inputSchema: getDatabaseSchemaTool.inputSchema,
      },
      wrapTool(getDatabaseSchemaTool),
    );

    // (Removed) get-project-url and get-publishable-api-keys tools — not needed

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
// Widen the handler type to accept plain `Request` objects in addition to
// `NextRequest`. We perform a single, centralized cast here so call-sites
// can forward `Request` instances without repeating unsafe casts.
const permissiveHandler = handler as (req: Request) => Promise<Response>;

// The MCP handler expects a `NextRequest` in some environments, but we
// sometimes need to forward plain `Request` instances (constructed above).
// Create a small adapter typed for `Request` so call-sites can pass a
// `Request` without repeated casts.
type HandlerForRequest = (req: Request) => Promise<Response>;
const handlerForRequest: HandlerForRequest = async (req) => {
  return await permissiveHandler(req);
};

// Export the underlying MCP handler for reuse by the JSON wrapper route.
export const mcpHandler = handler;

async function tryHandleFastTaskCall(
  parsed: Record<string, unknown>,
): Promise<Response | undefined> {
  const params = isRecord(parsed?.["params"]) ? parsed!["params"] : undefined;
  const toolName =
    typeof params?.["name"] === "string" ? params!["name"] : undefined;
  const args = isRecord(params?.["arguments"]) ? params!["arguments"] : {};

  const taskTools = new Set([
    tasksGetTool.title,
    tasksResultTool.title,
    tasksListTool.title,
    tasksCancelTool.title,
    testTaskTool.title,
    tasksTailTool.title,
  ]);

  if (!(toolName && taskTools.has(toolName))) return undefined;

  try {
    const createFastHandler = <S extends import("zod").ZodTypeAny>(tool: {
      handler: (a: import("zod").infer<S>) => Promise<unknown>;
      inputSchema: S;
    }) => {
      return async (a?: unknown) => {
        const parsedInput = tool.inputSchema.safeParse(a);
        if (!parsedInput.success) throw new Error("Invalid input");
        return tool.handler(parsedInput.data);
      };
    };

    const toolMap: Record<string, (a?: unknown) => Promise<unknown>> = {
      [tasksGetTool.title]: createFastHandler(tasksGetTool),
      [tasksResultTool.title]: createFastHandler(tasksResultTool),
      [tasksListTool.title]: createFastHandler(tasksListTool),
      [tasksCancelTool.title]: createFastHandler(tasksCancelTool),
      [testTaskTool.title]: createFastHandler(testTaskTool),
      [tasksTailTool.title]: createFastHandler(tasksTailTool),
    };

    const handlerFn = toolMap[toolName];
    const result = await handlerFn(args);

    let rpcResult: unknown;
    if (
      isRecord(result) &&
      Object.prototype.hasOwnProperty.call(result, "task")
    ) {
      rpcResult = result;
    } else {
      rpcResult = normalizeToToolResponse(result);
    }

    const rpc = {
      jsonrpc: "2.0",
      id: parsed["id"] ?? null,
      result: rpcResult,
    };
    return new Response(JSON.stringify(rpc), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const rpc = {
      jsonrpc: "2.0",
      id: parsed["id"] ?? null,
      error: { code: -32000, message: msg },
    };
    return new Response(JSON.stringify(rpc), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

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

// Authenticate the incoming request. For simple JSON-RPC `tools/call` calls
// that target lightweight task tools we shortcut and call the tool handler
// directly (avoids a full MCP roundtrip). Otherwise the request is forwarded
// to the MCP handler.
async function authenticatedHandler(request: NextRequest): Promise<Response> {
  const {
    isValid,
    error,
    bodyText,
    contentType: _contentType,
    parsed,
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

  // Fast-path for lightweight task tools; delegate to helper
  if (parsed && parsed["method"] === "tools/call") {
    const fast = await tryHandleFastTaskCall(parsed);
    if (fast) return fast;
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
