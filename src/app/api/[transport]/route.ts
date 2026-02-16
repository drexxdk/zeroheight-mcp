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
  getProjectUrlTool,
  getPublishableKeysTool,
  getDatabaseTypesTool,
} from "@/tools/development";
import {
  scrapeZeroheightProjectTool,
  queryZeroheightDataTool,
  clearZeroheightDataTool,
} from "@/tools/scraper";
import {
  inspectJobTool,
  tailJobTool,
  countRunTool,
  cancelJobTool,
} from "@/tools/scraper";
import type { ToolResponse } from "@/utils/toolResponses";
import {
  tasksGetTool,
  tasksResultTool,
  tasksListTool,
  tasksCancelTool,
  testTaskTool,
} from "@/tools/scraper";
// removed unused imports (kept tooling lightweight)

const handler = createMcpHandler(
  (server) => {
    // Scraper tools
    // Example: { "method": "tools/call", "params": { "name": "Scrape Zeroheight Project", "arguments": {} } }
    server.registerTool(
      scrapeZeroheightProjectTool.title,
      {
        title: scrapeZeroheightProjectTool.title,
        description: scrapeZeroheightProjectTool.description,
        inputSchema: scrapeZeroheightProjectTool.inputSchema,
      },
      scrapeZeroheightProjectTool.handler,
    );

    // Example: { "method": "tools/call", "params": { "name": "Query Zeroheight Data", "arguments": { "search": "button", "includeImages": true, "limit": 10 } } }
    server.registerTool(
      queryZeroheightDataTool.title,
      {
        title: queryZeroheightDataTool.title,
        description: queryZeroheightDataTool.description,
        inputSchema: queryZeroheightDataTool.inputSchema,
      },
      queryZeroheightDataTool.handler,
    );

    // Example: { "method": "tools/call", "params": { "name": "Clear Zeroheight Data", "arguments": { "apiKey": "your-mcp-api-key" } } }
    server.registerTool(
      clearZeroheightDataTool.title,
      {
        title: clearZeroheightDataTool.title,
        description: clearZeroheightDataTool.description,
        inputSchema: clearZeroheightDataTool.inputSchema,
      },
      clearZeroheightDataTool.handler,
    );

    // Job status/logs are persisted in DB via jobStore; tools for inspecting
    // jobs use `inspectJobTool` and `tailJobTool` registered below.

    // New job inspection tools
    server.registerTool(
      inspectJobTool.title,
      {
        title: inspectJobTool.title,
        description: inspectJobTool.description,
        inputSchema: inspectJobTool.inputSchema,
      },
      inspectJobTool.handler,
    );

    server.registerTool(
      tailJobTool.title,
      {
        title: tailJobTool.title,
        description: tailJobTool.description,
        inputSchema: tailJobTool.inputSchema,
      },
      tailJobTool.handler,
    );

    server.registerTool(
      countRunTool.title,
      {
        title: countRunTool.title,
        description: countRunTool.description,
        inputSchema: countRunTool.inputSchema,
      },
      countRunTool.handler,
    );

    server.registerTool(
      cancelJobTool.title,
      {
        title: cancelJobTool.title,
        description: cancelJobTool.description,
        inputSchema: cancelJobTool.inputSchema,
      },
      cancelJobTool.handler,
    );

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

    // Example: { "method": "tools/call", "params": { "name": "Get Project URL", "arguments": {} } }
    server.registerTool(
      getProjectUrlTool.title,
      {
        title: getProjectUrlTool.title,
        description: getProjectUrlTool.description,
        inputSchema: getProjectUrlTool.inputSchema,
      },
      getProjectUrlTool.handler,
    );

    // Example: { "method": "tools/call", "params": { "name": "Get Publishable API Keys", "arguments": {} } }
    server.registerTool(
      getPublishableKeysTool.title,
      {
        title: getPublishableKeysTool.title,
        description: getPublishableKeysTool.description,
        inputSchema: getPublishableKeysTool.inputSchema,
      },
      getPublishableKeysTool.handler,
    );

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
  },
  {},
  {
    basePath: "/api",
    maxDuration: 300, // 5 minutes for scraping
    verboseLogs: true,
  },
);

