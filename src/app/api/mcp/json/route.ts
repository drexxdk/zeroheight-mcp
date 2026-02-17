import { NextRequest } from "next/server";
import { authenticateRequest } from "@/utils/auth";
import { mcpHandler } from "../../[transport]/route";
import { MCP_CORS_ORIGIN, MCP_URL } from "@/utils/config";

const DEFAULT_CORS = {
  // Use the centralized config value for CORS origin (no direct process.env access).
  "Access-Control-Allow-Origin": MCP_CORS_ORIGIN,
  "Access-Control-Allow-Headers":
    "Authorization, X-API-Key, Content-Type, Accept",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function withCors(headers: Record<string, string>) {
  return { ...DEFAULT_CORS, ...headers };
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: withCors({}),
  });
}

export async function POST(request: NextRequest) {
  const auth = authenticateRequest({ request });

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
        headers: withCors({ "Content-Type": "application/json" }),
      },
    );
  }

  // Force JSON-only Accept header so the handler returns a non-streaming JSON response
  const forwardedHeaders = new Headers(request.headers as HeadersInit);
  // Ensure MCP handler sees both JSON and SSE acceptable so it doesn't reject
  forwardedHeaders.set("accept", "application/json, text/event-stream");

  // Read body (support application/json or raw text)
  const contentType = request.headers.get("content-type") || "";
  let body: unknown = null;
  if (contentType.includes("application/json")) {
    body = await request.json().catch(() => null);
  } else {
    const txt = await request.text().catch(() => "");
    try {
      body = JSON.parse(txt);
    } catch {
      body = txt;
    }
  }

  // Forward to the real MCP route so the handler sees the expected path
  const target = MCP_URL || request.url;
  const newReq = new Request(target, {
    method: request.method,
    headers: forwardedHeaders,
    body: JSON.stringify(body),
  });

  // Call the existing handler and aggregate the response as JSON
  const res = await mcpHandler(newReq as unknown as NextRequest);

  // Return as application/json to callers (no SSE streaming)
  const text = await res.text();

  // If the handler returned an SSE stream payload (event/data lines),
  // extract the JSON 'data:' payload and return it as pure JSON.
  const sseDataMatches = Array.from(text.matchAll(/^data:\s*(.*)$/gim)).map(
    (m) => m[1],
  );

  if (sseDataMatches.length > 0) {
    // Join multiple data lines (if any) and attempt to parse
    const joined = sseDataMatches.join("\n");
    try {
      JSON.parse(joined);
      return new Response(joined, {
        status: res.status,
        headers: withCors({ "Content-Type": "application/json" }),
      });
    } catch {
      // fallthrough to returning raw text if parse fails
    }
  }

  return new Response(text, {
    status: res.status,
    headers: withCors({ "Content-Type": "application/json" }),
  });
}

export { POST as GET };
