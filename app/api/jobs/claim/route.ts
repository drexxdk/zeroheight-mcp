import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdminClient } from "../../../../lib/common";
import {
  checkRateLimit,
  auditRequest,
} from "../../../../lib/server/apiHelpers";

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

  const apiKey = req.headers.get("x-server-api-key") || "anon";
  if (!checkRateLimit(apiKey)) {
    await auditRequest(req, "/api/jobs/claim POST", { reason: "rate_limited" });
    return new NextResponse("Rate limited", { status: 429 });
  }
  await auditRequest(req, "/api/jobs/claim POST");

  const supabase = getSupabaseAdminClient();
  if (!supabase)
    return new NextResponse("Supabase admin client not configured", {
      status: 500,
    });

  // Find a queued job and claim it
  const { data: rows, error } = await supabase
    .from("scrape_jobs")
    .select("*")
    .eq("status", "queued")
    .order("created_at", { ascending: true })
    .limit(1);

  if (error)
    return new NextResponse(String(error.message || error), { status: 500 });
  if (!rows || rows.length === 0)
    return new NextResponse(null, { status: 204 });

  const job = rows[0];
  const { error: updErr } = await supabase
    .from("scrape_jobs")
    .update({ status: "running", started_at: new Date().toISOString() })
    .eq("id", job.id);

  if (updErr)
    return new NextResponse(String(updErr.message || updErr), { status: 500 });

  return NextResponse.json({
    ...job,
    status: "running",
    started_at: new Date().toISOString(),
  });
}
