import { NextRequest } from 'next/server';

export function authenticateRequest(request: NextRequest): { isValid: boolean; error?: string } {
  const apiKey = process.env.MCP_API_KEY;

  if (!apiKey) {
    return { isValid: false, error: "Server configuration error: MCP_API_KEY not set" };
  }

  // Check for API key in headers or query parameters
  const authHeader = request.headers.get('authorization');
  const apiKeyHeader = request.headers.get('x-api-key');
  const apiKeyQuery = request.nextUrl.searchParams.get('api_key');

  const providedKey = authHeader?.replace('Bearer ', '') || apiKeyHeader || apiKeyQuery;

  if (!providedKey) {
    return {
      isValid: false,
      error: "API key required. Provide via:\n" +
             "- Authorization header: 'Authorization: Bearer <your-key>'\n" +
             "- X-API-Key header: 'X-API-Key: <your-key>'\n" +
             "- Query parameter: '?api_key=<your-key>'\n" +
             "For PowerShell: Set $env:MCP_API_KEY first, then use -Headers @{'X-API-Key'=$env:MCP_API_KEY}"
    };
  }

  if (providedKey !== apiKey) {
    return { isValid: false, error: "Invalid API key" };
  }

  return { isValid: true };
}