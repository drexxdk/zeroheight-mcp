import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { convertPagesToModel } from "@/utils/pages-to-model";
import { config } from "@/utils/config";
import logger from "@/utils/logger";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const src = resolve(__dirname, "pages-query.json");
const out = resolve(
  __dirname,
  "..",
  "..",
  "..",
  "..",
  "src",
  "tools",
  "api-scraper",
  "generated",
  "pages-model.json",
);

type Q = Record<string, unknown>;

declare global {
  var __capture_title_to_images: Map<string, string[]> | undefined;
}

function getString(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() !== "" ? v.trim() : undefined;
}

function pickBest<T>(items: T[], score: (t: T) => number): T | null {
  if (items.length === 0) return null;
  let best = items[0];
  let bestScore = score(best);
  for (let i = 1; i < items.length; i++) {
    const s = score(items[i]);
    if (s > bestScore) {
      bestScore = s;
      best = items[i];
    }
  }
  return best;
}

function normalizeUrl(u?: unknown): string {
  if (typeof u !== "string") return "";
  return u.trim().replace(/\/$/, "");
}

function readRawPages(path: string): unknown[] {
  const raw = JSON.parse(readFileSync(path, { encoding: "utf8" }));
  if (!Array.isArray(raw)) {
    logger.error("expected array in pages-query.json");
    process.exitCode = 1;
    return [];
  }
  return raw;
}

function buildByUrlMap(raw: unknown[]): Map<string, Q[]> {
  const m = new Map<string, Q[]>();
  for (const p of raw as Q[]) {
    const url =
      normalizeUrl(p.url) || `__MISSING_URL__${String(p.id ?? Math.random())}`;
    const arr = m.get(url) ?? [];
    arr.push(p);
    m.set(url, arr);
  }
  return m;
}

// eslint-disable-next-line complexity
function loadCaptureMap(capturePath: string): {
  captureMap: Map<string, string[]>;
  titleToUrl: Map<string, string>;
  urlToModel: Map<
    string,
    {
      url: string;
      title?: string | null;
      content?: string | null;
      images?: string[];
    }
  >;
} {
  const captureMap = new Map<string, string[]>();
  const titleToUrl = new Map<string, string>();
  const urlToModel = new Map<
    string,
    {
      url: string;
      title?: string | null;
      content?: string | null;
      images?: string[];
    }
  >();
  try {
    if (!existsSync(capturePath)) return { captureMap, titleToUrl, urlToModel };
    const rawCapture = JSON.parse(
      readFileSync(capturePath, { encoding: "utf8" }),
    );
    const capturedModels = convertPagesToModel(rawCapture);

    let captureOrigin: string | undefined;
    try {
      captureOrigin = new URL(config.env.zeroheightProjectUrl).origin;
    } catch (_e) {
      // fall back
    }
    if (!captureOrigin && capturedModels.length > 0) {
      try {
        const u = new URL(capturedModels[0].url);
        captureOrigin = u.origin;
      } catch {
        // ignore
      }
    }

    const titleToImages = new Map<string, string[]>();
    for (const m of capturedModels) {
      const key = normalizeUrl(m.url || "");
      const imgs = (m.images || []).map((i) => {
        if (!i) return i;
        if (i.startsWith("//")) return `https:${i}`;
        if (i.startsWith("/") && captureOrigin) return `${captureOrigin}${i}`;
        return i;
      });
      const cleanImgs = imgs.filter(Boolean) as string[];
      if (key) captureMap.set(key, cleanImgs);
      const t = getString(m.title) ?? "";
      if (t && cleanImgs.length)
        titleToImages.set(t.trim().toLowerCase(), cleanImgs);
      // also expose title -> url mapping for captured pages
      if (t) titleToUrl.set(t.trim().toLowerCase(), normalizeUrl(m.url || ""));
      if (key)
        urlToModel.set(key, {
          url: normalizeUrl(m.url || ""),
          title: m.title ?? null,
          content: m.content ?? null,
          images: cleanImgs,
        });
    }
    globalThis.__capture_title_to_images = titleToImages;
  } catch {
    // ignore
  }
  return { captureMap, titleToUrl, urlToModel };
}

