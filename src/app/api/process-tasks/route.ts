import { NextResponse } from "next/server";
import sharp from "sharp";
import { getSupabaseAdminClient } from "@/utils/common";
import {
  IMAGE_BUCKET,
  STORAGE_CACHE_CONTROL_SEC,
  ZEROHEIGHT_PROJECT_URL,
} from "@/utils/config";
import {
  claimNextJob,
  appendJobLog,
  finishJob,
  type JobRecord,
} from "@/tools/tasks/utils/jobStore";
import { MCP_API_KEY } from "@/utils/config";

const HEADER_NAME = "x-worker-key";

async function processGenerateThumbnail(job: JobRecord) {
  const jobId = job.id as string;
  try {
    await appendJobLog({ jobId, line: `Starting thumbnail job ${jobId}` });
    const args = (job.args || {}) as Record<string, unknown>;
    const url = typeof args.url === "string" ? args.url : undefined;
    const key = typeof args.key === "string" ? args.key : undefined;
    if (!url) throw new Error("Missing url in job args");

    // fetch original image with timeout, retries, and browser-like headers to
    // avoid 403s from restrictive hosts.
    const maxFetchAttempts = 3;
    let buf: Buffer | null = null;
    for (let attempt = 1; attempt <= maxFetchAttempts; attempt++) {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), 20000);
      try {
        const headers: Record<string, string> = {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
          Accept: "image/*,*/*;q=0.8",
        };
        if (ZEROHEIGHT_PROJECT_URL) headers.Referer = ZEROHEIGHT_PROJECT_URL;

        const resp = await fetch(url, {
          signal: controller.signal,
          headers,
          // allow redirects by default
        });
        if (resp.ok) {
          buf = Buffer.from(await resp.arrayBuffer());
          clearTimeout(t);
          break;
        }
        const status = resp.status;
        // log failed attempt
        await appendJobLog({
          jobId,
          line: `fetch attempt=${attempt} failed status=${status}`,
        });
        if (attempt === maxFetchAttempts)
          throw new Error(`failed fetch ${status}`);
      } catch (e) {
        await appendJobLog({
          jobId,
          line: `fetch attempt=${attempt} error=${String(e)}`,
        });
        if (attempt === maxFetchAttempts) throw e;
        // small backoff
        await new Promise((r) => setTimeout(r, 500 * attempt));
      } finally {
        clearTimeout(t);
      }
    }
    if (!buf) throw new Error("failed to fetch image");

    const resized = await sharp(buf)
      .resize(500, undefined, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer();

    const admin = getSupabaseAdminClient();
    if (!admin) throw new Error("no supabase admin client configured");

    const destKey = key
      ? key
      : `thumbnails/${cryptoHash(url).slice(0, 12)}.webp`;

    const { error: uploadError } = await admin.storage
      .from(IMAGE_BUCKET)
      .upload(destKey, resized, {
        contentType: "image/webp",
        cacheControl: String(STORAGE_CACHE_CONTROL_SEC),
        upsert: true,
      });
    if (uploadError) throw uploadError;

    const { data } = admin.storage.from(IMAGE_BUCKET).getPublicUrl(destKey);
    await appendJobLog({ jobId, line: `Uploaded thumbnail to ${destKey}` });
    await finishJob({
      jobId,
      success: true,
      result: { path: destKey, publicUrl: data?.publicUrl ?? null },
    });
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    try {
      await appendJobLog({ jobId, line: `Error: ${msg}` });
      await finishJob({ jobId, success: false, errorMsg: msg });
    } catch {}
    return { ok: false, error: msg };
  }
}

function cryptoHash(input: string) {
  // small local helper to generate deterministic suffixes without importing crypto
  let h = 2166136261 >>> 0;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h.toString(36);
}

export async function POST(req: Request) {
  try {
    const provided = req.headers.get(HEADER_NAME) || "";
    const secret = MCP_API_KEY || "";
    if (!secret || provided !== secret) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}) as Record<string, unknown>);
    const limit =
      typeof body.limit === "number" && body.limit > 0
        ? Math.min(body.limit, 20)
        : 5;

    // Ensure admin client is configured — claiming and finishing jobs requires
    // service-role privileges. Return a clear error if it's missing so deploy
    // environments can be corrected quickly.
    const admin = getSupabaseAdminClient();
    if (!admin) {
      return NextResponse.json(
        {
          error:
            "supabase admin client not configured (SUPABASE_SERVICE_ROLE_KEY missing)",
        },
        { status: 500 },
      );
    }

    let processed = 0;
    for (let i = 0; i < limit; i++) {
      const job = await claimNextJob();
      if (!job) {
        if (i === 0) {
          // no job claimed on first attempt — surface this in logs so user
          // knows the queue is empty or claim failed due to RLS/admin issues.
          console.log("process-tasks: no claimable jobs found");
        }
        break;
      }
      if (job.name !== "generate-thumbnail") {
        await appendJobLog({
          jobId: job.id as string,
          line: `Skipping unsupported job ${job.name}`,
        });
        await finishJob({
          jobId: job.id as string,
          success: false,
          errorMsg: "unsupported job type",
        });
        continue;
      }
      // process
      const res = await processGenerateThumbnail(job);
      if (res.ok) processed++;
    }

    return NextResponse.json({ ok: true, processed });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
