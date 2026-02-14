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
  const normalized = normalizeImageUrl(url);
  const h = crypto
    .createHash("md5")
    .update(normalized)
    .digest("hex")
    .substring(0, 8);
  return `${h}.${ext}`;
}

// Note: uploading via the server API was removed in favor of direct admin
// Supabase uploads. If fallback upload is needed, `storageHelper` will call
// the admin client directly.