// Authentication wrapper for Next.js API routes
async function authenticatedHandler(request: NextRequest) {
  const auth = authenticateRequest(request);

  if (!auth.isValid) {
    return new Response(
      JSON.stringify({
        jsonrpc: "2.0",
        error: {
          code: -32600,
          message: auth.error,
        },
        id: null,
      }),
      {
        status: 401,
        headers: {
          "Content-Type": "application/json",
        },
      },
    );
  }

  // Call the MCP handler with the authenticated request
  try {
    // Read body and, if it's a tools/call with params.task.ttl, merge it into params.arguments.requestedTtlMs
    const contentType = request.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const body = await request.json().catch(() => null);
      if (body && typeof body === "object") {
        // Support single JSON-RPC object or batch array
        const normalizeAndInject = (obj: unknown) => {
          if (typeof obj !== "object" || obj === null) return;
          const o = obj as Record<string, unknown>;
          const method = o["method"];
          if (method !== "tools/call") return;
          const params = o["params"];
          if (typeof params !== "object" || params === null) return;
          const p = params as Record<string, unknown>;
          const task = p["task"];
          if (typeof task !== "object" || task === null) return;
          const t = task as Record<string, unknown>;
          const ttl = t["ttl"];
          if (typeof ttl === "number") {
            if (typeof p["arguments"] !== "object" || p["arguments"] === null)
              p["arguments"] = {};
            const args = p["arguments"] as Record<string, unknown>;
            if (typeof args["requestedTtlMs"] === "undefined")
              args["requestedTtlMs"] = ttl;
          }
        };

        if (Array.isArray(body)) {
          body.forEach(normalizeAndInject);
        } else {
          normalizeAndInject(body);
        }

        // If this is a tools/call with task metadata, attempt to handle it locally
        // by invoking the matching tool handler and returning a JSON-RPC response.
        const isSingle = !Array.isArray(body);
        const normalized = isSingle ? (body as Record<string, unknown>) : null;
        if (normalized && normalized["method"] === "tools/call") {
          const params = normalized["params"] as
            | Record<string, unknown>
            | undefined;
          const toolName = params?.["name"] as string | undefined;
          const args =
            (params?.["arguments"] as Record<string, unknown> | undefined) ??
            {};
          // Ensure TTL from params.task.ttl is applied to arguments for task-aware calls
          const taskNode = params?.["task"] as
            | Record<string, unknown>
            | undefined;
          if (taskNode && typeof taskNode["ttl"] === "number") {
            args["requestedTtlMs"] = taskNode["ttl"] as number;
          }

          // Local tool mapping
          const localTools: Record<string, unknown> = {
            [scrapeZeroheightProjectTool.title]:
              scrapeZeroheightProjectTool.handler,
            [queryZeroheightDataTool.title]: queryZeroheightDataTool.handler,
            [clearZeroheightDataTool.title]: clearZeroheightDataTool.handler,
            [inspectJobTool.title]: inspectJobTool.handler,
            [tailJobTool.title]: tailJobTool.handler,
            [countRunTool.title]: countRunTool.handler,
            [cancelJobTool.title]: cancelJobTool.handler,
            [tasksGetTool.title]: tasksGetTool.handler,
            [tasksResultTool.title]: tasksResultTool.handler,
            [tasksListTool.title]: tasksListTool.handler,
            [tasksCancelTool.title]: tasksCancelTool.handler,
            [testTaskTool.title]: testTaskTool.handler,
            [listTablesTool.title]: listTablesTool.handler,
            [executeSqlTool.title]: executeSqlTool.handler,
            [listMigrationsTool.title]: listMigrationsTool.handler,
            [getLogsTool.title]: getLogsTool.handler,
            [getDatabaseSchemaTool.title]: getDatabaseSchemaTool.handler,
            [getProjectUrlTool.title]: getProjectUrlTool.handler,
            [getPublishableKeysTool.title]: getPublishableKeysTool.handler,
            [getDatabaseTypesTool.title]: getDatabaseTypesTool.handler,
          };

          if (
            toolName &&
            Object.prototype.hasOwnProperty.call(localTools, toolName)
          ) {
            try {
              const toolHandler = localTools[toolName] as unknown as (
                a: unknown,
              ) => Promise<unknown>;
              if (
                toolName === tasksGetTool.title ||
                toolName === tasksResultTool.title
              ) {
                // log arguments for debugging TTL propagation
                console.log("Invoking tool", toolName, "with args:", args);
              }
              const result = await toolHandler(args);
              let rpcResult: unknown;
              if (result && typeof result === "object") {
                const rObj = result as Record<string, unknown>;
                if (Array.isArray(rObj.content)) rpcResult = rObj;
                else
                  rpcResult = { content: [{ text: JSON.stringify(result) }] };
              } else {
                rpcResult = { content: [{ text: JSON.stringify(result) }] };
              }
              const rpc = {
                jsonrpc: "2.0",
                id: normalized["id"] ?? null,
                result: rpcResult,
              };
              return new Response(JSON.stringify(rpc), {
                status: 200,
                headers: { "Content-Type": "application/json" },
              });
            } catch (e) {
              const rpcErr = {
                jsonrpc: "2.0",
                id: normalized["id"] ?? null,
                error: {
                  code: -32603,
                  message: String(e instanceof Error ? e.message : e),
                },
              };
              return new Response(JSON.stringify(rpcErr), {
                status: 500,
                headers: { "Content-Type": "application/json" },
              });
            }
          }
        }

        const newReq = new Request(request.url, {
          method: request.method,
          headers: request.headers,
          body: JSON.stringify(body),
        });
        return handler(newReq as unknown as NextRequest);
      }
    }
  } catch {
    // If anything goes wrong while parsing/injecting, fall back to original request
  }

  return handler(request);
}

export { authenticatedHandler as GET, authenticatedHandler as POST };
