export type RetryOptions = {
  retries?: number;
  factor?: number;
  minDelayMs?: number;
};

import { config } from "@/utils/config";

export async function retryWithBackoff<T>(
  fn: () => Promise<T | null>,
  options: RetryOptions = {},
): Promise<T | null> {
  const retries = options.retries ?? config.scraper.retry.maxAttempts;
  const factor = options.factor ?? config.scraper.retry.retryFactor;
  const minDelay = options.minDelayMs ?? config.scraper.retry.retryBaseMs;

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
