import type { Browser, Page as PuppeteerPage } from "puppeteer";
import { isRecord } from "@/utils/common/typeGuards";
import { extractPageData } from "./pageExtraction";
import { tryLogin } from "@/utils/common/scraperHelpers";
import { mapWithConcurrency } from "./concurrency";
import {
  SCRAPER_SEED_PREFETCH_CONCURRENCY,
  SCRAPER_PREFETCH_WAIT_MS,
  SCRAPER_PREFETCH_SCROLL_STEP_MS,
  SCRAPER_PREFETCH_FINAL_WAIT_MS,
  SCRAPER_PREFETCH_SCROLL_STEP_PX,
  SCRAPER_VIEWPORT_WIDTH,
  SCRAPER_VIEWPORT_HEIGHT,
  SCRAPER_NAV_WAITUNTIL,
  SCRAPER_NAV_TIMEOUT_MS,
  SCRAPER_MAX_ATTEMPTS,
  SCRAPER_RETRY_BASE_MS,
} from "@/utils/config";

export function normalizeUrl({ u, base }: { u: string; base?: string }) {
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
}) {
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
        width: SCRAPER_VIEWPORT_WIDTH,
        height: SCRAPER_VIEWPORT_HEIGHT,
      });
      await p.goto(rootUrl, {
        waitUntil: SCRAPER_NAV_WAITUNTIL,
        timeout: SCRAPER_NAV_TIMEOUT_MS,
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
          let sameSite: string | undefined = undefined;
          const ss = isRecord(c) ? c["sameSite"] : undefined;
          if (typeof ss === "string") sameSite = ss;
          return {
            name: c.name,
            value: c.value,
            domain: c.domain,
            path: c.path,
            expires: c.expires,
            httpOnly: c.httpOnly,
            secure: c.secure,
            sameSite,
          } as Parameters<PuppeteerPage["setCookie"]>[0];
        });
      } catch {}
      try {
        await p.close();
      } catch {}
    } catch (e) {
      if (logger) logger(`Root prefetch/login failed: ${String(e)}`);
    }
  }

  const workConcurrency = concurrency ?? SCRAPER_SEED_PREFETCH_CONCURRENCY;

  await mapWithConcurrency(
    normSeeds,
    async (u) => {
      let attempts = 0;
      while (attempts < SCRAPER_MAX_ATTEMPTS) {
        attempts++;
        try {
          const p = await browser.newPage();
          await p.setViewport({
            width: SCRAPER_VIEWPORT_WIDTH,
            height: SCRAPER_VIEWPORT_HEIGHT,
          });
          try {
            // If we collected cookies from the root login, set them on the page
            if (cookies && cookies.length > 0) {
              try {
                // Puppeteer's setCookie expects CookieParam; spread basic fields
                await p.setCookie(...cookies);
              } catch {}
            }
            await p.goto(u, {
              waitUntil: SCRAPER_NAV_WAITUNTIL,
              timeout: SCRAPER_NAV_TIMEOUT_MS,
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
            await new Promise((r) => setTimeout(r, SCRAPER_PREFETCH_WAIT_MS));
            try {
              const stepPx = SCRAPER_PREFETCH_SCROLL_STEP_PX;
              const stepMs = SCRAPER_PREFETCH_SCROLL_STEP_MS;
              const finalWait = SCRAPER_PREFETCH_FINAL_WAIT_MS;
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
                    await new Promise((rr) => setTimeout(rr, stepMsArg));
                    pos += step;
                  }
                  await new Promise((rr) => setTimeout(rr, finalWaitArg));
                  window.scrollTo(0, 0);
                },
                stepPx,
                stepMs,
                finalWait,
                SCRAPER_PREFETCH_SCROLL_STEP_PX,
              );
            } catch {}

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
            } catch {}
          }
          break; // success
        } catch (err) {
          if (attempts >= SCRAPER_MAX_ATTEMPTS) {
            if (logger) logger(`Seed prefetch failed for ${u}: ${String(err)}`);
          } else {
            // small backoff
            await new Promise((r) =>
              setTimeout(r, SCRAPER_RETRY_BASE_MS * attempts),
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
