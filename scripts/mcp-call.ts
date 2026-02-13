#!/usr/bin/env node

/**
 * Standardized MCP Tool Caller
 * Ensures correct headers and response handling for all MCP API calls
 */

import { config } from "dotenv";
import { existsSync } from "fs";
import { join } from "path";

// Load environment variables from .env.local if it exists
const envLocalPath = join(process.cwd(), ".env.local");
if (existsSync(envLocalPath)) {
  config({ path: envLocalPath });
  console.log("✅ Loaded environment from .env.local");
} else {
  console.log("⚠️  .env.local not found, using existing environment variables");
}

const API_URL: string =
  process.env.MCP_API_URL || "http://localhost:3000/api/mcp";
const API_KEY: string | undefined = process.env.MCP_API_KEY;

console.log(`API_URL: ${API_URL}`);
console.log(`API_KEY set: ${!!API_KEY}`);

if (!API_KEY) {
  console.error("❌ Error: MCP_API_KEY environment variable not set");
  console.error("");
  console.error("To fix this:");
  console.error("1. Ensure .env.local exists in the project root");
  console.error("2. Add MCP_API_KEY=your-api-key to .env.local");
  console.error(
    "3. Or set the environment variable: $env:MCP_API_KEY = 'your-key'",
  );
  console.error("");
  console.error("Current working directory:", process.cwd());
  console.error("Looking for .env.local at:", envLocalPath);
  process.exit(1);
}

// Check if server is running
console.log("🔍 Checking if MCP server is running...");
try {
  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": API_KEY!,
      Accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: -1, // Special ID for connectivity check
      method: "tools/list",
      params: {},
    }),
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) {
    throw new Error(`Server responded with ${response.status}`);
  }
  console.log("✅ MCP server is running and responding");
} catch (error) {
  console.error("❌ Error: MCP server is not running or not accessible");
  console.error(`   URL: ${API_URL}`);
  console.error(
    `   Error: ${error instanceof Error ? error.message : String(error)}`,
  );
  console.error("");
  console.error("To fix this:");
  console.error("1. Start the development server: npm run dev");
  console.error("2. Or check if the server is running on a different port");
  process.exit(1);
}

interface MCPRequest {
  jsonrpc: string;
  id: number;
  method: string;
  params: {
    name: string;
    arguments: Record<string, unknown>;
  };
}

interface MCPResponse {
  result?: {
    content?: Array<{
      type: string;
      text: string;
    }>;
    isError?: boolean;
  };
  error?: unknown;
  jsonrpc: string;
  id: number;
}

/**
 * Call an MCP tool with proper headers and response handling
 */
