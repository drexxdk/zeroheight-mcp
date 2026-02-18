// Provide minimal OpenID Connect discovery and JWKS endpoints for local dev.
// mcp-remote expects valid discovery metadata at /.well-known/openid-configuration.

function jsonResponse(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const pathname = url.pathname;

    if (pathname.endsWith("/openid-configuration")) {
      const origin = `${url.protocol}//${url.host}`;
      return jsonResponse({
        issuer: origin,
        authorization_endpoint: `${origin}/api/auth/authorize`,
        token_endpoint: `${origin}/api/auth/token`,
        jwks_uri: `${origin}/.well-known/jwks.json`,
        response_types_supported: ["code", "token", "id_token"],
        subject_types_supported: ["public"],
        id_token_signing_alg_values_supported: ["RS256"],
      });
    }

    if (pathname.endsWith("/jwks.json") || pathname.endsWith("/jwks")) {
      return jsonResponse({ keys: [] });
    }

    // Default: return a simple JSON object for other well-known paths
    return jsonResponse({});
  } catch (e) {
    return jsonResponse({ error: String(e) }, 500);
  }
}

export async function POST(request: Request) {
  return GET(request);
}

export async function OPTIONS(request: Request) {
  return GET(request as unknown as Request);
}

export async function HEAD(request: Request) {
  return GET(request as unknown as Request);
}
