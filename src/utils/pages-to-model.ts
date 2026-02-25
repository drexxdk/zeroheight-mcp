import { createHash } from "crypto";
import { config } from "./config";

export type PageModel = {
  url: string;
  title: string;
  content: string;
  images: string[];
};

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function isString(v: unknown): v is string {
  return typeof v === "string";
}

export function scanNodeForLinks(
  node: unknown,
  titleToLink: Map<string, string>,
  linkToTitle: Map<string, string>,
): void {
  if (isString(node)) {
    const re = /https?:\/\/[^\s"')]+\/p\/[0-9a-fA-F\-\w]+/g;
    const m = node.match(re);
    if (m) for (const url of m) titleToLink.set(url, url);
    return;
  }
  if (Array.isArray(node)) {
    for (const c of node) scanNodeForLinks(c, titleToLink, linkToTitle);
    return;
  }
  if (!isObject(node)) return;

  scanShortcutTiles(node, titleToLink);
  scanLinkAndTitle(node, titleToLink, linkToTitle);

  for (const k of Object.keys(node))
    scanNodeForLinks(node[k], titleToLink, linkToTitle);
}

function scanShortcutTiles(
  node: Record<string, unknown>,
  titleToLink: Map<string, string>,
): void {
  const st = node["shortcutTiles"] ?? node["shortcut-tiles"];
  if (!Array.isArray(st)) return;
  for (const item of st) {
    if (!isObject(item)) continue;
    const link = getStringField(item, ["link"]);
    const title = getStringField(item, ["title"]);
    if (link && title) titleToLink.set(title, link);
  }
}

function scanLinkAndTitle(
  node: Record<string, unknown>,
  titleToLink: Map<string, string>,
  linkToTitle: Map<string, string>,
): void {
  const link = getStringField(node, ["link"]);
  const title = getStringField(node, ["title"]);
  if (link && title) {
    titleToLink.set(title, link);
    linkToTitle.set(link, title);
  }
}

function getStringField(obj: unknown, keys: string[]): string | undefined {
  if (!isObject(obj)) return undefined;
  for (const k of keys) {
    const v = obj[k];
    if (isString(v) && v.trim() !== "") return v.trim();
  }
  return undefined;
}

function processInsertObject(ins: unknown, out: string[]): void {
  if (!isObject(ins)) return;
  processInsertImages(ins, out);
  processUserAttachmentsInInsert(ins, out);
  processShortcutTilesInInsert(ins, out);
}

function processInsertImages(
  ins: Record<string, unknown>,
  out: string[],
): void {
  if (isObject(ins["image-zh"])) {
    const imgObj = ins["image-zh"];
    const img = getStringField(imgObj, ["image", "src", "url", "path"]);
    if (img) out.push(img);
  }
  if (isObject(ins["image"])) {
    const imgObj = ins["image"];
    const img = getStringField(imgObj, ["image", "src", "url", "path"]);
    if (img) out.push(img);
  }
}

function processUserAttachmentsInInsert(
  ins: Record<string, unknown>,
  out: string[],
): void {
  if (!Array.isArray(ins["user-attachments"])) return;
  const ua = ins["user-attachments"] as unknown[];
  const lines: string[] = [];
  for (const f of ua) {
    if (!isObject(f)) continue;
    const name = getStringField(f, ["name"]) || "";
    const date = getStringField(f, ["date"]) || "";
    const size = getStringField(f, ["size"]) || "";
    const ext = getStringField(f, ["ext"]) || "";
    const extUp = ext ? ext.toUpperCase() : "";
    if (name) lines.push(name);
    if (date || size || extUp)
      lines.push([date, size, extUp].filter(Boolean).join(" "));
  }
  if (lines.length) out.push(lines.join("\n"));
}

function processShortcutTilesInInsert(
  ins: Record<string, unknown>,
  out: string[],
): void {
  if (!(isObject(ins["shortcut-tiles"]) || isObject(ins["shortcutTiles"])))
    return;
  const st = ins["shortcut-tiles"] ?? ins["shortcutTiles"];
  const arr = Array.isArray(st)
    ? st
    : isObject(st)
      ? st["shortcutTiles"]
      : undefined;
  if (!Array.isArray(arr)) return;
  const titles: string[] = [];
  for (const it of arr) {
    if (!isObject(it)) continue;
    const t = getStringField(it, ["title"]);
    const l = getStringField(it, ["link"]);
    if (t && l) titles.push(`${t} (${l})`);
    else if (t) titles.push(t);
  }
  if (titles.length) out.push(titles.join(", "));
}

function extractImagesFromHtml(html: string): string[] {
  const urls: string[] = [];
  try {
    const re = /<img[^>]+src=["']?([^"' >]+)["']?/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html))) {
      if (m[1]) urls.push(m[1]);
    }
  } catch (_e) {
    // noop
  }
  return urls;
}

