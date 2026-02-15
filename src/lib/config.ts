// Centralized runtime configuration (env-driven) for the project.
// This file centralizes defaults so env usage is discoverable in one place.

export const SCRAPER_CONCURRENCY = Number(process.env.SCRAPER_CONCURRENCY || 6);
export const SCRAPER_IDLE_TIMEOUT_MS = Number(
  process.env.SCRAPER_IDLE_TIMEOUT_MS || 1000,
);
export const SCRAPER_SEED_PREFETCH_CONCURRENCY = Number(
  process.env.SCRAPER_SEED_PREFETCH_CONCURRENCY || 4,
);
export const SCRAPER_PAGE_UPSERT_CHUNK = Number(
  process.env.SCRAPER_PAGE_UPSERT_CHUNK || 200,
);
export const SCRAPER_IMAGE_INSERT_CHUNK = Number(
  process.env.SCRAPER_IMAGE_INSERT_CHUNK || 500,
);
export const SCRAPER_DEBUG = (process.env.SCRAPER_DEBUG || "false") === "true";
export const SCRAPER_IMAGE_CONCURRENCY = Number(
  process.env.SCRAPER_IMAGE_CONCURRENCY || 4,
);

export const ZEROHEIGHT_PROJECT_URL = process.env.ZEROHEIGHT_PROJECT_URL || "";
export const ZEROHEIGHT_PROJECT_PASSWORD =
  process.env.ZEROHEIGHT_PROJECT_PASSWORD || undefined;

export const MCP_API_KEY = process.env.MCP_API_KEY || "";

export const NEXT_PUBLIC_SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || "";
export const SUPABASE_ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN || "";
export const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || "";

export const IMAGE_BUCKET =
  process.env.SUPABASE_IMAGE_BUCKET ||
  process.env.NEXT_PUBLIC_SUPABASE_IMAGE_BUCKET ||
  "images";

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

export const SERVER_RATE_LIMIT_TOKENS = Number(
  process.env.SERVER_RATE_LIMIT_TOKENS || 60,
);

export const SCRAPE_TEST_PAGE_URLS = process.env.SCRAPE_TEST_PAGE_URLS || "";

const config = {
  SCRAPER_CONCURRENCY,
  SCRAPER_IDLE_TIMEOUT_MS,
  SCRAPER_SEED_PREFETCH_CONCURRENCY,
  SCRAPER_PAGE_UPSERT_CHUNK,
  SCRAPER_IMAGE_INSERT_CHUNK,
  SCRAPER_DEBUG,
  SCRAPER_IMAGE_CONCURRENCY,
  ZEROHEIGHT_PROJECT_URL,
  ZEROHEIGHT_PROJECT_PASSWORD,
  MCP_API_KEY,
  NEXT_PUBLIC_SUPABASE_URL,
  SUPABASE_ACCESS_TOKEN,
  SUPABASE_SERVICE_ROLE_KEY,
  IMAGE_BUCKET,
  EXCLUDE_IMAGE_FORMATS,
  ALLOWED_MIME_TYPES,
  IMAGE_MAX_DIM,
  IMAGE_JPEG_QUALITY,
  SERVER_RATE_LIMIT_TOKENS,
  SCRAPE_TEST_PAGE_URLS,
};

export default config;
