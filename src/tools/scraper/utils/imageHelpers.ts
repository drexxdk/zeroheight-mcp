import crypto from "crypto";
import { config } from "@/utils/config";

export type NormalizeImageUrlOptions = { src: string };
export function normalizeImageUrl({ src }: NormalizeImageUrlOptions): string {
  try {
    const u = new URL(src);
    return `${u.protocol}//${u.hostname}${u.pathname}`;
  } catch {
    return src;
  }
}
export type HashFilenameOptions = { url: string; ext?: string };

export function hashFilenameFromUrl({
  url,
  ext = "jpg",
}: HashFilenameOptions): string {
  const normalized = normalizeImageUrl({ src: url });
  const h = crypto
    .createHash("md5")
    .update(normalized)
    .digest("hex")
    .substring(0, config.scraper.defaultHashTruncate);
  return `${h}.${ext}`;
}

// Note: uploading via the server API was removed in favor of direct admin
// Supabase uploads. If fallback upload is needed, `storageHelper` will call
// the admin client directly.