async function callMCPTool(
  toolName: string,
  args: Record<string, unknown> = {},
): Promise<MCPResponse | null> {
  console.log(`🔧 Calling MCP Tool: ${toolName}`);
  console.log(`📍 API URL: ${API_URL}`);

  const requestBody: MCPRequest = {
    jsonrpc: "2.0",
    id: Date.now(), // Unique ID
    method: "tools/call",
    params: {
      name: toolName,
      arguments: args,
    },
  };

  console.log(`📤 Request:`, JSON.stringify(requestBody, null, 2));

  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": API_KEY!,
        Accept: "application/json, text/event-stream",
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ HTTP Error: ${response.status} ${response.statusText}`);
      console.error(`Error details:`, errorText);
      return null;
    }

    // Handle Server-Sent Events response
    const reader = response.body?.getReader();
    const decoder = new TextDecoder();

    if (reader) {
      let buffer = "";
      let result: MCPResponse | null = null;

      while (!result) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6).trim();
            if (data) {
              try {
                const parsed: MCPResponse = JSON.parse(data);
                console.log(
                  `📄 SSE Response:`,
                  JSON.stringify(parsed, null, 2),
                );

                if (parsed.result) {
                  result = parsed;
                  if (parsed.result.content && parsed.result.content[0]) {
                    console.log("\n✅ Success!");
                    console.log("─".repeat(50));
                    console.log(parsed.result.content[0].text);
                    console.log("─".repeat(50));
                  }
                } else if (parsed.error) {
                  console.error("❌ Tool Error:", parsed.error);
                  return null;
                }
              } catch {
                // Not valid JSON yet, continue reading
              }
            }
          }
        }

        // Keep only incomplete lines in buffer
        const lastNewlineIndex = buffer.lastIndexOf("\n");
        if (lastNewlineIndex !== -1) {
          buffer = buffer.slice(lastNewlineIndex + 1);
        }
      }

      return result;
    }
  } catch (error) {
    console.error("❌ Network error:", (error as Error).message);
    return null;
  }

  return null;
}

// CLI usage
console.log(`import.meta.url: ${import.meta.url}`);
console.log(`process.argv[1]: ${process.argv[1]}`);
console.log(`file://${process.argv[1]}: file://${process.argv[1]}`);
console.log(
  `Are they equal? ${import.meta.url === `file://${process.argv[1]}`}`,
);

// Normalize paths for cross-platform compatibility
const normalizedImportMeta: string = import.meta.url;
const normalizedArgv: string = `file:///${process.argv[1].replace(/\\/g, "/")}`;

if (normalizedImportMeta === normalizedArgv) {
  console.log("CLI mode detected");
  const [, , toolName, ...args] = process.argv;

  if (!toolName || toolName === "--help" || toolName === "-h") {
    console.log(`
🔧 MCP Tool Caller

Usage:
  npm run mcp-call -- <tool-name> [arguments...]
  npx tsx scripts/mcp-call.ts <tool-name> [arguments...]

Available tools:
  • Scrape Zeroheight Project
  • Query Zeroheight Data
  • Clear Zeroheight Data
  • List Tables
  • Execute SQL
  • List Migrations
  • Get Logs
  • Generate TypeScript Types
  • Get Project URL
  • Get Publishable API Keys
  • Database Types

Examples:
  npm run mcp-call -- "List Tables"
  npm run mcp-call -- "Execute SQL" '{"query": "SELECT * FROM users LIMIT 5"}'
  npm run mcp-call -- "Query Zeroheight Data" '{"search": "button"}'
  npm run mcp-call -- "scrape-zeroheight-project" --pageUrls '["https://example.com/page1"]'

Note: Arguments can be JSON strings or --key value format for tools that require parameters.
`);
    process.exit(0);
  }

  console.log(`Tool: ${toolName}`);
  console.log(`Args:`, args);

  // Parse arguments - try to parse as JSON first, otherwise use simple key=value
  let toolArgs: Record<string, unknown> = {};
  if (args.length === 1) {
    const arg = args[0];
    // Check if it's key=value format
    if (arg.includes("=")) {
      const [key, value] = arg.split("=");
      if (value === undefined) {
        toolArgs[key] = true; // Boolean flag
      } else if (!isNaN(Number(value))) {
        toolArgs[key] = Number(value); // Number
      } else if (value.startsWith("[") && value.endsWith("]")) {
        // Parse array values - handle simple cases like [url1,url2] or ["url1","url2"]
        try {
          // If it already has quotes, parse directly
          if (value.includes('"')) {
            toolArgs[key] = JSON.parse(value);
          } else {
            // Add quotes around unquoted strings inside the array
            const content = value.slice(1, -1); // Remove [ and ]
            const items = content.split(",").map((item) => item.trim());
            const quotedItems = items.map((item) => {
              // Remove existing quotes if any, then add them back
              item = item.replace(/^["']|["']$/g, "");
              return `"${item}"`;
            });
            toolArgs[key] = JSON.parse(`[${quotedItems.join(",")}]`);
          }
        } catch (e) {
          toolArgs[key] = value; // Fallback to string if parsing fails
        }
      } else {
        toolArgs[key] = value; // String
      }
    } else {
      // Try to parse as JSON first
      try {
        toolArgs = JSON.parse(arg);
      } catch {
        // If not valid JSON, try to parse simple object notation like {limit: 3}
        if (arg.startsWith("{") && arg.endsWith("}")) {
          try {
            // Convert {limit: 3} to {"limit": 3}
            const jsonStr = arg
              .replace(/(\w+):/g, '"$1":') // Add quotes around keys
              .replace(/: ([^,\}\s]+)(?=\s*[,\}])/g, (match, value) => {
                // Check if value is a number, boolean, or null
                if (!isNaN(Number(value))) {
                  return `: ${Number(value)}`; // Keep as number
                } else if (value === "true" || value === "false") {
                  return `: ${value}`; // Keep as boolean
                } else if (value === "null") {
                  return `: ${value}`; // Keep as null
                } else {
                  return `: "${value}"`; // Add quotes for strings
                }
              });
            toolArgs = JSON.parse(jsonStr);
          } catch {
            toolArgs = { query: arg }; // Default fallback
          }
        } else {
          toolArgs = { query: arg }; // Default fallback for SQL-like tools
        }
      }
    }
  } else if (args.length > 1) {
    // Check if the arguments might be a split JSON string (due to PowerShell splitting)
    const combinedArgs = args.join(" ");
    if (combinedArgs.startsWith("{") && combinedArgs.endsWith("}")) {
      try {
        toolArgs = JSON.parse(combinedArgs);
        console.log("✅ Parsed combined JSON arguments");
      } catch {
        // Fall back to --key value or key=value parsing
        // Check if arguments are in --key value format
        const parsedArgs: Record<string, unknown> = {};
        for (let i = 0; i < args.length; i++) {
          const arg = args[i];
          if (arg.startsWith("--")) {
            const key = arg.slice(2); // Remove --
            if (i + 1 < args.length && !args[i + 1].startsWith("--")) {
              // Next arg is the value
              const value = args[i + 1];
              // Try to parse as JSON if it looks like JSON
              if ((value.startsWith("{") && value.endsWith("}")) ||
                  (value.startsWith("[") && value.endsWith("]"))) {
                try {
                  parsedArgs[key] = JSON.parse(value);
                } catch {
                  parsedArgs[key] = value;
                }
              } else if (!isNaN(Number(value))) {
                parsedArgs[key] = Number(value);
              } else if (value === "true") {
                parsedArgs[key] = true;
              } else if (value === "false") {
                parsedArgs[key] = false;
              } else {
                parsedArgs[key] = value;
              }
              i++; // Skip the value in next iteration
            } else {
              // Boolean flag
              parsedArgs[key] = true;
            }
          }
        }
        if (Object.keys(parsedArgs).length > 0) {
          toolArgs = parsedArgs;
          console.log("✅ Parsed --key value arguments");
        } else {
          // Fall back to key=value parsing
          for (const arg of args) {
            const [key, value] = arg.split("=");
            if (value === undefined) {
              toolArgs[key] = true; // Boolean flag
            } else if (!isNaN(Number(value))) {
              toolArgs[key] = Number(value); // Number
            } else if (value.startsWith("[") && value.endsWith("]")) {
              // Parse array values - handle simple cases like [url1,url2]
              try {
                // If it already has quotes, parse directly
                if (value.includes('"')) {
                  toolArgs[key] = JSON.parse(value);
                } else {
                  // Add quotes around unquoted strings inside the array
                  const content = value.slice(1, -1); // Remove [ and ]
                  const items = content.split(",").map((item) => item.trim());
                  const quotedItems = items.map((item) => {
                    // Remove existing quotes if any, then add them back
                    item = item.replace(/^["']|["']$/g, "");
                    return `"${item}"`;
                  });
                  toolArgs[key] = JSON.parse(`[${quotedItems.join(",")}]`);
                }
              } catch {
                toolArgs[key] = value; // Fallback to string if parsing fails
              }
            } else {
              toolArgs[key] = value; // String
            }
          }
        }
      }
    } else {
      // Parse key=value pairs
      for (const arg of args) {
        const [key, value] = arg.split("=");
        if (value === undefined) {
          toolArgs[key] = true; // Boolean flag
        } else if (!isNaN(Number(value))) {
          toolArgs[key] = Number(value); // Number
        } else {
          toolArgs[key] = value; // String
        }
      }
    }
  }

  callMCPTool(toolName, toolArgs);
}
