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

export async function POST(req: NextRequest) {
  if (!checkApiKey(req))
    return new NextResponse("Unauthorized", { status: 401 });
  const body = await req.json().catch(() => ({}));
  const apiKey = req.headers.get("x-server-api-key") || "anon";
  if (!checkRateLimit(apiKey)) {
    await auditRequest(
      req,
      "/api/jobs/upload POST",
      { reason: "rate_limited" },
      body,
    );
    return new NextResponse("Rate limited", { status: 429 });
  }
  await auditRequest(req, "/api/jobs/upload POST", {}, body);

  const supabase = getSupabaseAdminClient();
  if (!supabase)
    return new NextResponse("Supabase admin client not configured", {
      status: 500,
    });

  const bucket = (body.bucket as string) || "";
  const filename = (body.filename as string) || "";
  const base64 = (body.base64 as string) || "";
  const contentType =
    (body.contentType as string) || "application/octet-stream";

  if (!bucket || !filename || !base64) {
    return new NextResponse("Missing bucket, filename or base64 payload", {
      status: 400,
    });
  }

  try {
    const buffer = Buffer.from(base64, "base64");
    const uploadOptions = {
      cacheControl: "3600",
      upsert: true,
      contentType,
    };
    const { data, error } = await supabase.storage
      .from(bucket)
      .upload(
        filename,
        buffer,
        uploadOptions as unknown as Record<string, unknown>,
      );
    if (error) {
      return new NextResponse(String(error.message || error), { status: 500 });
    }
    const dataObj = data as unknown;
    if (
      dataObj &&
      typeof dataObj === "object" &&
      "path" in (dataObj as Record<string, unknown>)
    ) {
      return NextResponse.json({
        path: (dataObj as Record<string, unknown>)["path"],
      });
    }
    return NextResponse.json({ path: null });
  } catch (e) {
    return new NextResponse(String(e instanceof Error ? e.message : e), {
      status: 500,
    });
  }
}
