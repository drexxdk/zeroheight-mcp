import crypto from "crypto";
import { HASH_TRUNCATE_LENGTH } from "@/utils/config";

export function normalizeImageUrl({ src }: { src: string }): string {
  try {
    const u = new URL(src);
    return `${u.protocol}//${u.hostname}${u.pathname}`;
  } catch {
    return src;
  }
}

export function hashFilenameFromUrl({
  url,
  ext = "jpg",
}: {
  url: string;
  ext?: string;
}): string {
  const normalized = normalizeImageUrl({ src: url });
  const h = crypto
    .createHash("md5")
    .update(normalized)
    .digest("hex")
    .substring(0, HASH_TRUNCATE_LENGTH);
  return `${h}.${ext}`;
}

// Note: uploading via the server API was removed in favor of direct admin
// Supabase uploads. If fallback upload is needed, `storageHelper` will call
// the admin client directly.
