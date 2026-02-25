import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import logger from "@/utils/logger";

type RawPage = Record<string, unknown> & { id?: unknown };

type Grouped = {
  url: string;
  titles: string[];
  selectedTitle: string | null;
  contents: string[];
  selectedContent: string | null;
  images: string[];
  entries: { id?: unknown; raw: RawPage }[];
};

function getString(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() !== "" ? v.trim() : undefined;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
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

export function analyzePages(): void {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const repoRoot = resolve(__dirname, "..", "..", "..", "..");
  const pagesJsonPath = resolve(
    repoRoot,
    "src",
    "tools",
    "api-scraper",
    "generated",
    "pages.json",
  );
  if (!existsSync(pagesJsonPath)) {
    logger.error(
      `Missing ${pagesJsonPath} — run the api-scraper to capture pages.json first.`,
    );
    process.exitCode = 1;
    return;
  }
  const raw = JSON.parse(readFileSync(pagesJsonPath, { encoding: "utf8" }));
  let pages: RawPage[] = [];
  if (Array.isArray(raw)) {
    pages = raw.filter(isObject) as RawPage[];
  } else if (isObject(raw) && Array.isArray(raw.pages)) {
    pages = (raw.pages as unknown[]).filter(isObject) as RawPage[];
  }

  const byUrl = groupPages(pages);
  const results = selectGroupsResults(byUrl);

  // NOTE: writing to `pages-query.json` is intentionally disabled.
  // This script produces analysis results to stdout for downstream tools
  // to consume without mutating the repository file `pages-query.json`.
  // To keep behavior explicit, we do NOT write to disk here.
  logger.log(
    `Analyzed ${results.length} groups; not writing pages-query.json (disabled)`,
  );
  // Emit JSON to stdout so callers can redirect if they really want a file.
  // Keep the output compact and parseable.
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(results, null, 2));
}

function extractUrl(p: RawPage): string {
  return getString(p.url ?? p.path ?? p.href ?? p.page_url ?? p.slug) || "";
}

function extractTitle(p: RawPage): string {
  return getString(p.title ?? p.name ?? p.label ?? p.display_name) || "";
}

function extractContentField(p: RawPage): string {
  return (
    getString(
      p.content ??
        p.content_html ??
        p.html ??
        p.body ??
        p.content_node ??
        p.introduction_node,
    ) || ""
  );
}

function extractImages(p: RawPage): string[] {
  const imagesRaw = p.images;
  return Array.isArray(imagesRaw)
    ? (imagesRaw.filter((x) => typeof x === "string") as string[])
    : [];
}

function extractPageFields(p: RawPage): {
  url: string;
  title: string;
  content: string;
  images: string[];
} {
  return {
    url: extractUrl(p),
    title: extractTitle(p),
    content: extractContentField(p),
    images: extractImages(p),
  };
}

function selectGroupsResults(map: Map<string, Grouped>): Grouped[] {
  const results: Grouped[] = [];
  for (const g of map.values()) {
    const freq = new Map<string, number>();
    for (const t of g.titles) freq.set(t, (freq.get(t) ?? 0) + 1);
    const titleCandidates = Array.from(freq.keys());
    let selectedTitle: string | null = null;
    if (titleCandidates.length === 1) selectedTitle = titleCandidates[0];
    else if (titleCandidates.length > 1) {
      selectedTitle = pickBest(
        titleCandidates,
        (t) => (freq.get(t) ?? 0) * 1000 + t.length,
      ) as string;
    }

    const selectedContentEntry = pickBest(g.entries, (e) => {
      const c =
        getString(
          e.raw.content ??
            e.raw.content_html ??
            e.raw.html ??
            e.raw.body ??
            e.raw.content_node ??
            e.raw.introduction_node,
        ) ?? "";
      let score = c.length || 0;
      if (
        typeof e.raw.content === "string" &&
        /user-attachments|\.zip|\.ai|\.svg|\.png|\.gif/i.test(e.raw.content)
      )
        score += 1000;
      return score;
    });

    const selectedContent = selectedContentEntry
      ? (getString(
          selectedContentEntry.raw.content ??
            selectedContentEntry.raw.content_html ??
            selectedContentEntry.raw.html ??
            selectedContentEntry.raw.body ??
            selectedContentEntry.raw.content_node ??
            selectedContentEntry.raw.introduction_node,
        ) ?? null)
      : null;

    const images = Array.from(new Set(g.images.filter(Boolean)));

    results.push({ ...g, selectedTitle, selectedContent, images });
  }
  return results;
}

function groupPages(input: RawPage[]): Map<string, Grouped> {
  const map = new Map<string, Grouped>();
  for (const p of input) {
    const { url, title, content, images } = extractPageFields(p);
    const key =
      url || `__MISSING_URL__${String(p.id ?? title ?? Math.random())}`;
    const group = map.get(key) ?? {
      url: key,
      titles: [],
      selectedTitle: null,
      contents: [],
      selectedContent: null,
      images: [],
      entries: [],
    };

    if (title) group.titles.push(title);
    if (content) group.contents.push(content);
    if (images.length) group.images.push(...images);
    group.entries.push({ id: p.id, raw: p });
    map.set(key, group);
  }
  return map;
}

export default analyzePages;
