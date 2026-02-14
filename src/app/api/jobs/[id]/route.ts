import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/common";
import { checkRateLimit, auditRequest } from "@/lib/server/apiHelpers";

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

export async function GET(req: NextRequest, { params }: { params: unknown }) {
  if (!checkApiKey(req))
    return new NextResponse("Unauthorized", { status: 401 });

  const apiKey = req.headers.get("x-server-api-key") || "anon";
  if (!checkRateLimit(apiKey)) {
    await auditRequest(req, "/api/jobs/:id GET", { reason: "rate_limited" });
    return new NextResponse("Rate limited", { status: 429 });
  }
  await auditRequest(req, "/api/jobs/:id GET");

  const resolvedParams = (await params) as { id: string };
  const id = resolvedParams.id;
  const supabase = getSupabaseAdminClient();
  if (!supabase)
    return new NextResponse("Supabase admin client not configured", {
      status: 500,
    });

  const { data, error } = await supabase
    .from("scrape_jobs")
    .select("*")
    .eq("id", id)
    .single();
  if (error)
    return new NextResponse(String(error.message || error), { status: 500 });
  return NextResponse.json(data);
}
