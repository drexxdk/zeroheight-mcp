import { load } from "cheerio";
import type { AnyNode } from "domhandler";
import { config } from "@/utils/config";
import logger from "@/utils/logger";

export type FetchExtractResult = {
  title: string;
  content: string;
  normalizedImages: Array<{ src: string; alt: string; originalSrc?: string }>;
  supportedImages: Array<{ src: string; alt: string; originalSrc?: string }>;
  pageLinks: string[];
};

export async function fetchAndExtract(options: {
  url: string;
  cookieHeader?: string;
  allowedHostname: string;
}): Promise<FetchExtractResult> {
  const { url, cookieHeader, allowedHostname } = options;
  const headers: Record<string, string> = {
    "User-Agent": "Mozilla/5.0 (compatible; Scraper/1.0)",
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  };
  if (cookieHeader) headers.Cookie = cookieHeader;

  try {
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
    const text = await res.text();
    // Detect likely login/guard pages so callers can fallback to Puppeteer.
    // Zeroheight renders a `window.USER_INFO` blob and `needsPassword` when
    // a password is required; other sites may include a password input.
    const loginHints = [
      "needsPassword",
      "window.USER_INFO",
      "hasStyleguidePassword",
    ];
    const hasPasswordInput = /<input[^>]+type=["']?password["']?/i.test(text);
    for (const hint of loginHints)
      if (text.includes(hint) || hasPasswordInput) {
        logger.debug(
          "fetchExtractor detected login page, aborting to allow Puppeteer fallback",
        );
        throw new Error("login-required");
      }
    const $ = load(text);

    const title = ($("title").first().text() || "").trim();

    // extract visible text roughly similar to #main-content or body
    const main = $("#main-content").text() || $("body").text() || "";
    const content = String(main).trim();

    // images: parse img[src] and inline/background url() in style attrs
    const imgs: Array<{ src: string; alt: string }> = [];
    $("img").each((_: number, el: AnyNode) => {
      const $el = $(el as AnyNode);
      const src = ($el.attr("src") || $el.attr("data-src") || "") as string;
      const abs = src ? new URL(src, url).href : "";
      const alt = ($el.attr("alt") || "") as string;
      if (abs.startsWith("http")) imgs.push({ src: abs, alt });
    });

    // background images from style attr
    $("*").each((_: number, el: AnyNode) => {
      const $el = $(el as AnyNode);
      const style = ($el.attr("style") || "") as string;
      const m = /url\((['"]?)([^)"']+)\1\)/.exec(style);
      if (m && m[2]) {
        try {
          const abs = new URL(m[2], url).href;
          if (abs.startsWith("http")) imgs.push({ src: abs, alt: "" });
        } catch {
          // ignore
        }
      }
    });

    // normalize similar to puppeteer extractor: strip query for known cdn/s3 hosts
    const normalizedImages = imgs.map((img) => {
      let src = img.src;
      try {
        const u = new URL(src);
        if (
          u.hostname.includes("cdn.zeroheight.com") ||
          u.hostname.includes("amazonaws.com") ||
          u.hostname.includes("s3.")
        ) {
          src = `${u.protocol}//${u.hostname}${u.pathname}`;
        }
      } catch (e) {
        logger.debug("fetchExtractor URL parse failed", e);
      }
      return { src, alt: img.alt, originalSrc: img.src };
    });

    const supportedImages = normalizedImages.filter((img) => {
      const lower = img.src.toLowerCase();
      for (const ext of config.image.excludeFormats)
        if (lower.includes(`.${ext}`)) return false;
      return true;
    });

    // links similar to pageExtraction: find /p/ links
    const pageLinks: string[] = [];
    $("a[href*='/p/']").each((_: number, el: AnyNode) => {
      const $el = $(el as AnyNode);
      const href = ($el.attr("href") || "") as string;
      try {
        const u = new URL(href, url);
        if (u.hostname === allowedHostname) pageLinks.push(u.href);
      } catch {
        // ignore
      }
    });

    return { title, content, normalizedImages, supportedImages, pageLinks };
  } catch (e) {
    throw e;
  }
}

export function serializeCookies(
  cookies: Array<{ name: string; value: string }>,
): string {
  return cookies.map((c) => `${c.name}=${c.value}`).join("; ");
}
