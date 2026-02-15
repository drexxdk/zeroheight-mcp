import type { Browser } from "puppeteer";
import { mapWithConcurrency } from "./concurrency";
import { extractPageData } from "./pageExtraction";
import { tryLogin } from "@/lib/common/scraperHelpers";
import type { ExtractedImage } from "./pageExtraction";
import { SCRAPER_SEED_PREFETCH_CONCURRENCY } from "@/lib/config";

export type PreExtracted = {
  title: string;
  content: string;
  supportedImages: ExtractedImage[];
  normalizedImages: Array<{ src: string; alt: string }>;
  pageLinks: string[];
};

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

export async function prefetchSeeds(params: {
  browser: Browser;
  rootUrl: string;
  pageUrls?: string[];
  password?: string;
  logger?: (s: string) => void;
}) {
  const { browser, rootUrl, pageUrls, password, logger } = params;
  const preExtractedMap: Map<string, PreExtracted> = new Map();
  const hostname = new URL(rootUrl).hostname;

  if (pageUrls && pageUrls.length > 0) {
    const normalized = pageUrls.map((p) => normalizeUrl(p, rootUrl));
    const seedPrefetchConcurrency = SCRAPER_SEED_PREFETCH_CONCURRENCY;

    await mapWithConcurrency(
      normalized,
      async (u) => {
        try {
          const p = await browser.newPage();
          await p.setViewport({ width: 1280, height: 1024 });
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
          try {
            const extracted = await extractPageData(p, u, hostname).catch(
              () => ({
                pageLinks: [] as string[],
                normalizedImages: [] as ExtractedImage[],
                supportedImages: [] as ExtractedImage[],
                title: "",
                content: "",
              }),
            );
            preExtractedMap.set(u, extracted as PreExtracted);
          } finally {
            try {
              await p.close();
            } catch {}
          }
        } catch (e) {
          if (logger) logger(`Seed prefetch failed for ${u}: ${String(e)}`);
        }
      },
      seedPrefetchConcurrency,
    );

    return { preExtractedMap, initialLinks: normalized, hostname };
  }

  // rootUrl flow
  const p = await browser.newPage();
  await p.setViewport({ width: 1280, height: 1024 });
  await p.goto(rootUrl, { waitUntil: "networkidle2", timeout: 30000 });
  if (password) {
    try {
      await tryLogin(p, password);
      if (logger) logger("Login attempt complete on root page");
    } catch (e) {
      if (logger) logger(`Login attempt failed: ${String(e)}`);
    }
  }

  const extracted = await extractPageData(p, rootUrl, hostname).catch(() => ({
    pageLinks: [] as string[],
    normalizedImages: [] as ExtractedImage[],
    supportedImages: [] as ExtractedImage[],
    title: "",
    content: "",
  }));

  const anchors = await p
    .$$eval("a[href]", (links) =>
      links.map((a) => (a as HTMLAnchorElement).href).filter(Boolean),
    )
    .catch(() => [] as string[]);

  const initialSet = new Set<string>();
  initialSet.add(normalizeUrl(rootUrl, rootUrl));
  for (const a of anchors) initialSet.add(normalizeUrl(a, rootUrl));
  for (const a of extracted.pageLinks || [])
    initialSet.add(normalizeUrl(a, rootUrl));
  const initial = Array.from(initialSet);

  try {
    await p.close();
  } catch {}

  // store the root page extraction so workers can reuse it
  preExtractedMap.set(
    normalizeUrl(rootUrl, rootUrl),
    extracted as PreExtracted,
  );

  if (logger) {
    logger(`Seeded ${initial.length} initial links from root`);
  }

  return { preExtractedMap, initialLinks: initial, hostname };
}
