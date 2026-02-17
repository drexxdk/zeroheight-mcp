import { MCP_URL } from "@/utils/config";

function ensureBase(url: string) {
  try {
    const u = new URL(url);
    return u.origin;
  } catch {
    // fallback: strip trailing /api/mcp
    return url.replace(/\/api\/mcp\/?$/, "");
  }
}

export async function GET() {
  const base = ensureBase(MCP_URL || "http://localhost:3000/api/mcp");

  const payload = {
    issuer: base,
    authorization_endpoint: base + "/oauth/authorize",
    token_endpoint: base + "/oauth/token",
    registration_endpoint: base + "/oauth/register",
    jwks_uri: base + "/.well-known/jwks.json",
    response_types_supported: ["code", "token"],
    subject_types_supported: ["public"],
    id_token_signing_alg_values_supported: ["RS256"],
    token_endpoint_auth_methods_supported: [
      "client_secret_basic",
      "client_secret_post",
      "none",
    ],
  };

  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
