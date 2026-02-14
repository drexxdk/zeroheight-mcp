import fs from "fs";
import path from "path";
import { NextRequest } from "next/server";

type Bucket = { tokens: number; lastRefill: number };

const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const RATE_LIMIT_TOKENS = Number(process.env.SERVER_RATE_LIMIT_TOKENS || 60);

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

export function checkRateLimit(apiKey: string) {
  const bucket = getBucket(apiKey || "anon");
  if (bucket.tokens <= 0) return false;
  bucket.tokens -= 1;
  return true;
}

const LOG_DIR = path.resolve(process.cwd(), "logs");
const AUDIT_LOG = path.join(LOG_DIR, "api-audit.log");

function ensureLogDir() {
  try {
    if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
  } catch {
    // ignore
  }
}

export async function auditRequest(
  req: NextRequest,
  route: string,
  details?: Record<string, unknown>,
  bodyProvided?: unknown,
) {
  try {
    ensureLogDir();
    const now = new Date().toISOString();
    const key = req.headers.get("x-server-api-key") || "";
    const masked = key ? `${key.slice(0, 4)}...${key.slice(-4)}` : "";
    const ip =
      req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "";
    // use provided body if present (so callers can avoid double-read)
    let body: unknown = bodyProvided;
    if (body === undefined) {
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
    // console.error allowed here for server-side visibility
    console.error("auditRequest error", err);
  }
}
