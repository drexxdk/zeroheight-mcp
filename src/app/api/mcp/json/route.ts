import { NextRequest } from "next/server";
import { authenticateRequest } from "@/utils/auth";
import { mcpHandler } from "../../[transport]/route";

const DEFAULT_CORS = {
  // Recommend a sane default for local development instead of allowing all origins.
  // Producers should set MCP_CORS_ORIGIN to their production host (e.g. https://app.example.com).
  "Access-Control-Allow-Origin":
    process.env.MCP_CORS_ORIGIN || "http://localhost:3000",
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
  forwardedHeaders.set("accept", "application/json");

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

  const newReq = new Request(request.url, {
    method: request.method,
    headers: forwardedHeaders,
    body: JSON.stringify(body),
  });

  // Call the existing handler and aggregate the response as JSON
  const res = await mcpHandler(newReq as unknown as NextRequest);

  // Return as application/json to callers (no SSE streaming)
  const text = await res.text();
  return new Response(text, {
    status: res.status,
    headers: withCors({ "Content-Type": "application/json" }),
  });
}

export { POST as GET };
