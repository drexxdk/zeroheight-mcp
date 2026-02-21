import type { Browser, Page as PuppeteerPage } from "puppeteer";
import { isRecord } from "@/utils/common/typeGuards";
import { extractPageData } from "./pageExtraction";
import { tryLogin } from "@/utils/common/scraperHelpers";
import { mapWithConcurrency } from "./concurrency";
import { config } from "@/utils/config";
import defaultLogger from "@/utils/logger";

export function normalizeUrl({
  u,
  base,
}: {
  u: string;
  base?: string;
}): string {
  try {
    const parsed = new URL(u, base || undefined);
    parsed.hash = "";
    const path =
      parsed.pathname.endsWith("/") && parsed.pathname !== "/"
        ? parsed.pathname.slice(0, -1)
        : parsed.pathname;
    return `${parsed.protocol}//${parsed.hostname}${path}${parsed.search}`;
  } catch {
    return u;
  }
}

export type PreExtracted = {
  title: string;
  content: string;
  supportedImages: Array<{ src: string; alt: string }>;
  normalizedImages: Array<{ src: string; alt: string }>;
  pageLinks: string[];
};

export async function prefetchSeeds(options: {
  browser: Browser;
  rootUrl: string;
  seeds: string[];
  password?: string;
  concurrency?: number;
  logger?: (s: string) => void;
}): Promise<{
  preExtractedMap: Map<string, PreExtracted>;
  normalizedSeeds: string[];
}> {
  const { browser, rootUrl, seeds, password, concurrency, logger } = options;
  const hostname = new URL(rootUrl).hostname;
  const normSeeds = seeds.map((s) => normalizeUrl({ u: s, base: rootUrl }));
  const preExtractedMap = new Map<string, PreExtracted>();

  // If a password is provided, attempt a root login once and reuse cookies.
  let cookies: Array<Parameters<PuppeteerPage["setCookie"]>[0]> = [];
  if (password) {
    try {
      const p = await browser.newPage();
      await p.setViewport({
        width: config.scraper.viewport.width,
        height: config.scraper.viewport.height,
      });
      await p.goto(rootUrl, {
        waitUntil: config.scraper.viewport.navWaitUntil,
        timeout: config.scraper.viewport.navTimeoutMs,
      });
      try {
        await tryLogin({ page: p, password });
        if (logger) logger("Root login attempt complete");
      } catch (e) {
        if (logger) logger(`Root login attempt failed: ${String(e)}`);
      }
      try {
        // Collect cookies to set on seed pages to reuse session
        const raw = await p.cookies();
        cookies = raw.map((c) => {
          let sameSite: "Strict" | "Lax" | "None" | undefined = undefined;
          const ss = isRecord(c) ? c["sameSite"] : undefined;
          if (ss === "Strict" || ss === "Lax" || ss === "None") sameSite = ss;
          return {
            name: c.name,
            value: c.value,
            domain: c.domain,
            path: c.path,
            expires: c.expires,
            httpOnly: c.httpOnly,
            secure: c.secure,
            sameSite,
          };
        });
      } catch (e) {
        defaultLogger.debug("prefetch seed parsing failed:", e);
      }
      try {
        await p.close();
      } catch (e) {
        defaultLogger.debug("prefetch optional parse failed:", e);
      }
    } catch (e) {
      if (logger) logger(`Root prefetch/login failed: ${String(e)}`);
    }
  }

  const workConcurrency = concurrency ?? config.scraper.seedPrefetchConcurrency;

  await mapWithConcurrency(
    normSeeds,
    async (u) => {
      let attempts = 0;
      while (attempts < config.scraper.retry.maxAttempts) {
        attempts++;
        try {
          const p = await browser.newPage();
          await p.setViewport({
            width: config.scraper.viewport.width,
            height: config.scraper.viewport.height,
          });
          try {
            // If we collected cookies from the root login, set them on the page
            if (cookies && cookies.length > 0) {
              try {
                // Puppeteer's setCookie expects CookieParam; spread basic fields
                await p.setCookie(...cookies);
              } catch (e) {
                defaultLogger.debug("prefetch loop item parse failed:", e);
              }
            }
            await p.goto(u, {
              waitUntil: config.scraper.viewport.navWaitUntil,
              timeout: config.scraper.viewport.navTimeoutMs,
            });
            if (password) {
              try {
                await tryLogin({ page: p, password });
                if (logger) logger(`Login attempt complete on seed ${u}`);
              } catch (e) {
                if (logger)
                  logger(`Login attempt failed on seed ${u}: ${String(e)}`);
              }
            }

            // Small wait + gentle scroll to surface lazy-loaded content
            try {
              const stepPx = config.scraper.prefetch.scrollStepPx;
              const stepMs = config.scraper.prefetch.scrollStepMs;
              const finalWait = config.scraper.prefetch.finalWaitMs;
              await p.evaluate(
                async (
                  stepPxArg: number,
                  stepMsArg: number,
                  finalWaitArg: number,
                  fallbackArg: number,
                ) => {
                  const step = stepPxArg || window.innerHeight || fallbackArg;
                  let pos = 0;
                  const max =
                    document.body.scrollHeight ||
                    document.documentElement.scrollHeight;
                  while (pos < max) {
                    window.scrollBy(0, step);
                    // small pause between scroll steps
                    await new Promise((rr) => setTimeout(rr, stepMsArg));
                    pos += step;
                  }
                  await new Promise((rr) => setTimeout(rr, finalWaitArg));
                  window.scrollTo(0, 0);
                },
                stepPx,
                stepMs,
                finalWait,
                config.scraper.prefetch.scrollStepPx,
              );
            } catch (e) {
              defaultLogger.debug("prefetch inner error:", e);
            }

            const fallback: PreExtracted = {
              pageLinks: [],
              normalizedImages: [],
              supportedImages: [],
              title: "",
              content: "",
            };
            const extracted = await extractPageData({
              page: p,
              pageUrl: u,
              allowedHostname: hostname,
            }).catch(() => fallback);

            preExtractedMap.set(u, extracted);
          } finally {
            try {
              await p.close();
            } catch (e) {
              defaultLogger.debug("prefetch finalizer error:", e);
            }
          }
          break; // success
        } catch (err) {
          if (attempts >= config.scraper.retry.maxAttempts) {
            if (logger) logger(`Seed prefetch failed for ${u}: ${String(err)}`);
          } else {
            // small backoff
            await new Promise((r) =>
              setTimeout(r, config.scraper.retry.retryBaseMs * attempts),
            );
          }
        }
      }
    },
    workConcurrency,
  );

  return { preExtractedMap, normalizedSeeds: normSeeds };
}

export default prefetchSeeds;
