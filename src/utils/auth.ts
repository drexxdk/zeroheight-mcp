import { NextRequest } from "next/server";
import { ZEROHEIGHT_MCP_ACCESS_TOKEN } from "./config";

export function authenticateRequest({ request }: { request: NextRequest }): {
  isValid: boolean;
  error?: string;
} {
  const serverKey = ZEROHEIGHT_MCP_ACCESS_TOKEN;

  // Check for API key in headers or query parameters
  const authHeader = request.headers.get("authorization");
  const apiKeyHeader = request.headers.get("x-api-key");
  const apiKeyQuery = request.nextUrl.searchParams.get("api_key");

  const providedKey =
    authHeader?.replace("Bearer ", "") || apiKeyHeader || apiKeyQuery;

  if (!providedKey) {
    return {
      isValid: false,
      error:
        "API key required. Provide via:\n" +
        "- Authorization header: 'Authorization: Bearer <your-key>'\n" +
        "- X-API-Key header: 'X-API-Key: <your-key>'\n" +
        "- Query parameter: '?api_key=<your-key>'\n",
    };
  }

  // If a server-side ZEROHEIGHT_MCP_ACCESS_TOKEN is configured, require it to match.
  // Otherwise (local/dev), accept any provided key so tools like `mcp-remote`
  // can signal possession of a key without requiring server config.
  if (serverKey && providedKey !== serverKey) {
    return { isValid: false, error: "Invalid API key" };
  }

  return { isValid: true };
}
