import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { isRecord, getProp } from "@/utils/common/typeGuards";
import logger from "@/utils/logger";

export async function generatePageUrls(options?: {
  inPath?: string;
  outPath?: string;
}): Promise<{ count: number; outPath: string }> {
  const toolDir = path.dirname(fileURLToPath(import.meta.url));
  const inPath = options?.inPath ?? path.join(toolDir, "..", "pages.json");
  const outPath =
    options?.outPath ?? path.join(toolDir, "..", "page-urls.json");

  let dataText: string | null = null;
  try {
    if (fs.existsSync(inPath)) {
      const stat = fs.statSync(inPath);
      if (stat.size > 0) dataText = fs.readFileSync(inPath, "utf8");
    }
  } catch {
    dataText = null;
  }

  const parsed: unknown = dataText
    ? (() => {
        try {
          return JSON.parse(dataText);
        } catch {
          return null;
        }
      })()
    : null;

  const rootNodes: unknown[] = Array.isArray(parsed)
    ? (parsed as unknown[])
    : isRecord(parsed) && Array.isArray(getProp(parsed, "pages"))
      ? (getProp(parsed, "pages") as unknown[])
      : [];

  const defaultHost = "https://designsystem.lruddannelse.dk";
  let host = defaultHost;
  let projectId: string | null = null;
  if (dataText) {
    const hostMatch = dataText.match(/(https?:\/\/[^\/]+)\/[0-9a-f]{8}\/p\//i);
    if (hostMatch) host = hostMatch[1];
    const pid = dataText.match(/\/(?:([0-9a-f]{8}))\/p\//i);
    if (pid) projectId = pid[1];
  }
  if (!projectId) projectId = "10548dffa";

  const seenNodes = new WeakSet<object>();
  const findHex = (node: unknown): string | null => {
    if (node == null) return null;
    if (typeof node === "string") {
      const m = node.match(/page-([0-9a-fA-F]+)-/);
      if (m) return m[1];
      const m2 = node.match(/\/p\/([0-9a-fA-F]+)-/);
      if (m2) return m2[1];
      if (node.trim().startsWith("{") || node.trim().startsWith("[")) {
        try {
          const inner = JSON.parse(node);
          return findHex(inner);
        } catch {
          // ignore
        }
      }
      return null;
    }
    if (Array.isArray(node)) {
      for (const it of node) {
        const r = findHex(it);
        if (r) return r;
      }
      return null;
    }
    if (!isRecord(node)) return null;
    if (seenNodes.has(node as object)) return null;
    seenNodes.add(node as object);
    for (const v of Object.values(node)) {
      const r = findHex(v);
      if (r) return r;
    }
    return null;
  };

  const slugify = (s: string): string =>
    s
      .toLowerCase()
      .replace(/[Åå]/g, "aa")
      .replace(/[Øø]/g, "oe")
      .replace(/[Ææ]/g, "ae")
      .normalize("NFKD")
      .replace(/\p{Diacritic}/gu, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

  const rawText = dataText ?? "";

  const hasMeaningfulName = (n: string): boolean => {
    if (!n) return false;
    if (/^_+$/i.test(n)) return false;
    if (/^page[-_]?\d+$/i.test(n)) return false;
    return n.trim().length > 1;
  };

  const extractBlockIds = (item: unknown): string[] => {
    if (!isRecord(item)) return [];
    const v = getProp(item, "blockIds");
    if (Array.isArray(v))
      return v.filter((x) => typeof x === "string") as string[];
    const content = getProp(item, "content");
    if (typeof content === "string" && content.includes("blockIds")) {
      try {
        const c = JSON.parse(content);
        if (Array.isArray(c.blockIds))
          return c.blockIds.filter((x: unknown) => typeof x === "string");
      } catch {
        // ignore
      }
    }
    return [];
  };

  const extractNearbyText = (hex: string): string | null => {
    const re = new RegExp(`page-${hex}-[0-9a-fA-F-]{3,}`, "g");
    let m1: RegExpExecArray | null;
    const contexts: string[] = [];
    while ((m1 = re.exec(rawText)) !== null) {
      const idx = m1.index;
      const ctxStart = Math.max(0, idx - 600);
      const ctxEnd = Math.min(rawText.length, idx + 600);
      contexts.push(rawText.slice(ctxStart, ctxEnd));
      if (contexts.length > 20) break;
    }
    if (!contexts.length) return null;
    const ctx = contexts.join("\n");
    // 1) Prefer explicit JSON "text":"..." occurrences nearby
    const textRe = /"text":"([^\"]{3,200})"/g;
    const textMatches: string[] = [];
    let tm: RegExpExecArray | null;
    while ((tm = textRe.exec(ctx)) !== null) textMatches.push(tm[1].trim());
    if (textMatches.length) {
      // prefer the longest short phrase (<=12 words)
      const filtered = textMatches
        .map((s) => s.replace(/\s+/g, " ").trim())
        .filter(Boolean);
      filtered.sort(
        (a, b) =>
          b.split(/\s+/).length - a.split(/\s+/).length || b.length - a.length,
      );
      for (const cand of filtered)
        if (cand.split(/\s+/).length <= 12) return cand;
      return filtered[0] ?? null;
    }
    // 2) Fallback to heading-like phrase capture (allow unicode letters, digits, basic punctuation)
    const phraseRe = /([^"\{\}\[\]\n]{4,140})/g;
    const matches: string[] = [];
    let mm: RegExpExecArray | null;
    while ((mm = phraseRe.exec(ctx)) !== null) {
      const s = mm[1].trim();
      if (s && s.length > 3) matches.push(s);
    }
    if (matches.length) {
      // choose a reasonably short candidate with word count <=12
      matches.sort(
        (a, b) =>
          a.split(/\s+/).length - b.split(/\s+/).length || b.length - a.length,
      );
      for (const cand of matches)
        if (cand.split(/\s+/).length <= 12) return cand;
      return matches[0];
    }
    return null;
  };

  const searchRawForSlug = (hex: string): string | null => {
    if (!rawText) return null;
    const re = new RegExp(`${hex}-([\\p{L}0-9%\\-]{3,})`, "giu");
    const candidates: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(rawText)) !== null) {
      candidates.push(m[1]);
    }
    if (!candidates.length) return null;
    const alphaCandidates = candidates.filter(
      (c) => /[a-z]/i.test(c) && !/^[-0-9]+$/.test(c),
    );
    const pick = (arr: string[]): string | null =>
      arr.length ? arr.sort((a, b) => b.length - a.length)[0] : null;
    return pick(alphaCandidates) ?? pick(candidates);
  };

  // Collect candidate names per hex by scanning page objects
  const hexNameMap = new Map<string, Set<string>>();
  const addHexName = (h: string | null, name: string | null): void => {
    if (!h || !name) return;
    if (!hasMeaningfulName(name)) return;
    const set = hexNameMap.get(h) ?? new Set<string>();
    set.add(name.trim());
    hexNameMap.set(h, set);
  };

  for (const node of rootNodes) {
    if (!isRecord(node)) continue;
    const h = findHex(node);
    const name = getProp(node, "name");
    if (typeof name === "string") addHexName(h, name);
    const contentNode = getProp(node, "content_node");
    const introNode = getProp(node, "introduction_node");
    const collectTexts = (v: unknown, acc: string[]): void => {
      if (v == null) return;
      if (typeof v === "string") {
        if (v.includes("text")) {
          try {
            const j = JSON.parse(v);
            collectTexts(j, acc);
          } catch {
            // fallback: extract quoted text
            const m = v.match(/"text":"([^\"]{3,})"/g);
            if (m) for (const x of m) acc.push(x.replace(/^"text":"|"$/g, ""));
          }
        } else {
          // bare string
          if (v.trim().length <= 120) acc.push(v.trim());
        }
        return;
      }
      if (Array.isArray(v)) {
        for (const it of v) collectTexts(it, acc);
        return;
      }
      if (!isRecord(v)) return;
      for (const vv of Object.values(v)) collectTexts(vv, acc);
    };
    const extracted: string[] = [];
    collectTexts(contentNode, extracted);
    collectTexts(introNode, extracted);
    for (const t of extracted) addHexName(h, t);
  }

  // Scan raw payload for explicit page- and /p/ occurrences, preserving order
  const rawSlugMap = new Map<string, Set<string>>();
  const rawHexOrder: string[] = [];
  // Build capture maps (title -> url, url -> model) from the captured raw
  // `pages.json` payload. This mirrors the remote builder's `loadCaptureMap`
  // behavior so we can prefer captured canonical URLs when resolving pages.
  const captureTitleToUrl = new Map<string, string>();
  const captureUrlToModel = new Map<
    string,
    {
      url: string;
      title?: string | null;
      content?: string | null;
      images?: string[];
    }
  >();
  if (rawText) {
    const pathRe = new RegExp(`/p/([0-9a-fA-F]+)-([^"'\s\,\}<>]{3,})`, "giu");
    let mm: RegExpExecArray | null;
    while ((mm = pathRe.exec(rawText)) !== null) {
      const hex = mm[1];
      const slug = mm[2];
      const set = rawSlugMap.get(hex) ?? new Set<string>();
      if (!rawSlugMap.has(hex)) rawHexOrder.push(hex);
      set.add(slug);
      rawSlugMap.set(hex, set);

      const full = `${host}/${projectId}/p/${hex}-${slug}`;
      const pos = mm.index;
      const ctxStart = Math.max(0, pos - 600);
      const ctxEnd = Math.min(rawText.length, pos + 600);
      const ctx = rawText.slice(ctxStart, ctxEnd);
      const textMatch = ctx.match(/"text"\s*:\s*"([^\"]{3,200})"/i);
      const titleMatch = ctx.match(/"title"\s*:\s*"([^\"]{3,200})"/i);
      const nameMatch = ctx.match(/"name"\s*:\s*"([^\"]{3,200})"/i);
      const candidate =
        (textMatch && textMatch[1]) ||
        (titleMatch && titleMatch[1]) ||
        (nameMatch && nameMatch[1]) ||
        null;
      const key = candidate
        ? candidate.trim().replace(/\s+/g, " ").toLowerCase()
        : null;
      if (key && !captureTitleToUrl.has(key)) captureTitleToUrl.set(key, full);
      captureUrlToModel.set(full.replace(/\/+$/, ""), {
        url: full.replace(/\/+$/, ""),
        title: candidate ?? null,
        content: ctx.slice(0, 1000),
        images: [],
      });
    }

    // Also include page-<hex>- token occurrences into rawSlugMap so hexes are known
    const pageRe = new RegExp(`page-([0-9a-fA-F]+)-([0-9a-fA-F-]{3,})`, "giu");
    while ((mm = pageRe.exec(rawText)) !== null) {
      const hex = mm[1];
      const token = mm[2];
      const set2 = rawSlugMap.get(hex) ?? new Set<string>();
      if (!rawSlugMap.has(hex)) rawHexOrder.push(hex);
      set2.add(token);
      rawSlugMap.set(hex, set2);
    }
  }

  // Determine per-index hex (if present in the page object)
  const perIndexHex: Array<string | null> = Array(rootNodes.length).fill(null);
  const allHexes = new Set<string>();
  for (let idx = 0; idx < rootNodes.length; idx++) {
    const item = rootNodes[idx];
    if (!isRecord(item)) continue;
    const blockIds = extractBlockIds(item);
    let hex: string | null = null;
    for (const b of blockIds) {
      const m = b.match(/page-([0-9a-fA-F]+)-/);
      if (m) {
        hex = m[1];
        break;
      }
    }
    if (!hex) hex = findHex(item);
    perIndexHex[idx] = hex;
    if (!hex) continue;

    // derive a candidate slug for this page and add to the hexNameMap
    let slugText: string | null = null;
    // 1) Prefer the explicit `name` when it's meaningful and does NOT start with underscores
    const nameProp = getProp(item, "name");
    if (
      typeof nameProp === "string" &&
      hasMeaningfulName(nameProp) &&
      !/^_+/.test(nameProp)
    ) {
      slugText = nameProp;
    }
    // 1b) If the page's name is unusable, try to find a referencing page that has a usable name for one of our blockIds
    const findNameByBlockId = (blockId: string): string | null => {
      try {
        for (const p of rootNodes) {
          if (!isRecord(p)) continue;
          const n = getProp(p, "name");
          if (typeof n === "string" && !/^_+/.test(n) && hasMeaningfulName(n)) {
            const s = JSON.stringify(p);
            if (s.includes(blockId)) return n;
          }
        }
      } catch {
        // ignore
      }
      return null;
    };
    if (!slugText && blockIds && blockIds.length) {
      for (const b of blockIds) {
        const found = findNameByBlockId(b);
        if (found) {
          slugText = found;
          break;
        }
      }
    }
    // 2) If no usable `name`, prefer any short heading/title texts we extracted for this hex
    if (!slugText) {
      const candidates = hexNameMap.get(hex);
      if (candidates && candidates.size) {
        const arr = Array.from(candidates);
        arr.sort(
          (a, b) =>
            a.split(/\s+/).length - b.split(/\s+/).length ||
            b.length - a.length,
        );
        slugText = arr[0];
      }
    }
    // 3) Then prefer alpha-containing explicit raw slug tokens (from `page-...` or `/p/` occurrences)
    if (!slugText) {
      const rawCandidates = rawSlugMap.get(hex);
      if (rawCandidates && rawCandidates.size) {
        const arr = Array.from(rawCandidates).filter((c) => /[\p{L}]/u.test(c));
        if (arr.length) slugText = arr.sort((a, b) => b.length - a.length)[0];
      }
    }
    // 4) Next, try regex search in the raw payload
    if (!slugText) slugText = searchRawForSlug(hex) ?? null;
    // 5) Try to pull short text from content_node / introduction_node as a fallback
    if (!slugText) {
      const contentNode = getProp(item, "content_node");
      const intro = getProp(item, "introduction_node");
      const scan = (v: unknown): string | null => {
        if (typeof v === "string" && v.includes("text")) {
          try {
            const j = JSON.parse(v);
            const js = JSON.stringify(j);
            const t = js.match(/"text":"([^\"]{3,})"/);
            if (t) return t[1];
          } catch {
            // ignore
          }
        }
        return null;
      };
      slugText =
        scan(contentNode) ?? scan(intro) ?? extractNearbyText(hex) ?? null;
    }
    const set = hexNameMap.get(hex) ?? new Set<string>();
    if (slugText) set.add(slugText);
    hexNameMap.set(hex, set);
    allHexes.add(hex);
  }

  // Assign missing hexes by raw order to keep index alignment
  const assignedHexByIndex: string[] = [];
  const used = new Set<string>();
  let rawIdx = 0;
  for (let i = 0; i < perIndexHex.length; i++) {
    let h = perIndexHex[i];
    if (!h) {
      while (rawIdx < rawHexOrder.length && used.has(rawHexOrder[rawIdx]))
        rawIdx++;
      h = rawHexOrder[rawIdx] ?? null;
      rawIdx++;
    }
    if (!h) continue;
    assignedHexByIndex.push(h);
    used.add(h);
  }

  const pickBest = (arr: string[] | undefined): string | null => {
    if (!arr || !arr.length) return null;
    const sanitize = (s: string): string =>
      s
        .replace(/\s+/g, " ")
        .trim()
        .replace(/^[-_]+|[-_]+$/g, "");
    const words = (s: string): string[] =>
      sanitize(s)
        .split(/[-\s]+/)
        .filter(Boolean);
    const isAlpha = (s: string): boolean => /[\p{L}]/u.test(s);
    const isNumericOnly = (s: string): boolean => /^[-0-9%_]+$/.test(s);
    const isSentenceLike = (s: string): boolean =>
      words(s).length > 12 || /[\.,\;\:]/.test(s);

    const cleaned = Array.from(new Set(arr.map(sanitize))).filter(Boolean);
    const looksLikeNoise = (s: string): boolean => {
      if (/page[-_]/i.test(s)) return true;
      // repeated hex-like groups or long uuid-like tokens
      const hexGroups = (s.match(/[0-9a-f]{6,}/gi) || []).length;
      if (hexGroups >= 2) return true;
      if (/^[0-9a-f]{8}[-0-9a-f]{8,}$/i.test(s)) return true;
      // long single token with no spaces and lots of punctuation: likely an id
      if (!/\s/.test(s) && s.length > 40) return true;
      return false;
    };
    const filteredCleaned = cleaned.filter((c) => !looksLikeNoise(c));
    // Prefer explicit, slug-like candidates (letters + hyphens)
    const explicit = (
      filteredCleaned.length ? filteredCleaned : cleaned
    ).filter(
      (c) =>
        isAlpha(c) && /-/.test(c) && !isNumericOnly(c) && !isSentenceLike(c),
    );
    if (explicit.length) return explicit.sort((a, b) => b.length - a.length)[0];

    // Then prefer short title-like candidates from names (<=6 words, not a sentence)
    const titleCandidates = (
      filteredCleaned.length ? filteredCleaned : cleaned
    ).filter(
      (c) =>
        isAlpha(c) &&
        words(c).length <= 8 &&
        !isSentenceLike(c) &&
        !isNumericOnly(c),
    );
    if (titleCandidates.length)
      return titleCandidates.sort((a, b) => b.length - a.length)[0];

    // Then any alpha-containing candidate (trim very long sentences)
    const alpha = (filteredCleaned.length ? filteredCleaned : cleaned).filter(
      (c) => isAlpha(c) && !isNumericOnly(c),
    );
    if (alpha.length) return alpha.sort((a, b) => b.length - a.length)[0];

    // Last resort: return the longest raw candidate
    return (
      (filteredCleaned.length ? filteredCleaned : cleaned).sort(
        (a, b) => b.length - a.length,
      )[0] ?? null
    );
  };

  const hexToChosen = new Map<string, string>();
  for (const h of assignedHexByIndex) {
    // If we have a captured title->url for this hex, prefer the slug found there
    let captureSlug: string | null = null;
    for (const [t, u] of captureTitleToUrl.entries()) {
      if (u.includes(`/${projectId}/p/${h}-`) || u.includes(`/p/${h}-`)) {
        const m = u.match(new RegExp(`/p/${h}-([\\w\\-%]+)`));
        if (m) {
          captureSlug = m[1];
          break;
        }
      }
    }
    // If we don't have an exact capture slug, try fuzzy-matching extracted names against captured titles
    if (!captureSlug) {
      const nameSetForHex = hexNameMap.get(h);
      if (nameSetForHex && nameSetForHex.size) {
        const names = Array.from(nameSetForHex).map((s) =>
          s.trim().toLowerCase(),
        );
        for (const [capKey, capUrl] of captureTitleToUrl.entries()) {
          const k = capKey.toLowerCase();
          for (const n of names) {
            if (!n) continue;
            if (k.includes(n) || n.includes(k)) {
              const m = capUrl.match(new RegExp(`/p/${h}-([\\w\\-%]+)`));
              if (m) {
                captureSlug = m[1];
                break;
              }
            }
          }
          if (captureSlug) break;
        }
      }
    }
    const rawSet = rawSlugMap.get(h);
    const rawArr = rawSet ? Array.from(rawSet) : undefined;
    const rawAlphaArr = rawArr
      ? rawArr.filter((c) => /[\p{L}]/u.test(c) && !/^[-0-9%_]+$/.test(c))
      : undefined;
    const nameSet = hexNameMap.get(h);
    const nameArr = nameSet ? Array.from(nameSet) : undefined;
    // Prefer capture slug (exact) first, then title/name candidates, then explicit alpha-containing raw tokens, then raw tokens
    let chosen: string | null = null;
    if (captureSlug) chosen = captureSlug;
    if (nameArr && nameArr.length) chosen = pickBest(nameArr);
    if (!chosen && rawAlphaArr && rawAlphaArr.length)
      chosen = pickBest(rawAlphaArr);
    if (!chosen && rawArr && rawArr.length) chosen = pickBest(rawArr);
    // If still nothing, try searching the raw text for a slug-like fragment
    if (!chosen) {
      const searched = searchRawForSlug(h);
      if (searched && /[\p{L}]/u.test(searched) && searched.length < 160)
        chosen = searched;
    }
    // If still nothing, fall back to the longest meaningful name available
    if (!chosen && nameArr && nameArr.length)
      chosen = nameArr.sort((a, b) => b.length - a.length)[0];
    if (!chosen && rawArr && rawArr.length)
      chosen = rawArr.sort((a, b) => b.length - a.length)[0];
    if (!chosen) chosen = "";
    hexToChosen.set(h, chosen);
  }

  const finalUrls: string[] = [];
  for (const h of assignedHexByIndex) {
    const chosen = hexToChosen.get(h) ?? "";
    const slug = `${h}-${slugify(chosen ?? "")}`;
    finalUrls.push(`${host}/${projectId}/p/${slug}`);
  }

  // Deduplicate while preserving order
  const seenUrls = new Set<string>();
  const uniqueUrls = finalUrls.filter((u) => {
    if (seenUrls.has(u)) return false;
    seenUrls.add(u);
    return true;
  });

  // Ensure we also include any raw /p/ or page- occurrences found in the raw payload
  // that were not aligned with rootNodes — this picks the best slug for any
  // hex seen only in raw references and appends them while preserving order.
  for (const hex of rawHexOrder) {
    // skip if we already have a URL for this hex
    if (Array.from(seenUrls).some((u) => u.includes(`/p/${hex}-`))) continue;
    const rawSet = rawSlugMap.get(hex);
    const rawArr = rawSet ? Array.from(rawSet) : undefined;
    // Prefer captureUrlToModel if available
    let chosenSlug: string | null = null;
    for (const [full, model] of captureUrlToModel.entries()) {
      if (full.includes(`/p/${hex}-`)) {
        const m = full.match(new RegExp(`/p/${hex}-([\\w\\-%]+)`));
        if (m) {
          chosenSlug = m[1];
          break;
        }
      }
    }
    if (!chosenSlug && rawArr && rawArr.length) chosenSlug = pickBest(rawArr);
    const nameSet = hexNameMap.get(hex);
    if (!chosenSlug && nameSet && nameSet.size)
      chosenSlug = pickBest(Array.from(nameSet));
    if (!chosenSlug) chosenSlug = searchRawForSlug(hex) ?? "";
    const slug = `${hex}-${slugify(chosenSlug ?? "")}`;
    const url = `${host}/${projectId}/p/${slug}`;
    if (!seenUrls.has(url)) {
      uniqueUrls.push(url);
      seenUrls.add(url);
    }
  }

  // Always write the output file so the caller can inspect it, even if empty.
  try {
    fs.writeFileSync(outPath, JSON.stringify(uniqueUrls, null, 2), "utf8");
  } catch (e) {
    throw new Error(`Failed to write ${outPath}: ${String(e)}`);
  }

  return { count: uniqueUrls.length, outPath };
}

export default generatePageUrls;

// Allow running directly: `npx tsx src/tools/api-scraper/utils/generate-page-urls.ts`
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  (async () => {
    try {
      const res = await generatePageUrls();
      logger.log(`wrote ${res.count} urls to ${res.outPath}`);
    } catch (e) {
      logger.error(e instanceof Error ? e.message : String(e));
      process.exit(1);
    }
  })();
}
