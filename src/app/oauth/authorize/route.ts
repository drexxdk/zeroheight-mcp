export async function GET() {
  // Minimal authorize endpoint: return a simple HTML page explaining this is a local test endpoint.
  const html = `<!doctype html><html><body><h1>MCP Local OAuth Authorize</h1><p>This server provides a minimal authorize endpoint for local testing only.</p></body></html>`;
  return new Response(html, {
    status: 200,
    headers: { "Content-Type": "text/html" },
  });
}