function collectImageUrls(obj: Record<string, unknown>): string[] {
  const found: string[] = [];
  // images may be an array or an object mapping (from DB snapshots)
  found.push(...collectImagesField(obj["images"]));

  // fields that may directly contain a URL
  const single = getStringField(obj, ["image", "cover", "hero_image"]);
  if (single) found.push(single);

  // try to extract from html fields
  const html = getStringField(obj, ["html", "content_html", "body", "content"]);
  if (html) {
    found.push(...extractImagesFromHtml(html));
  }

  // parse ProseMirror-ish JSON in content_node / introduction_node and look for image refs
  found.push(...parseJsonAndCollectImageRefs(obj["content_node"]));
  found.push(...parseJsonAndCollectImageRefs(obj["introduction_node"]));

  // resolve relative paths against the page's URL origin when possible
  let baseOrigin: string | undefined;
  const pageUrl = getStringField(obj, [
    "url",
    "path",
    "href",
    "page_url",
    "slug",
  ]);
  if (pageUrl) {
    try {
      const u = new URL(pageUrl as string);
      baseOrigin = u.origin;
    } catch (_e) {
      // not an absolute url
    }
  }
  // fallback: use ZEROHEIGHT_PROJECT_URL from config when available (set by scripts)
  if (!baseOrigin) {
    try {
      baseOrigin = new URL(config.env.zeroheightProjectUrl).origin;
    } catch (_e) {
      // ignore
    }
  }

  const resolved = Array.from(new Set(found.filter(isString))).map((u) => {
    if (u.startsWith("//")) return `https:${u}`;
    if (u.startsWith("/") && baseOrigin) return `${baseOrigin}${u}`;
    return u;
  });

  return resolved;
}

function collectImagesField(field: unknown): string[] {
  const out: string[] = [];
  if (Array.isArray(field)) {
    for (const it of field) {
      if (isString(it)) out.push(it);
      else if (isObject(it)) {
        const u = getStringField(it, ["original_url", "url", "src", "path"]);
        if (u) out.push(u);
      }
    }
  } else if (isObject(field)) {
    for (const v of Object.values(field)) {
      if (isString(v)) out.push(v);
      else if (isObject(v)) {
        const u = getStringField(v, [
          "public_url",
          "url",
          "original_url",
          "src",
          "path",
        ]);
        if (u) out.push(u);
      }
    }
  }
  return out;
}

function determineUrlForPage(
  p: unknown,
  titleToLink: Map<string, string>,
): string {
  let url =
    getStringField(p, ["url", "path", "href", "page_url", "slug"]) || "";
  const title =
    getStringField(p, ["title", "name", "label", "display_name"]) || "";
  if (!url && title && titleToLink.has(title)) {
    const maybe = titleToLink.get(title);
    if (maybe) url = maybe;
  }
  if (!url && title) {
    const slug = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    const idVal = (isObject(p) && p["id"]) ?? title;
    const short = createHash("md5")
      .update(String(idVal))
      .digest("hex")
      .slice(0, 6);
    url = `https://designsystem.lruddannelse.dk/10548dffa/p/${short}-${slug}`;
  }
  return url;
}

