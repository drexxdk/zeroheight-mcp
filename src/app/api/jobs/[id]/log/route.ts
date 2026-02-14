import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/common";
import { checkRateLimit, auditRequest } from "@/lib/server/apiHelpers";

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
  const line = (body.line as string) || "";

  const apiKey = req.headers.get("x-server-api-key") || "anon";
  if (!checkRateLimit(apiKey)) {
    await auditRequest(
      req,
      "/api/jobs/:id/log POST",
      { reason: "rate_limited" },
      body,
    );
    return new NextResponse("Rate limited", { status: 429 });
  }
  await auditRequest(req, "/api/jobs/:id/log POST", {}, body);

  const supabase = getSupabaseAdminClient();
  if (!supabase)
    return new NextResponse("Supabase admin client not configured", {
      status: 500,
    });

  const resolvedParams =
    typeof (params as { id?: string }).id === "string"
      ? (params as { id: string })
      : await (params as Promise<{ id: string }>);
  const id = resolvedParams.id;

  const { data, error } = await supabase
    .from("scrape_jobs")
    .select("logs")
    .eq("id", id)
    .single();
  if (error)
    return new NextResponse(String(error.message || error), { status: 500 });

  const current = (data && (data as { logs?: string }).logs) || "";
  const updated = current + (current ? "\n" : "") + line;

  const { error: updateErr } = await supabase
    .from("scrape_jobs")
    .update({ logs: updated })
    .eq("id", id);
  if (updateErr)
    return new NextResponse(String(updateErr.message || updateErr), {
      status: 500,
    });

  return NextResponse.json({ ok: true });
}
