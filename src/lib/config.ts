// Centralized runtime configuration (env-driven) for the project
export const IMAGE_BUCKET =
  process.env.SUPABASE_IMAGE_BUCKET ||
  process.env.NEXT_PUBLIC_SUPABASE_IMAGE_BUCKET ||
  "zeroheight-images";

export const EXCLUDE_IMAGE_FORMATS = (
  (process.env.IMAGE_EXCLUDE_FORMATS as string | undefined) || "svg,gif"
)
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

export const ALLOWED_MIME_TYPES = (
  (process.env.SUPABASE_ALLOWED_MIME_TYPES as string | undefined) ||
  "image/png,image/jpeg,image/jpg,image/webp"
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

export const IMAGE_MAX_DIM = parseInt(process.env.IMAGE_MAX_DIM || "600", 10);
export const IMAGE_JPEG_QUALITY = parseInt(
  process.env.IMAGE_JPEG_QUALITY || "80",
  10,
);

const config = {
  IMAGE_BUCKET,
  EXCLUDE_IMAGE_FORMATS,
  ALLOWED_MIME_TYPES,
  IMAGE_MAX_DIM,
  IMAGE_JPEG_QUALITY,
};

export default config;
