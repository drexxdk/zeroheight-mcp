#!/usr/bin/env node

/**
 * Standardized MCP Tool Caller
 * Ensures correct headers and response handling for all MCP API calls
 */

const API_URL: string =
  process.env.MCP_API_URL || "http://localhost:3000/api/mcp";
const API_KEY: string | undefined = process.env.MCP_API_KEY;

console.log(`API_URL: ${API_URL}`);
console.log(`API_KEY set: ${!!API_KEY}`);

if (!API_KEY) {
  console.error("❌ Error: MCP_API_KEY environment variable not set");
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

Note: Arguments should be valid JSON strings for tools that require parameters.
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
      } else {
        toolArgs[key] = value; // String
      }
    } else {
      // Try to parse as JSON
      try {
        toolArgs = JSON.parse(arg);
      } catch {
        // If not valid JSON and not key=value, treat as single argument
        // For backward compatibility, try to parse simple object notation like {limit: 3}
        if (arg.startsWith("{") && arg.endsWith("}")) {
          try {
            // Convert {limit: 3} to {"limit": 3}
            const jsonStr = arg
              .replace(/(\w+):/g, '"$1":') // Add quotes around keys
              .replace(/: (true|false|null)/g, ": $1") // Keep boolean/null values as is
              .replace(/: (\d+(?:\.\d+)?)/g, ": $1") // Keep number values as is
              .replace(/: ([^,\}\s]+)/g, ': "$1"'); // Add quotes around other values (strings)
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

  callMCPTool(toolName, toolArgs);
}
