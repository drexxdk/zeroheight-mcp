// Centralized runtime configuration (defaults grouped under `config`).
// Only the following environment variables are read directly:
// - ZEROHEIGHT_MCP_ACCESS_TOKEN
// - SUPABASE_SERVICE_ROLE_KEY
// - SUPABASE_ACCESS_TOKEN
// - NEXT_PUBLIC_SUPABASE_URL
// - ZEROHEIGHT_PROJECT_URL
// - ZEROHEIGHT_PROJECT_PASSWORD
// The rest of runtime values are exposed under `config`.

import { z } from "zod";

// Normalize process.env values: treat empty-string as undefined for clarity
const rawEnv = {
  ZEROHEIGHT_MCP_ACCESS_TOKEN:
    process.env.ZEROHEIGHT_MCP_ACCESS_TOKEN?.trim() || undefined,
  SUPABASE_SERVICE_ROLE_KEY:
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || undefined,
  SUPABASE_ACCESS_TOKEN: process.env.SUPABASE_ACCESS_TOKEN?.trim() || undefined,
  NEXT_PUBLIC_SUPABASE_URL:
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || undefined,
  ZEROHEIGHT_PROJECT_URL:
    process.env.ZEROHEIGHT_PROJECT_URL?.trim() || undefined,
  ZEROHEIGHT_PROJECT_PASSWORD:
    process.env.ZEROHEIGHT_PROJECT_PASSWORD?.trim() || undefined,
};

const envSchema = z.object({
  // Required: API key for server auth
  zeroheightMcpAccessToken: z
    .string()
    .min(1, "ZEROHEIGHT_MCP_ACCESS_TOKEN is required"),
  // Required: Supabase keys/urls (any non-empty string; URLs validated below where appropriate)
  supabaseServiceRoleKey: z
    .string()
    .min(1, "SUPABASE_SERVICE_ROLE_KEY is required"),
  supabaseAccessToken: z.string().min(1, "SUPABASE_ACCESS_TOKEN is required"),
  // Required: public Supabase URL (must be a URL)
  nextPublicSupabaseUrl: z
    .string()
    .url("NEXT_PUBLIC_SUPABASE_URL must be a valid URL"),
  // Required: Zeroheight project URL (must be a URL)
  zeroheightProjectUrl: z
    .string()
    .url("ZEROHEIGHT_PROJECT_URL must be a valid URL"),
  // Optional: project password
  zeroheightProjectPassword: z.string().optional(),
});

// Map normalized raw env to our camelCase shape for zod parsing
const mapped = {
  zeroheightMcpAccessToken: rawEnv.ZEROHEIGHT_MCP_ACCESS_TOKEN,
  supabaseServiceRoleKey: rawEnv.SUPABASE_SERVICE_ROLE_KEY,
  supabaseAccessToken: rawEnv.SUPABASE_ACCESS_TOKEN,
  nextPublicSupabaseUrl: rawEnv.NEXT_PUBLIC_SUPABASE_URL,
  zeroheightProjectUrl: rawEnv.ZEROHEIGHT_PROJECT_URL,
  zeroheightProjectPassword: rawEnv.ZEROHEIGHT_PROJECT_PASSWORD,
};

export type Env = z.infer<typeof envSchema>;

let parsedEnv: Env;
try {
  parsedEnv = envSchema.parse(mapped);
} catch (e) {
  // Provide a clearer error message for missing/invalid envs
  if (e instanceof z.ZodError) {
    const details = (e.issues || [])
      .map((issue: z.ZodIssue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(`Environment validation failed: ${details}`);
  }
  throw e;
}

const env: Env = parsedEnv;

export type NavWaitUntil =
  | "load"
  | "domcontentloaded"
  | "networkidle0"
  | "networkidle2";

export const config = {
  env,
  scraper: {
    concurrency: 6,
    idleTimeoutMs: 1000,
    seedPrefetchConcurrency: 4,
    pageUpsertChunk: 200,
    imageInsertChunk: 500,
    debug: false,
    imageConcurrency: 4,
    prefetch: {
      waitMs: 400,
      scrollStepMs: 120,
      finalWaitMs: 200,
      scrollStepPx: 800,
    },
    viewport: {
      width: 1280,
      height: 1024,
      navWaitUntil: "networkidle2" as NavWaitUntil,
      navTimeoutMs: 30000,
    },
    retry: {
      maxAttempts: 3,
      retryBaseMs: 250,
      retryFactor: 2,
    },
    contentMaxChars: 10000,
    monitor: {
      pollMs: 100,
      idlePollMs: 200,
    },
    db: {
      queryLimit: 1000,
      inspectLimit: 50,
      inspectSampleSize: 20,
      queryDefaultLimit: 10,
      bulkUpsertBackoffMs: 500,
      defaultConcurrency: 4,
    },
    scrollFallbackPx: 800,
    log: {
      sampleSize: 12,
      linkSample: 6,
    },
    defaultHashTruncate: 8,
    scrapeTestPageUrls: "",
  },
  image: {
    maxDim: 600,
    jpegQuality: 80,
    webpQuality: 80,
    upload: {
      retries: 3,
      backoffFactor: 2,
      minDelayMs: 250,
    },
    allowedMimeTypes: ["image/png", "image/jpeg", "image/jpg", "image/webp"],
    excludeFormats: ["svg", "gif"],
  },
  storage: {
    imageBucket: "images",
    storageCacheControlSec: 3600,
    fileSizeLimitBytes: 10485760,
  },
  server: {
    rateLimitTokens: 60,
    mcpUrl: "http://localhost:3000/api/mcp",
  },
  hashing: {
    jobIdRandomStart: 2,
    jobIdRandomLen: 6,
    testRunIdRandomLen: 4,
  },
  tuning: {
    scraperDbQueryLimit: 1000,
    imageUtilsSampleLimit: 50,
  },
};
