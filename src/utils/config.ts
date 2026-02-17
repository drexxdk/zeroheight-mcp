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
export const SCRAPER_DEBUG =
  (process.env.SCRAPER_DEBUG || "").toLowerCase().trim() === "true";
export const SCRAPER_IMAGE_CONCURRENCY = Number(
  process.env.SCRAPER_IMAGE_CONCURRENCY || 4,
);

// Prefetch / scroll timing configuration (milliseconds / pixels)
export const SCRAPER_PREFETCH_WAIT_MS = Number(
  process.env.SCRAPER_PREFETCH_WAIT_MS || 400,
);
export const SCRAPER_PREFETCH_SCROLL_STEP_MS = Number(
  process.env.SCRAPER_PREFETCH_SCROLL_STEP_MS || 120,
);
export const SCRAPER_PREFETCH_FINAL_WAIT_MS = Number(
  process.env.SCRAPER_PREFETCH_FINAL_WAIT_MS || 200,
);
export const SCRAPER_PREFETCH_SCROLL_STEP_PX = Number(
  process.env.SCRAPER_PREFETCH_SCROLL_STEP_PX || 800,
);

export const ZEROHEIGHT_PROJECT_URL = process.env.ZEROHEIGHT_PROJECT_URL || "";
export const ZEROHEIGHT_PROJECT_PASSWORD =
  process.env.ZEROHEIGHT_PROJECT_PASSWORD || undefined;

export const MCP_API_KEY = process.env.MCP_API_KEY || "";
export const MCP_URL = process.env.MCP_URL || "http://localhost:3000/api/mcp";

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
export const IMAGE_WEBP_QUALITY = parseInt(
  process.env.IMAGE_WEBP_QUALITY || "80",
  10,
);

export const SERVER_RATE_LIMIT_TOKENS = Number(
  process.env.SERVER_RATE_LIMIT_TOKENS || 60,
);

export const SCRAPE_TEST_PAGE_URLS = process.env.SCRAPE_TEST_PAGE_URLS || "";

// Viewport and navigation defaults for puppeteer pages
export const SCRAPER_VIEWPORT_WIDTH = Number(
  process.env.SCRAPER_VIEWPORT_WIDTH || 1280,
);
export const SCRAPER_VIEWPORT_HEIGHT = Number(
  process.env.SCRAPER_VIEWPORT_HEIGHT || 1024,
);
export type NavWaitUntil =
  | "load"
  | "domcontentloaded"
  | "networkidle0"
  | "networkidle2";
export const SCRAPER_NAV_WAITUNTIL: NavWaitUntil =
  (process.env.SCRAPER_NAV_WAITUNTIL as NavWaitUntil) || "networkidle2";
export const SCRAPER_NAV_TIMEOUT_MS = Number(
  process.env.SCRAPER_NAV_TIMEOUT_MS || 30000,
);

// Retry / backoff / attempt defaults
export const SCRAPER_MAX_ATTEMPTS = Number(
  process.env.SCRAPER_MAX_ATTEMPTS || 3,
);
export const SCRAPER_RETRY_BASE_MS = Number(
  process.env.SCRAPER_RETRY_BASE_MS || 250,
);
export const SCRAPER_RETRY_FACTOR = Number(
  process.env.SCRAPER_RETRY_FACTOR || 2,
);

// Content extraction limits
export const SCRAPER_CONTENT_MAX_CHARS = Number(
  process.env.SCRAPER_CONTENT_MAX_CHARS || 10000,
);

// Monitor / poll intervals
export const SCRAPER_MONITOR_POLL_MS = Number(
  process.env.SCRAPER_MONITOR_POLL_MS || 100,
);
export const SCRAPER_MONITOR_IDLE_POLL_MS = Number(
  process.env.SCRAPER_MONITOR_IDLE_POLL_MS || 200,
);

// Upload retry/backoff
export const IMAGE_UPLOAD_RETRIES = Number(
  process.env.IMAGE_UPLOAD_RETRIES || 3,
);
export const IMAGE_UPLOAD_BACKOFF_FACTOR = Number(
  process.env.IMAGE_UPLOAD_BACKOFF_FACTOR || 2,
);
export const IMAGE_UPLOAD_MIN_DELAY_MS = Number(
  process.env.IMAGE_UPLOAD_MIN_DELAY_MS || 250,
);

// Storage and DB tuning
export const STORAGE_CACHE_CONTROL_SEC = Number(
  process.env.STORAGE_CACHE_CONTROL_SEC || 3600,
);

export const SCRAPER_DB_QUERY_LIMIT = Number(
  process.env.SCRAPER_DB_QUERY_LIMIT || 1000,
);

export const SCRAPER_LOG_SAMPLE_SIZE = Number(
  process.env.SCRAPER_LOG_SAMPLE_SIZE || 12,
);

export const SCRAPER_QUERY_DEFAULT_LIMIT = Number(
  process.env.SCRAPER_QUERY_DEFAULT_LIMIT || 10,
);

export const SCRAPER_BULK_UPSERT_BACKOFF_MS = Number(
  process.env.SCRAPER_BULK_UPSERT_BACKOFF_MS || 500,
);

// Additional tuning
export const STORAGE_FILE_SIZE_LIMIT_BYTES = Number(
  process.env.STORAGE_FILE_SIZE_LIMIT_BYTES || 10485760,
);

export const SCRAPER_SCROLL_FALLBACK_PX = Number(
  process.env.SCRAPER_SCROLL_FALLBACK_PX || 800,
);

export const SCRAPER_DB_INSPECT_LIMIT = Number(
  process.env.SCRAPER_DB_INSPECT_LIMIT || 50,
);

export const SCRAPER_DB_INSPECT_SAMPLE_SIZE = Number(
  process.env.SCRAPER_DB_INSPECT_SAMPLE_SIZE || 20,
);

export const SCRAPER_DEFAULT_CONCURRENCY = Number(
  process.env.SCRAPER_DEFAULT_CONCURRENCY || 4,
);

export const HASH_TRUNCATE_LENGTH = Number(
  process.env.HASH_TRUNCATE_LENGTH || 8,
);

// Job ID and logging tuning
export const JOBID_RANDOM_START = Number(process.env.JOBID_RANDOM_START || 2);
export const JOBID_RANDOM_LEN = Number(process.env.JOBID_RANDOM_LEN || 6);
export const TESTRUNID_RANDOM_LEN = Number(
  process.env.TESTRUNID_RANDOM_LEN || 4,
);

export const SCRAPER_LOG_LINK_SAMPLE = Number(
  process.env.SCRAPER_LOG_LINK_SAMPLE || 6,
);

export const IMAGE_UTILS_SAMPLE_LIMIT = Number(
  process.env.IMAGE_UTILS_SAMPLE_LIMIT || 50,
);

// Database / migration helper flags
export const DATABASE_URL = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || "";
export const ALLOW_AUTO_CREATE_SCHEMA_MIGRATIONS = (
  (process.env.ALLOW_AUTO_CREATE_SCHEMA_MIGRATIONS || "").toLowerCase() === "true" ||
  (process.env.ALLOW_AUTO_CREATE_SCHEMA_MIGRATIONS || "") === "1"
);