function buildContentForPage(
  p: unknown,
  linkToTitle: Map<string, string>,
): string {
  const fragments: string[] = [];
  const intro = isObject(p) ? p["introduction_node"] : undefined;
  if (isString(intro)) {
    try {
      const parsedIntro = JSON.parse(intro);
      const acc: string[] = [];
      extractTextFromProse(parsedIntro, acc);
      if (acc.length) fragments.push(acc.join("\n\n"));
    } catch (_e) {
      // ignore
    }
  }
  const contentNode = isObject(p) ? p["content_node"] : undefined;
  if (isString(contentNode)) {
    try {
      const parsed = JSON.parse(contentNode);
      const acc: string[] = [];
      extractTextFromProse(parsed, acc);
      if (acc.length) fragments.push(acc.join("\n\n"));
    } catch (_e) {
      // fallback
    }
  }
  const rawContentFallback = getStringField(p, [
    "content_html",
    "html",
    "body",
    "content",
  ]);
  if (rawContentFallback) {
    const processed = processRawContentFallback(rawContentFallback);
    if (processed) fragments.push(processed);
  }
  let content = fragments.join("\n\n").trim();

  content = applyParentTitlePrefix(content, p, linkToTitle);

  return content;
}

function processRawContentFallback(rawContentFallback: string): string | null {
  const extracted = tryExtractEmbeddedJson(rawContentFallback);
  if (extracted) {
    const openIndex = rawContentFallback.indexOf("{");
    let prefix = rawContentFallback;
    if (openIndex !== -1) {
      let depth = 0;
      let endIndex = -1;
      for (let i = openIndex; i < rawContentFallback.length; i++) {
        const ch = rawContentFallback[i];
        if (ch === "{") depth++;
        else if (ch === "}") {
          depth--;
          if (depth === 0) {
            endIndex = i + 1;
            break;
          }
        }
      }
      prefix =
        endIndex === -1
          ? rawContentFallback
          : rawContentFallback.slice(0, openIndex).trim();
    }
    return [prefix, extracted].filter(Boolean).join("\n\n").trim();
  }
  return rawContentFallback || null;
}

function applyParentTitlePrefix(
  content: string,
  p: unknown,
  linkToTitle: Map<string, string>,
): string {
  try {
    const url = determineUrlForPage(p, new Map());
    const parentTitle = linkToTitle.get(url);
    const title =
      getStringField(p, ["title", "name", "label", "display_name"]) || "";
    if (parentTitle && title) {
      const prefix = `${parentTitle}\n${title}`;
      if (
        content &&
        !content.startsWith(parentTitle) &&
        !content.startsWith(title)
      ) {
        const combined = [prefix, content].filter(Boolean).join("\n\n");
        if (combined.length > content.length) return combined.trim();
      }
    }
  } catch (_e) {
    // ignore
  }
  return content;
}

function parseJsonAndCollectImageRefs(field?: unknown): string[] {
  const out: string[] = [];
  if (!isString(field)) return out;
  try {
    const parsed = JSON.parse(field);
    const walk = (n: unknown): void => {
      if (isString(n)) return;
      if (Array.isArray(n)) return n.forEach(walk);
      if (!isObject(n)) return;
      const img1 = getStringField(n, ["image"]);
      const img2 = getStringField(n, ["src"]);
      const img3 = getStringField(n, ["url"]);
      if (img1) out.push(img1);
      if (img2) out.push(img2);
      if (img3) out.push(img3);
      const imageZh = n["image-zh"];
      if (isObject(imageZh)) {
        const u = getStringField(imageZh, ["image", "src", "url", "path"]);
        if (u) out.push(u);
      }
      for (const v of Object.values(n)) walk(v);
    };
    walk(parsed);
  } catch (_e) {
    // ignore
  }
  return out;
}

function extractTextFromOps(ops: unknown): string[] {
  const out: string[] = [];
  if (!Array.isArray(ops)) return out;
  for (const op of ops) {
    if (isString(op)) {
      out.push(op);
      continue;
    }
    if (isObject(op)) {
      // plain text insert
      if (isString(op["insert"])) out.push(op["insert"] as string);
      // insert may be object like {shortcut-tiles: {...}}
      const ins = op["insert"];
      if (isObject(ins)) processInsertObject(ins, out);
    }
  }
  return out.map((s) => (s || "").toString());
}

