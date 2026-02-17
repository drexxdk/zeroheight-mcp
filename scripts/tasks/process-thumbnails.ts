import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import {
  claimNextJob,
  appendJobLog,
  finishJob,
  type JobRecord,
} from "../../src/tools/tasks/utils/jobStore";
import { getSupabaseAdminClient } from "../../src/utils/common";
import sharp from "sharp";
import {
  IMAGE_BUCKET,
  STORAGE_CACHE_CONTROL_SEC,
} from "../../src/utils/config";

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function processGenerateThumbnail(job: JobRecord) {
  const jobId = job.id as string;
  try {
    await appendJobLog({
      jobId,
      line: `Starting thumbnail job for ${JSON.stringify(job.args)}`,
    });
    const args = (job.args || {}) as Record<string, unknown>;
    const url = typeof args.url === "string" ? args.url : undefined;
    const key = typeof args.key === "string" ? args.key : undefined;
    if (!url) throw new Error("Missing url in job args");

    // fetch image
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 20000);
    let resp: Response;
    try {
      resp = await fetch(url, { signal: controller.signal });
    } finally {
      clearTimeout(t);
    }
    if (!resp.ok) throw new Error(`Fetch failed ${resp.status}`);
    const buf = Buffer.from(await resp.arrayBuffer());

    // resize & convert
    const out = await sharp(buf)
      .resize(500, undefined, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer();

    // upload via admin client
    const admin = getSupabaseAdminClient();
    if (!admin)
      throw new Error(
        "No Supabase admin client configured (set SUPABASE_SERVICE_ROLE_KEY)",
      );

    const destKey = key || `thumbnails/${Date.now().toString(36)}.webp`;
    const { error: uploadError } = await admin.storage
      .from(IMAGE_BUCKET)
      .upload(destKey, out, {
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
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    try {
      await appendJobLog({ jobId, line: `Error: ${msg}` });
      await finishJob({ jobId, success: false, errorMsg: msg });
    } catch {}
  }
}

async function main() {
  console.log("Starting thumbnail worker (claims generate-thumbnail jobs)...");
  while (true) {
    try {
      const job = await claimNextJob();
      if (!job) {
        await sleep(3000);
        continue;
      }
      console.log(`Claimed job ${job.id} name=${job.name}`);
      if (job.name === "generate-thumbnail") {
        await processGenerateThumbnail(job);
      } else {
        await appendJobLog({
          jobId: job.id,
          line: `Unsupported job type: ${job.name}`,
        });
        await finishJob({
          jobId: job.id,
          success: false,
          errorMsg: "unsupported job type",
        });
      }
    } catch (e) {
      console.error("Worker loop error:", e);
      await sleep(3000);
    }
  }
}

main().catch((e) => {
  console.error("Worker failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});
