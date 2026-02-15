import type { Browser, Page as PuppeteerPage } from "puppeteer";
import { extractPageData } from "./pageExtraction";
import { tryLogin } from "@/lib/common/scraperHelpers";
import { mapWithConcurrency } from "./concurrency";
import { SCRAPER_SEED_PREFETCH_CONCURRENCY } from "@/lib/config";

export function normalizeUrl(u: string, base?: string) {
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
  const normSeeds = seeds.map((s) => normalizeUrl(s, rootUrl));
  const preExtractedMap = new Map<string, PreExtracted>();

  // If a password is provided, attempt a root login once and reuse cookies.
  let cookies: Array<Parameters<PuppeteerPage["setCookie"]>[0]> = [];
  if (password) {
    try {
      const p = await browser.newPage();
      await p.setViewport({ width: 1280, height: 1024 });
      await p.goto(rootUrl, { waitUntil: "networkidle2", timeout: 30000 });
      try {
        await tryLogin(p, password);
        if (logger) logger("Root login attempt complete");
      } catch (e) {
        if (logger) logger(`Root login attempt failed: ${String(e)}`);
      }
      try {
        // Collect cookies to set on seed pages to reuse session
        const raw = await p.cookies();
        cookies = raw.map(
          (c) =>
            ({
              name: c.name,
              value: c.value,
              domain: c.domain,
              path: c.path,
              expires: c.expires,
              httpOnly: c.httpOnly,
              secure: c.secure,
              sameSite: (c as unknown as { sameSite?: string }).sameSite,
            }) as Parameters<PuppeteerPage["setCookie"]>[0],
        );
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
      while (attempts < 3) {
        attempts++;
        try {
          const p = await browser.newPage();
          await p.setViewport({ width: 1280, height: 1024 });
          try {
            // If we collected cookies from the root login, set them on the page
            if (cookies && cookies.length > 0) {
              try {
                // Puppeteer's setCookie expects CookieParam; spread basic fields
                await p.setCookie(...cookies);
              } catch {}
            }
            await p.goto(u, { waitUntil: "networkidle2", timeout: 30000 });
            if (password) {
              try {
                await tryLogin(p, password);
                if (logger) logger(`Login attempt complete on seed ${u}`);
              } catch (e) {
                if (logger)
                  logger(`Login attempt failed on seed ${u}: ${String(e)}`);
              }
            }

            // Small wait + gentle scroll to surface lazy-loaded content
            await new Promise((r) => setTimeout(r, 400));
            try {
              await p.evaluate(async () => {
                const step = window.innerHeight || 800;
                let pos = 0;
                const max =
                  document.body.scrollHeight ||
                  document.documentElement.scrollHeight;
                while (pos < max) {
                  window.scrollBy(0, step);
                  await new Promise((rr) => setTimeout(rr, 120));
                  pos += step;
                }
                await new Promise((rr) => setTimeout(rr, 200));
                window.scrollTo(0, 0);
              });
            } catch {}

            const extracted = await extractPageData(p, u, hostname).catch(
              () =>
                ({
                  pageLinks: [] as string[],
                  normalizedImages: [] as Array<{ src: string; alt: string }>,
                  supportedImages: [] as Array<{ src: string; alt: string }>,
                  title: "",
                  content: "",
                }) as PreExtracted,
            );

            preExtractedMap.set(u, extracted as PreExtracted);
          } finally {
            try {
              await p.close();
            } catch {}
          }
          break; // success
        } catch (err) {
          if (attempts >= 3) {
            if (logger) logger(`Seed prefetch failed for ${u}: ${String(err)}`);
          } else {
            // small backoff
            await new Promise((r) => setTimeout(r, 250 * attempts));
          }
        }
      }
    },
    workConcurrency,
  );

  return { preExtractedMap, normalizedSeeds: normSeeds };
}

export default prefetchSeeds;