function tryExtractEmbeddedJson(content: string): string | undefined {
  const jsonStr = findJsonSlice(content);
  if (!jsonStr) return undefined;
  try {
    const parsed = JSON.parse(jsonStr);
    const pieces: string[] = extractPiecesFromParsed(parsed);
    const headings: string[] = collectHeadingsFromParsed(parsed);

    // fallback to empty
    const body = pieces.filter(Boolean).join("\n\n").trim();
    const combined = [...headings.filter(Boolean), body]
      .filter(Boolean)
      .join("\n\n")
      .trim();
    // If there's no readable text, but the parsed JSON contains image refs,
    // synthesize a short list of image URLs so we don't leave the raw JSON verbatim.
    if (!combined) {
      const imgs = collectImageRefsFromParsed(parsed);
      if (imgs.length) return imgs.join("\n");
    }
    return combined || undefined;
  } catch (_e) {
    return undefined;
  }
}

function extractPiecesFromParsed(parsed: unknown): string[] {
  const pieces: string[] = [];
  if (isObject(parsed) && Array.isArray(parsed["ops"])) {
    pieces.push(...extractTextFromOps(parsed["ops"]));
  }
  if (isObject(parsed) && isObject(parsed["content"])) {
    const contentObj = parsed["content"];
    if (isObject(contentObj) && Array.isArray(contentObj["ops"])) {
      pieces.push(...extractTextFromOps(contentObj["ops"]));
    }
  }
  if (isObject(parsed)) {
    for (const v of Object.values(parsed)) {
      if (isObject(v) && Array.isArray(v["ops"])) {
        pieces.push(...extractTextFromOps(v["ops"]));
      }
    }
  }
  return pieces;
}

function collectHeadingsFromParsed(p: unknown): string[] {
  const out: string[] = [];
  if (!isObject(p)) return out;
  if (Array.isArray(p["headings"])) {
    for (const h of p["headings"]) {
      if (isObject(h)) {
        const t = getStringField(h, ["text", "name", "title"]);
        if (t) out.push(t);
      }
    }
  }
  if (isObject(p["tabs"])) {
    for (const v of Object.values(p["tabs"])) {
      if (isObject(v)) {
        const n = getStringField(v, ["name", "title"]);
        if (n) out.push(n);
      }
    }
  }
  return out;
}

function collectImageRefsFromParsed(parsed: unknown): string[] {
  const imgs: string[] = [];
  try {
    const walk = (n: unknown): void => {
      if (isString(n)) return;
      if (Array.isArray(n)) return n.forEach(walk);
      if (!isObject(n)) return;
      if (isString(n["image"])) imgs.push(n["image"] as string);
      if (isString(n["src"])) imgs.push(n["src"] as string);
      if (isString(n["url"])) imgs.push(n["url"] as string);
      if (isObject(n["image-zh"])) {
        const z = n["image-zh"];
        const u = getStringField(z, ["image", "src", "url", "path"]);
        if (u) imgs.push(u);
      }
      for (const v of Object.values(n)) walk(v);
    };
    walk(parsed);
  } catch (_e) {
    // ignore
  }
  return imgs;
}

function findJsonSlice(content: string): string | undefined {
  const needle = '"ops"';
  const needle2 = '"shortcut-tiles"';
  const idx = content.indexOf("{");
  const idxOps = content.indexOf(needle);
  const idxST = content.indexOf(needle2);
  const start =
    idxOps !== -1 || idxST !== -1
      ? Math.min(
          idxOps === -1 ? Infinity : idxOps,
          idxST === -1 ? Infinity : idxST,
        )
      : -1;
  if (start === -1) return undefined;

  let openIndex = content.lastIndexOf("{", start);
  if (openIndex === -1) openIndex = idx;

  let depth = 0;
  let endIndex = -1;
  for (let i = openIndex; i < content.length; i++) {
    const ch = content[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        endIndex = i + 1;
        break;
      }
    }
  }
  if (endIndex === -1) return undefined;

  return content.slice(openIndex, endIndex);
}

