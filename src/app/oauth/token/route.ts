import { MCP_API_KEY } from "@/utils/config";

export async function POST(request: Request) {
  // Minimal token endpoint: accept client credentials or return a token
  // if the request includes the configured MCP API key as "api_key" in body
  try {
    const contentType = request.headers.get("content-type") || "";
    let body: unknown = {};
    if (contentType.includes("application/json")) body = await request.json();
    else {
      const txt = await request.text().catch(() => "");
      try {
        body = JSON.parse(txt);
      } catch {
        body = {};
      }
    }

    const obj =
      typeof body === "object" && body !== null
        ? (body as Record<string, unknown>)
        : {};
    const apiKey =
      typeof obj["api_key"] === "string"
        ? (obj["api_key"] as string)
        : undefined;

    if (apiKey && apiKey === MCP_API_KEY) {
      return new Response(
        JSON.stringify({
          access_token: "mcp-local",
          token_type: "bearer",
          expires_in: 3600,
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    return new Response(JSON.stringify({ error: "invalid_request" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  } catch {
    return new Response(JSON.stringify({ error: "server_error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
