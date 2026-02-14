import crypto from "crypto";

export function normalizeImageUrl(src: string): string {
  try {
    const u = new URL(src);
    return `${u.protocol}//${u.hostname}${u.pathname}`;
  } catch {
    return src;
  }
}

export function hashFilenameFromUrl(url: string, ext = "jpg"): string {
  const h = crypto.createHash("md5").update(url).digest("hex").substring(0, 8);
  return `${h}.${ext}`;
}

import { uploadFileToServer } from "./serverApi";

export async function uploadViaServer(
  bucket: string,
  filename: string,
  base64: string,
  contentType = "application/octet-stream",
) {
  const res = await uploadFileToServer(bucket, filename, base64, contentType);
  if (res && typeof res.path === "string") return res.path;
  throw new Error("server upload returned no path");
}