// Prose extraction helpers (top-level so other helpers can reuse them)
function extractTextFromProse(node: unknown, out: string[]): void {
  if (isString(node)) return;
  if (!isObject(node) && !Array.isArray(node)) return;
  if (Array.isArray(node)) {
    for (const c of node) extractTextFromProse(c, out);
    return;
  }
  const para = getParagraphOrHeadingText(node);
  if (para) {
    out.push(para);
    return;
  }
  const type = getStringField(node, ["type"]);
  if (type === "bulletList" && Array.isArray(node["content"])) {
    for (const li of node["content"] as unknown[])
      extractTextFromProse(li, out);
    return;
  }
  for (const k of Object.keys(node)) extractTextFromProse(node[k], out);
}

function getParagraphOrHeadingText(node: unknown): string | undefined {
  if (!isObject(node)) return undefined;
  const type = getStringField(node, ["type"]);
  if (type !== "paragraph" && type !== "heading") return undefined;
  if (!Array.isArray(node["content"])) return undefined;
  const parts: string[] = [];
  for (const c of node["content"] as unknown[]) {
    if (isObject(c) && isString(c["text"])) parts.push(c["text"] as string);
  }
  return parts.length ? parts.join("") : undefined;
}

function buildTitleAndLinkMapsTop(pagesList: unknown[]): {
  titleToLink: Map<string, string>;
  linkToTitle: Map<string, string>;
} {
  const localTitleToLink = new Map<string, string>();
  const localLinkToTitle = new Map<string, string>();
  const urlRegex = /https?:\/\/[^\s"')]+\/p\/[0-9a-fA-F\-\w]+/g;
  for (const rawPage of pagesList) {
    if (!isObject(rawPage)) continue;
    const contentNodeStr = rawPage["content_node"];
    if (isString(contentNodeStr)) {
      try {
        const parsed = JSON.parse(contentNodeStr);
        scanNodeForLinks(parsed, localTitleToLink, localLinkToTitle);
      } catch (_e) {
        // ignore parse errors
      }
    }
    const contentStr = rawPage["content"];
    if (isString(contentStr))
      scanNodeForLinks(contentStr, localTitleToLink, localLinkToTitle);
  }

  // second pass: map links in plain content to a parent title
  for (const rawPage of pagesList) {
    if (!isObject(rawPage)) continue;
    const pageTitle = getStringField(rawPage, ["title", "name", "label"]);
    if (!pageTitle) continue;
    const candidates: string[] = [];
    const contentStr = rawPage["content"];
    if (isString(contentStr)) candidates.push(contentStr);
    const htmlStr = getStringField(rawPage, ["content_html", "html", "body"]);
    if (htmlStr) candidates.push(htmlStr);
    const contentNodeStr = rawPage["content_node"];
    if (isString(contentNodeStr)) candidates.push(contentNodeStr);
    for (const c of candidates) {
      const m = c.match(urlRegex);
      if (m) for (const u of m) localLinkToTitle.set(u, pageTitle);
    }
  }

  return { titleToLink: localTitleToLink, linkToTitle: localLinkToTitle };
}

export function convertPagesToModel(raw: unknown): PageModel[] {
  const pages: unknown[] = Array.isArray(raw)
    ? raw
    : isObject(raw) && Array.isArray(raw["pages"])
      ? (raw["pages"] as unknown[])
      : [];

  const maps = buildTitleAndLinkMapsTop(pages);
  const titleToLink = maps.titleToLink;
  const linkToTitle = maps.linkToTitle;

  // pickTitleForEntries and pickContentForEntries were removed; selection logic lives inline below

  // Moveable top-level wrapper for prose extraction so convertPagesToModel stays smaller

  // removed unused stubs

  const out: PageModel[] = [];
  for (const p of pages) {
    if (!isObject(p)) continue;
    const url = determineUrlForPage(p, titleToLink);
    const title =
      getStringField(p, ["title", "name", "label", "display_name"]) || "";
    const content = buildContentForPage(p, linkToTitle);

    const images = collectImageUrls(p);
    if (url === "" && title === "") continue;
    out.push({ url, title, content, images });
  }

  return out;
}

// Note: no top-level executable block here to keep this module ESM-friendly.
