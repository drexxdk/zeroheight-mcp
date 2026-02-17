export async function GET() {
  // Minimal JWKS; no real keys required for local discovery.
  const payload = { keys: [] };
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
