import { createMcpHandler } from "mcp-handler";
import { NextRequest } from "next/server";
import { authenticateRequest } from "@/utils/auth";
// database tool exports trimmed; only specific tools imported below
import {
  getDatabaseSchemaTool,
  getDatabaseTypesTool,
} from "@/tools/development";
import { scrapeTool } from "@/tools/scraper";
import { clearDatabaseTool, queryDatatabaseTool } from "@/tools/database";
import {
  tasksGetTool,
  tasksResultTool,
  tasksListTool,
  tasksCancelTool,
  testTaskTool,
} from "@/tools/tasks";
import type { ToolResponse } from "@/utils/toolResponses";
import { normalizeToToolResponse } from "@/utils/toolResponses";
import { isRecord } from "../../../utils/common/typeGuards";

const handler = createMcpHandler(
  async (server) => {
    // Register MCP tools. Task/job tools persist status/logs to the DB via
    // the jobStore; inspector/tailer tools are registered where needed.

    // SEP-1686: Task tools
    // Wrap a tool handler and coerce its result into a `ToolResponse` so the
    // MCP server receives a consistent shape regardless of the handler's raw
    // return value.
    const wrapTool = <T>(tool: { handler: (a: T) => Promise<unknown> }) => {
      return async (args: unknown): Promise<ToolResponse> => {
        const res = await tool.handler(args as T);
        return normalizeToToolResponse(res);
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
      getDatabaseSchemaTool.handler,
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
      getDatabaseTypesTool.handler,
    );
    // Scraper-related tools
    server.registerTool(
      clearDatabaseTool.title,
      {
        title: clearDatabaseTool.title,
        description: clearDatabaseTool.description,
        inputSchema: clearDatabaseTool.inputSchema,
      },
      clearDatabaseTool.handler,
    );

    server.registerTool(
      scrapeTool.title,
      {
        title: scrapeTool.title,
        description: scrapeTool.description,
        inputSchema: scrapeTool.inputSchema,
      },
      scrapeTool.handler,
    );

    server.registerTool(
      queryDatatabaseTool.title,
      {
        title: queryDatatabaseTool.title,
        description: queryDatatabaseTool.description,
        inputSchema: queryDatatabaseTool.inputSchema,
      },
      queryDatatabaseTool.handler,
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

// Authenticate the incoming request. For simple JSON-RPC `tools/call` calls
// that target lightweight task tools we shortcut and call the tool handler
// directly (avoids a full MCP roundtrip). Otherwise the request is forwarded
// to the MCP handler.
async function authenticatedHandler(request: NextRequest) {
  const auth = authenticateRequest({ request });

  if (!auth.isValid) {
    return new Response(
      JSON.stringify({
        jsonrpc: "2.0",
        error: { code: -32600, message: auth.error },
        id: null,
      }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }

  // Read the request body once (text) so it can be reused when forwarding.
  let bodyText: string | null = null;
  try {
    bodyText = await request.text();
  } catch {
    bodyText = null;
  }

  const contentType = request.headers.get("content-type") || "";
  let parsed: Record<string, unknown> | null = null;
  if (contentType.includes("application/json") && bodyText) {
    try {
      const p = JSON.parse(bodyText);
      if (isRecord(p)) parsed = p;
    } catch {
      parsed = null;
    }
  }

  // If this is a single JSON-RPC `tools/call` targeting a task tool, handle it
  // directly here and return a JSON-RPC response. This keeps the fast-path
  // small and predictable.
  if (parsed && parsed["method"] === "tools/call") {
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
    ]);

    if (toolName && taskTools.has(toolName)) {
      try {
        const wrapHandler = <T, R>(h: (a: T) => Promise<R>) => {
          return async (a?: unknown) => h(a as T) as Promise<unknown>;
        };

        const toolMap: Record<string, (a?: unknown) => Promise<unknown>> = {
          [tasksGetTool.title]: wrapHandler(
            tasksGetTool.handler as (a: unknown) => Promise<unknown>,
          ),
          [tasksResultTool.title]: wrapHandler(
            tasksResultTool.handler as (a: unknown) => Promise<unknown>,
          ),
          [tasksListTool.title]: wrapHandler(
            tasksListTool.handler as (a: unknown) => Promise<unknown>,
          ),
          [tasksCancelTool.title]: wrapHandler(
            tasksCancelTool.handler as (a: unknown) => Promise<unknown>,
          ),
          [testTaskTool.title]: wrapHandler(
            testTaskTool.handler as (a: unknown) => Promise<unknown>,
          ),
        };

        const handlerFn = toolMap[toolName];
        const result = await handlerFn(args);

        // If the tool returned a structured task object (SEP-1686), forward
        // it directly as the JSON-RPC `result` so callers receive typed task
        // metadata. Otherwise normalize into a ToolResponse for backward
        // compatibility with tools that return raw values or errors.
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
  }

  // When forwarding to the MCP handler, recreate a Request with the same
  // body and headers so the handler can consume it normally.
  const forwardedHeaders = new Headers(request.headers as HeadersInit);
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
    console.debug("[mcp] forwarding GET/HEAD to handler", {
      method: request.method,
      url: request.url,
      accept: forwardedHeaders.get("accept"),
    });

    try {
      const res = await handlerForRequest(request);

      if (res && res.status === 405) {
        console.debug(
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
        forwardedPostHeaders.set(
          "accept",
          "application/json, text/event-stream",
        );

        const postResp = await handlerForRequest(
          new Request(request.url, {
            method: "POST",
            headers: forwardedPostHeaders,
            body: rpc,
          }),
        );

        const postCt = postResp.headers.get("content-type") || "";
        if (postCt.includes("text/event-stream")) {
          return postResp;
        }

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
      console.error("[mcp] handler threw while handling GET/HEAD:", err);
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
