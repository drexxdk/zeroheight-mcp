import { config as dotenvConfig } from "dotenv";
import { getSupabaseClient } from "@/utils/common";

dotenvConfig({ path: ".env.local" });

let BUCKET: string;

function extFromContentType(ct: string | null) {
  if (!ct) return "png";
  if (ct.includes("jpeg")) return "jpg";
  if (ct.includes("png")) return "png";
  if (ct.includes("webp")) return "webp";
  if (ct.includes("svg")) return "svg";
  return "bin";
}

async function downloadAndUpload(url: string) {
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
  const testBucketName = `${BUCKET}_test`;
  const targetBucket = buckets?.some((b) => b.name === testBucketName)
    ? testBucketName
    : null;

  if (!targetBucket) {
    console.log(
      `Test bucket ${testBucketName} not found; skipping upload to avoid touching production bucket ${BUCKET}`,
    );
    return null as unknown as { path: string; publicUrl: string };
  }

  const uploader = client;
  const filename = `test_image_${Date.now()}_${Math.floor(Math.random() * 1e6)}.${ext}`;

  const result = await uploader.storage
    .from(targetBucket)
    .upload(filename, buffer, {
      upsert: false,
      contentType,
    });

  const uploadError = (result as unknown as { error?: unknown }).error;
  const uploadData = (result as unknown as { data?: { path?: string } }).data;

  if (uploadError) throw uploadError as Error;

  const storagePath = uploadData?.path;
  if (!storagePath) throw new Error("Upload did not return a storage path");

  const { data: urlData } = client.storage
    .from(BUCKET)
    .getPublicUrl(storagePath);
  return { path: storagePath, publicUrl: urlData.publicUrl };
}

async function run() {
  const cfg = await import("@/utils/config");
  BUCKET = cfg.IMAGE_BUCKET;
  const TEST_BUCKET = `${BUCKET}_test`;

  // Override the const TEST_BUCKET usage below by shadowing variable
  const localTestBucket = TEST_BUCKET;
  void localTestBucket;
  try {
    const testUrls = [
      "https://httpbin.org/image/png",
      "https://picsum.photos/200/200",
    ];
    for (const url of testUrls) {
      console.log("Trying:", url);
      try {
        const res = await downloadAndUpload(url);
        console.log("Uploaded:", res.path);
        console.log("Public URL:", res.publicUrl);
        return;
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
