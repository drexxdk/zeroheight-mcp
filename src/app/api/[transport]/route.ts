import { createMcpHandler } from "mcp-handler";
import { NextRequest } from "next/server";
import { authenticateRequest } from "@/utils/auth";
import {
  listTablesTool,
  executeSqlTool,
  listMigrationsTool,
  getLogsTool,
} from "@/tools/database";
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

const handler = createMcpHandler(
  async (server) => {
    // Job status/logs are persisted in DB via jobStore; tools for inspecting
    // jobs use `inspectJobTool` and `tailJobTool` registered below.

    // Job-related scraper tools

    // SEP-1686 Task tools
    server.registerTool(
      tasksGetTool.title,
      {
        title: tasksGetTool.title,
        description: tasksGetTool.description,
        inputSchema: tasksGetTool.inputSchema,
      },
      async (args: unknown): Promise<ToolResponse> => {
        const h = tasksGetTool.handler as unknown as (
          a: unknown,
        ) => Promise<unknown>;
        const res = await h(args);
        if (res && typeof res === "object") {
          const rObj = res as Record<string, unknown>;
          if (Array.isArray(rObj.content))
            return rObj as unknown as ToolResponse;
        }
        return { content: [{ type: "text", text: JSON.stringify(res) }] };
      },
    );

    server.registerTool(
      tasksResultTool.title,
      {
        title: tasksResultTool.title,
        description: tasksResultTool.description,
        inputSchema: tasksResultTool.inputSchema,
      },
      async (args: unknown): Promise<ToolResponse> => {
        const h = tasksResultTool.handler as unknown as (
          a: unknown,
        ) => Promise<unknown>;
        const res = await h(args);
        if (res && typeof res === "object") {
          const rObj = res as Record<string, unknown>;
          if (Array.isArray(rObj.content))
            return rObj as unknown as ToolResponse;
        }
        return { content: [{ type: "text", text: JSON.stringify(res) }] };
      },
    );

    server.registerTool(
      tasksListTool.title,
      {
        title: tasksListTool.title,
        description: tasksListTool.description,
        inputSchema: tasksListTool.inputSchema,
      },
      async (args: unknown): Promise<ToolResponse> => {
        const h = tasksListTool.handler as unknown as (
          a: unknown,
        ) => Promise<unknown>;
        const res = await h(args);
        if (res && typeof res === "object") {
          const rObj = res as Record<string, unknown>;
          if (Array.isArray(rObj.content))
            return rObj as unknown as ToolResponse;
        }
        return { content: [{ type: "text", text: JSON.stringify(res) }] };
      },
    );

    server.registerTool(
      tasksCancelTool.title,
      {
        title: tasksCancelTool.title,
        description: tasksCancelTool.description,
        inputSchema: tasksCancelTool.inputSchema,
      },
      async (args: unknown): Promise<ToolResponse> => {
        const h = tasksCancelTool.handler as unknown as (
          a: unknown,
        ) => Promise<unknown>;
        const res = await h(args);
        if (res && typeof res === "object") {
          const rObj = res as Record<string, unknown>;
          if (Array.isArray(rObj.content))
            return rObj as unknown as ToolResponse;
        }
        return { content: [{ type: "text", text: JSON.stringify(res) }] };
      },
    );

    // Test tool to create short-lived demo tasks
    server.registerTool(
      testTaskTool.title,
      {
        title: testTaskTool.title,
        description: testTaskTool.description,
        inputSchema: testTaskTool.inputSchema,
      },
      async (args: unknown): Promise<ToolResponse> => {
        const h = testTaskTool.handler as unknown as (
          a: unknown,
        ) => Promise<unknown>;
        const res = await h(args);
        if (res && typeof res === "object") {
          const rObj = res as Record<string, unknown>;
          if (Array.isArray(rObj.content))
            return rObj as unknown as ToolResponse;
        }
        return { content: [{ type: "text", text: JSON.stringify(res) }] };
      },
    );

    // Database Inspection & Management Tools
    // Example: { "method": "tools/call", "params": { "name": "List Tables", "arguments": {} } }
    server.registerTool(
      listTablesTool.title,
      {
        title: listTablesTool.title,
        description: listTablesTool.description,
        inputSchema: listTablesTool.inputSchema,
      },
      listTablesTool.handler,
    );

    // Example: { "method": "tools/call", "params": { "name": "Execute SQL", "arguments": { "query": "SELECT * FROM pages LIMIT 5;" } } }
    server.registerTool(
      executeSqlTool.title,
      {
        title: executeSqlTool.title,
        description: executeSqlTool.description,
        inputSchema: executeSqlTool.inputSchema,
      },
      executeSqlTool.handler,
    );

    // Example: { "method": "tools/call", "params": { "name": "List Migrations", "arguments": {} } }
    server.registerTool(
      listMigrationsTool.title,
      {
        title: listMigrationsTool.title,
        description: listMigrationsTool.description,
        inputSchema: listMigrationsTool.inputSchema,
      },
      listMigrationsTool.handler,
    );

    // Example: { "method": "tools/call", "params": { "name": "Get Logs", "arguments": {} } }
    server.registerTool(
      getLogsTool.title,
      {
        title: getLogsTool.title,
        description: getLogsTool.description,
        inputSchema: getLogsTool.inputSchema,
      },
      getLogsTool.handler,
    );

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

// Export the underlying MCP handler for the JSON wrapper route to reuse.
export const mcpHandler = handler;

// Authentication wrapper: authenticate, then either handle task-tool calls directly
// (minimal wrapper) or forward the request to the MCP handler unchanged.
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

  // Read the request body once (as text) to avoid "Body has already been read".
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
      if (p && typeof p === "object" && !Array.isArray(p))
        parsed = p as Record<string, unknown>;
    } catch {
      parsed = null;
    }
  }

  // If this is a single JSON-RPC tools/call for a tasks tool, handle it directly
  if (parsed && parsed["method"] === "tools/call") {
    const params = parsed["params"] as Record<string, unknown> | undefined;
    const toolName = params?.["name"] as string | undefined;
    const args =
      (params?.["arguments"] as Record<string, unknown> | undefined) ?? {};

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

        const rpcResult = normalizeToToolResponse(result);

        const rpc = {
          jsonrpc: "2.0",
          id: parsed["id"] ?? null,
          result: rpcResult,
        };
        return new Response(JSON.stringify(rpc), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      } catch (e: unknown) {
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

  // Reconstruct a Request with the same body so the MCP handler can read it.
  const forwardedHeaders = new Headers(request.headers as HeadersInit);
  // Ensure the handler sees both JSON and SSE acceptable so it will
  // produce a JSON response for tools/list while remaining compatible
  // with streaming transports.
  forwardedHeaders.set("accept", "application/json, text/event-stream");

  const method = (request.method || "GET").toUpperCase();
  const hasBodyMethod = ["POST", "PUT", "PATCH", "DELETE"].includes(method);

  // For streaming transports (GET/HEAD) try forwarding the original NextRequest
  // so that the MCP handler can use streaming features. If the handler
  // returns 405 (some transports reject GET), fall back to synthesizing a
  // POST `tools/list` JSON-RPC call and return its result as an SSE event.
  if (method === "GET" || method === "HEAD") {
    // Diagnostic logging to understand 405 responses in this environment
    console.debug("[mcp] forwarding GET/HEAD to handler", {
      method: request.method,
      url: request.url,
      accept: forwardedHeaders.get("accept"),
    });

    try {
      const res = await handler(request as NextRequest);

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

        const postResp = await handler(
          new Request(request.url, {
            method: "POST",
            headers: forwardedPostHeaders,
            body: rpc,
          }) as unknown as NextRequest,
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
    } catch (err: unknown) {
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

  return handler(forwardedReq as unknown as NextRequest);
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