function chooseTitle(items: Q[]): string | null {
  const titles: string[] = items
    .map((i) => getString(i.selectedTitle) ?? getString(i.title) ?? "")
    .filter(Boolean);
  const titleFreq = new Map<string, number>();
  for (const t of titles) titleFreq.set(t, (titleFreq.get(t) ?? 0) + 1);
  const titleCandidates = Array.from(titleFreq.keys());
  if (titleCandidates.length === 1) return titleCandidates[0];
  if (titleCandidates.length > 1) {
    return pickBest(
      titleCandidates,
      (t) => (titleFreq.get(t) ?? 0) * 1000 + t.length,
    ) as string;
  }
  return (
    getString(items[0]?.selectedTitle) ??
    getString(items[0]?.title) ??
    getString(items[0]?.name) ??
    null
  );
}

function chooseContent(items: Q[]): string | null {
  const contentEntry = pickBest(items, (it) => {
    const c = getString(it.selectedContent) ?? getString(it.content) ?? "";
    let s = c.length;
    if (it.images && Object.keys(it.images).length > 0) s += 2000;
    if (
      /user-attachments|\.zip|\.ai|\.svg|\.png|\.gif/i.test(JSON.stringify(it))
    )
      s += 1000;
    return s;
  });
  return contentEntry
    ? (getString(contentEntry.selectedContent) ??
        getString(contentEntry.content) ??
        null)
    : null;
}

function findImagesForUrl(
  url: string,
  title: string | null,
  captureMap: Map<string, string[]>,
): string[] {
  const images = captureMap.get(normalizeUrl(url)) ?? [];
  if ((!images || images.length === 0) && title) {
    try {
      const titleMap = globalThis.__capture_title_to_images;
      if (titleMap) {
        const tkey = title.trim().toLowerCase();
        const timgs = titleMap.get(tkey);
        if (timgs && timgs.length) return timgs;
        for (const [k, v] of titleMap.entries()) {
          if (!k) continue;
          if (tkey.includes(k) || k.includes(tkey)) {
            if (v && v.length) return v;
          }
        }
      }
    } catch {
      // ignore
    }
  }
  return images;
}

// eslint-disable-next-line complexity
export function buildPagesModel(): void {
  const raw = readRawPages(src);
  const byUrl = buildByUrlMap(raw);

  const capturePath = resolve(
    __dirname,
    "..",
    "..",
    "..",
    "..",
    "src",
    "tools",
    "api-scraper",
    "generated",
    "pages.json",
  );
  const loaded = loadCaptureMap(capturePath);
  const captureMap = loaded.captureMap;
  const captureTitleToUrl = loaded.titleToUrl;
  const captureUrlToModel = loaded.urlToModel;

  const model: Array<{
    url: string;
    title: string | null;
    content: string | null;
    images: string[];
  }> = [];

  for (const [url, items] of byUrl) {
    const title = chooseTitle(items);
    const content = chooseContent(items);
    // if the analyzer produced a placeholder url, prefer the captured page URL
    let finalUrl = url;
    if ((String(finalUrl) || "").startsWith("__MISSING_URL__")) {
      if (title) {
        const mapped = captureTitleToUrl.get(title.trim().toLowerCase());
        if (mapped) finalUrl = normalizeUrl(mapped);
      }
    }

    // prefer captured page title/content when analyzer produced placeholders or JSON blobs
    let finalTitle = title;
    let finalContent = content;
    try {
      const captured = captureUrlToModel.get(normalizeUrl(finalUrl));
      if (captured) {
        if (
          !finalTitle ||
          /\.\.\.|…/.test(finalTitle) ||
          (captured.title &&
            finalTitle &&
            captured.title.length > finalTitle.length &&
            captured.title.includes(finalTitle))
        ) {
          finalTitle = captured.title ?? finalTitle;
        }
        if (
          !finalContent ||
          /^[\s]*[{\[]/.test(String(finalContent)) ||
          (finalContent && finalContent.length < 40)
        ) {
          finalContent = captured.content ?? finalContent;
        }
      }
    } catch {
      // ignore
    }

    const images = findImagesForUrl(finalUrl, title, captureMap);
    model.push({
      url: finalUrl,
      title: finalTitle,
      content: finalContent,
      images,
    });
  }

  writeFileSync(out, JSON.stringify(model, null, 2), { encoding: "utf8" });
  const total = model.length;
  const imgCount = model.reduce((sum, m) => sum + m.images.length, 0);
  logger.log(`Wrote ${total} canonical pages to ${out}`);
  logger.log(`Total image associations in model: ${imgCount}`);
}

export default buildPagesModel;
