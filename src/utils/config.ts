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
const mapped: Record<string, string | undefined> = {
  zeroheightMcpAccessToken: rawEnv.ZEROHEIGHT_MCP_ACCESS_TOKEN,
  supabaseServiceRoleKey: rawEnv.SUPABASE_SERVICE_ROLE_KEY,
  supabaseAccessToken: rawEnv.SUPABASE_ACCESS_TOKEN,
  nextPublicSupabaseUrl: rawEnv.NEXT_PUBLIC_SUPABASE_URL,
  zeroheightProjectUrl: rawEnv.ZEROHEIGHT_PROJECT_URL,
  zeroheightProjectPassword: rawEnv.ZEROHEIGHT_PROJECT_PASSWORD,
};

export type Env = z.infer<typeof envSchema>;

let parsedEnv: Env;
// In test environments (Vitest or NODE_ENV=test) provide harmless defaults
// so unit tests can import `config` without requiring real credentials.
const isTest = process.env.VITEST === "true" || process.env.NODE_ENV === "test";
try {
  if (isTest) {
    const testDefaults = {
      zeroheightMcpAccessToken:
        mapped.zeroheightMcpAccessToken ?? "test-zeroheight-token",
      supabaseServiceRoleKey:
        mapped.supabaseServiceRoleKey ?? "test-supabase-role",
      supabaseAccessToken: mapped.supabaseAccessToken ?? "test-supabase-access",
      nextPublicSupabaseUrl:
        mapped.nextPublicSupabaseUrl ?? "http://localhost:54321",
      zeroheightProjectUrl: mapped.zeroheightProjectUrl ?? "http://localhost",
      zeroheightProjectPassword: mapped.zeroheightProjectPassword,
    };
    parsedEnv = envSchema.parse(testDefaults);
  } else {
    parsedEnv = envSchema.parse(mapped);
  }
} catch (e) {
  // Provide a clearer error message for missing/invalid envs.
  // Map zod paths back to the original UPPERCASE env var names and
  // obfuscate secrets so the error is actionable but not overly noisy.
  if (e instanceof z.ZodError) {
    const reverseMap: Record<string, string> = {
      zeroheightMcpAccessToken: "ZEROHEIGHT_MCP_ACCESS_TOKEN",
      supabaseServiceRoleKey: "SUPABASE_SERVICE_ROLE_KEY",
      supabaseAccessToken: "SUPABASE_ACCESS_TOKEN",
      nextPublicSupabaseUrl: "NEXT_PUBLIC_SUPABASE_URL",
      zeroheightProjectUrl: "ZEROHEIGHT_PROJECT_URL",
      zeroheightProjectPassword: "ZEROHEIGHT_PROJECT_PASSWORD",
    };

    const obfuscate = (v: unknown): string => {
      if (v === undefined) return "undefined";
      const s = String(v);
      // For URLs show the full value (helpful for debugging), but
      // obfuscate other long secrets to avoid leaking tokens in logs.
      if (s.includes("://")) return s;
      if (s.length <= 12) return s;
      return `${s.slice(0, 4)}…${s.slice(-4)}`;
    };

    const details = (e.issues || [])
      .map((issue: z.ZodIssue) => {
        const key = String(
          issue.path?.[0] ?? issue.path.join(".") ?? "unknown",
        );
        const envName = reverseMap[key] ?? key;
        const rawVal = mapped[key];
        return `${envName}: ${issue.message} (value: ${obfuscate(rawVal)})`;
      })
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
    // Allow enabling verbose debug logging via env var for troubleshooting.
    debug: process.env.ZEROHEIGHT_SCRAPER_DEBUG === "true" || false,
    imageConcurrency: 4,
    prefetch: {
      waitMs: 400,
      scrollStepMs: 120,
      finalWaitMs: 200,
      scrollStepPx: 800,
    },
    login: {
      // Wait after submitting login form (ms)
      postSubmitWaitMs: 2000,
    },
    viewport: {
      width: 1280,
      height: 1024,
      navWaitUntil: "networkidle2" as NavWaitUntil,
      navTimeoutMs: 30000,
      // Debug-specific navigation timeout (used by inspection scripts)
      debugNavTimeoutMs: 60000,
    },
    retry: {
      maxAttempts: 3,
      retryBaseMs: 250,
      // Default retry delay used by generic retry helpers (ms)
      defaultDelayMs: 500,
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
    log: {
      sampleSize: 12,
    },
    defaultHashTruncate: 8,
    scrapeTestPageUrls: "",
  },
  image: {
    maxDim: 600,
    webpQuality: 80,
    // Timeouts for remote image operations (ms)
    requestTimeoutMs: 10000,
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
    // Number of items to request when listing a storage bucket
    listLimit: 1000,
    // Batch size used when deleting files from storage
    deleteBatchSize: 100,
    storageCacheControlSec: 3600,
    fileSizeLimitBytes: 10485760,
  },
  server: {
    rateLimitTokens: 60,
    mcpUrl: "http://localhost:3000/api/mcp",
    // Default timeouts (ms) used by tailing and long-tail scripts/tools
    defaultTimeoutMs: 30000,
    longTailTimeoutMs: 300000,
    // Polling and TTL defaults for tasks/tools
    pollIntervalMs: 5000,
    pollDefaultTimeoutMs: 60000,
    suggestedTtlMs: 60000,
    maxTtlMs: 60 * 60 * 1000,
  },
  hashing: {
    jobIdRandomStart: 2,
    jobIdRandomLen: 6,
    testRunIdRandomLen: 4,
  },
  tuning: {
    imageUtilsSampleLimit: 50,
    // Short delays used by scripts/tests (ms)
    shortDelayMs: 1000,
    testTaskTickMs: 5000,
  },
};
