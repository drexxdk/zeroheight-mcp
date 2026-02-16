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
  return handler(request);
}

export { authenticatedHandler as GET, authenticatedHandler as POST };
