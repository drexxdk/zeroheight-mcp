export type RetryOptions = {
  retries?: number;
  factor?: number;
  minDelayMs?: number;
};

import { SCRAPER_RETRY_BASE_MS } from "@/lib/config";

export async function retryWithBackoff<T>(
  fn: () => Promise<T | null>,
  options: RetryOptions = {},
): Promise<T | null> {
  const retries = options.retries ?? 3;
  const factor = options.factor ?? 2;
  const minDelay = options.minDelayMs ?? SCRAPER_RETRY_BASE_MS;

  let attempt = 0;
  while (attempt < retries) {
    try {
      const res = await fn();
      if (res !== null && typeof res !== "undefined") return res;
    } catch {
      // swallow and retry
    }

    attempt++;
    if (attempt < retries) {
      const delay = Math.round(minDelay * Math.pow(factor, attempt - 1));
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  // If we exhausted attempts, return null so callers can handle gracefully
  return null;
}
