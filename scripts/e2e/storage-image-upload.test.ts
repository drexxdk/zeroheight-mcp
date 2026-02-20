import { config as dotenvConfig } from "dotenv";
import { getSupabaseClient } from "@/utils/common";
import { isRecord } from "../../src/utils/common/typeGuards";

dotenvConfig({ path: ".env.local" });

function extFromContentType(ct: string | null): string {
  if (!ct) return "png";
  if (ct.includes("jpeg")) return "jpg";
  if (ct.includes("png")) return "png";
  if (ct.includes("webp")) return "webp";
  if (ct.includes("svg")) return "svg";
  return "bin";
}

async function downloadAndUpload(
  url: string,
  BUCKET: string,
  TEST_BUCKET: string,
): Promise<{ path: string; publicUrl: string } | null> {
  const client = getSupabaseClient();
  if (!client) throw new Error("Supabase client not configured");

  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Fetch failed: ${resp.status}`);
  const buffer = Buffer.from(await resp.arrayBuffer());
  const contentType =
    resp.headers.get("content-type") || "application/octet-stream";
  const ext = extFromContentType(contentType);

  // Prefer a test bucket to avoid touching production images.
  const listResult = await client.storage.listBuckets();
  const buckets = listResult.data;
  const targetBucket = buckets?.some((b) => b.name === TEST_BUCKET)
    ? TEST_BUCKET
    : null;

  if (!targetBucket) {
    console.log(
      `Test bucket ${TEST_BUCKET} not found; skipping upload to avoid touching production bucket ${BUCKET}`,
    );
    return null as { path: string; publicUrl: string } | null;
  }

  const uploader = client;
  const filename = `test_image_${Date.now()}_${Math.floor(Math.random() * 1e6)}.${ext}`;

  const result = await uploader.storage
    .from(targetBucket)
    .upload(filename, buffer, {
      upsert: false,
      contentType,
    });

  const uploadError = isRecord(result) ? result.error : undefined;
  const uploadData =
    isRecord(result) && isRecord(result.data) ? result.data : undefined;

  if (uploadError) {
    if (uploadError instanceof Error) throw uploadError;
    throw new Error(String(uploadError));
  }

  const storagePath = uploadData?.path;
  if (!storagePath) throw new Error("Upload did not return a storage path");

  const { data: urlData } = client.storage
    .from(BUCKET)
    .getPublicUrl(storagePath);
  return { path: storagePath, publicUrl: urlData.publicUrl };
}

async function run(): Promise<void> {
  const { IMAGE_BUCKET } = await import("@/utils/config");
  const BUCKET = IMAGE_BUCKET;
  const TEST_BUCKET = `${BUCKET}_test`;
  try {
    const testUrls = [
      "https://httpbin.org/image/png",
      "https://picsum.photos/200/200",
    ];
    for (const url of testUrls) {
      console.log("Trying:", url);
      try {
        const res = await downloadAndUpload(url, BUCKET, TEST_BUCKET);
        if (res) {
          console.log("Uploaded:", res.path);
          console.log("Public URL:", res.publicUrl);
          return;
        }
        console.log("Upload skipped (no test bucket or upload returned null)");
      } catch (err) {
        console.error(
          "Attempt failed:",
          err instanceof Error ? err.message : err,
        );
      }
    }
    console.error("All test uploads failed");
  } catch (err) {
    console.error("Runner failed:", err);
    process.exitCode = 1;
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
