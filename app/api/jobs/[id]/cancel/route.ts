import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdminClient } from "../../../../../lib/common";
import {
  checkRateLimit,
  auditRequest,
} from "../../../../../lib/server/apiHelpers";

async function checkApiKey(req: NextRequest) {
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

export async function POST(req: NextRequest, { params }: { params: unknown }) {
  if (!(await checkApiKey(req)))
    return new NextResponse("Unauthorized", { status: 401 });

  const body = await req.json().catch(() => ({}));

  const apiKey = req.headers.get("x-server-api-key") || "anon";
  if (!checkRateLimit(apiKey)) {
    await auditRequest(
      req,
      "/api/jobs/:id/cancel POST",
      { reason: "rate_limited" },
      body,
    );
    return new NextResponse("Rate limited", { status: 429 });
  }
  await auditRequest(req, "/api/jobs/:id/cancel POST", {}, body);

  const supabase = getSupabaseAdminClient();
  if (!supabase)
    return new NextResponse("Supabase admin client not configured", {
      status: 500,
    });

  // `params` may be a Promise in Next; await it to avoid synchronous access
  const resolvedParams = (await params) as { id: string };
  const id = resolvedParams.id;

  const payload: Record<string, unknown> = {
    finished_at: new Date().toISOString(),
    status: "cancelled",
  };

  const { error } = await supabase
    .from("scrape_jobs")
    .update(payload)
    .eq("id", id);
  if (error)
    return new NextResponse(String(error.message || error), { status: 500 });

  return NextResponse.json({ ok: true });
}
