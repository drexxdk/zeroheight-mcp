import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdminClient } from "../../../lib/common";
import { checkRateLimit, auditRequest } from "../../../lib/server/apiHelpers";

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function checkApiKey(req: NextRequest) {
  const key = req.headers.get("x-server-api-key") || "";
  const auth = req.headers.get("authorization") || "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  return (
    key === process.env.MCP_API_KEY ||
    key === process.env.SERVER_API_KEY ||
    bearer === process.env.MCP_API_KEY ||
    bearer === process.env.SERVER_API_KEY
  );
}

export async function POST(req: NextRequest) {
  if (!checkApiKey(req))
    return new NextResponse("Unauthorized", { status: 401 });
  const body = await req.json().catch(() => ({}));
  const apiKey = req.headers.get("x-server-api-key") || "anon";
  if (!checkRateLimit(apiKey)) {
    await auditRequest(req, "/api/jobs POST", { reason: "rate_limited" }, body);
    return new NextResponse("Rate limited", { status: 429 });
  }
  await auditRequest(req, "/api/jobs POST", {}, body);
  const name = (body.name as string) || "unnamed";
  const args = body.args ?? null;

  const supabase = getSupabaseAdminClient();
  if (!supabase)
    return new NextResponse("Supabase admin client not configured", {
      status: 500,
    });

  const id = genId();
  const payload = { id, name, status: "queued", args };

  const { error } = await supabase.from("scrape_jobs").insert([payload]);
  if (error)
    return new NextResponse(String(error.message || error), { status: 500 });

  return NextResponse.json({ id });
}
