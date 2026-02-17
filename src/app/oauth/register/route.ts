export async function POST(request: Request) {
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

    // Minimal dynamic client registration response for local testing
    const clientId = "mcp-local-client";
    const clientSecret = "mcp-local-secret";
    const resp = {
      client_id: clientId,
      client_secret: clientSecret,
      client_id_issued_at: Math.floor(Date.now() / 1000),
      client_secret_expires_at: 0,
      token_endpoint_auth_method: "client_secret_post",
      redirect_uris: [],
    };

    return new Response(JSON.stringify(resp), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    });
  } catch {
    return new Response(JSON.stringify({ error: "server_error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
