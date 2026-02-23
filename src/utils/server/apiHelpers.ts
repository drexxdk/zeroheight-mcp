import fs from "fs";
import path from "path";
import { NextRequest } from "next/server";
import { isRecord } from "@/utils/common/typeGuards";
import { z } from "zod";

type Bucket = { tokens: number; lastRefill: number };

const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
import { config } from "@/utils/config";
import logger from "@/utils/logger";
const RATE_LIMIT_TOKENS = config.server.rateLimitTokens;

const buckets = new Map<string, Bucket>();

function getBucket(key: string): Bucket {
  const now = Date.now();
  let b = buckets.get(key);
  if (!b) {
    b = { tokens: RATE_LIMIT_TOKENS, lastRefill: now };
    buckets.set(key, b);
    return b;
  }
  const elapsed = now - b.lastRefill;
  if (elapsed > 0) {
    const refill = Math.floor(
      (elapsed / RATE_LIMIT_WINDOW_MS) * RATE_LIMIT_TOKENS,
    );
    if (refill > 0) {
      b.tokens = Math.min(RATE_LIMIT_TOKENS, b.tokens + refill);
      b.lastRefill = now;
    }
  }
  return b;
}

export function checkRateLimit({ apiKey }: { apiKey: string }): boolean {
  const bucket = getBucket(apiKey || "anon");
  if (bucket.tokens <= 0) return false;
  bucket.tokens -= 1;
  return true;
}

const LOG_DIR = path.resolve(process.cwd(), "logs");
const AUDIT_LOG = path.join(LOG_DIR, "api-audit.log");

function ensureLogDir(): void {
  try {
    if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
  } catch {
    // ignore
  }
}

export async function auditRequest({
  req,
  route,
  details,
  bodyProvided,
}: {
  req: NextRequest;
  route: string;
  details?: Record<string, unknown>;
  bodyProvided?: string | Record<string, unknown>;
}): Promise<void> {
  try {
    ensureLogDir();
    const now = new Date().toISOString();
    const key = req.headers.get("x-server-api-key") || "";
    const masked = key ? `${key.slice(0, 4)}...${key.slice(-4)}` : "";
    const ip =
      req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "";
    // use provided body if present (so callers can avoid double-read)
    let body: string | Record<string, unknown> | undefined;
    if (bodyProvided === undefined) {
      try {
        const txt = await req.text();
        if (txt) {
          try {
            body = JSON.parse(txt);
          } catch {
            body = txt;
          }
        }
      } catch {
        body = undefined;
      }
    } else if (typeof bodyProvided === "string") {
      body = bodyProvided;
    } else if (isRecord(bodyProvided)) {
      body = bodyProvided;
    } else {
      body = undefined;
    }

    const entry = {
      ts: now,
      route,
      method: req.method,
      apiKey: masked,
      ip,
      details: details || {},
      body,
    };
    fs.appendFileSync(AUDIT_LOG, JSON.stringify(entry) + "\n");
  } catch (err) {
    // don't let auditing break the request flow
    // log via central logger for consistency
    logger.error("auditRequest error", err);
  }
}

export async function parseAndValidateJson<T>(
  req: Request,
  schema: z.ZodType<T>,
): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try {
    const txt = await req.text();
    if (!txt) return { ok: false, error: "Empty body" };

    let parsed: unknown;
    try {
      parsed = JSON.parse(txt);
    } catch {
      return { ok: false, error: "Invalid JSON" };
    }

    const result = schema.safeParse(parsed);
    if (result.success) return { ok: true, data: result.data };

    const details = result.error.issues
      .map((e: z.ZodIssue) => `${e.path.join(".") || "<root>"}: ${e.message}`)
      .join("; ");

    logger.warn("Request validation failed", { details });
    return { ok: false, error: details };
  } catch (err) {
    logger.error("parseAndValidateJson error", err);
    return { ok: false, error: "internal_error" };
  }
}

export function parseJsonText(
  txt: string | null | undefined,
): Record<string, unknown> | null {
  if (!txt) return null;
  try {
    const p = JSON.parse(txt);
    return isRecord(p) ? p : null;
  } catch {
    return null;
  }
}
