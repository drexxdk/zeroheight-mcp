import puppeteer, { HTTPRequest, Page, Browser } from "puppeteer";
import logger from "@/utils/logger";

const attachedPages = new WeakSet<Page>();

type BlockOptions = {
  allow?: Set<string>;
  block?: Set<string>;
  // When true, block image resource requests except for supported types
  blockImages?: boolean;
  onRequest?: (
    req: HTTPRequest,
    decision: "blocked" | "continued",
    reason?: string,
  ) => void;
};

export function getBlockReason(
  reqUrl: string,
  rType: string,
  allowSetLocal: Set<string>,
  blockSetLocal: Set<string>,
  blockImages = false,
): string | null {
  const rTypeLower = rType.toLowerCase();
  if (allowSetLocal.has(rTypeLower)) return null;

  const urlLower = reqUrl.toLowerCase();
  const { parsedHost, parsedPathLower } = (() => {
    try {
      const p = new URL(reqUrl);
      return {
        parsedHost: p.hostname.toLowerCase(),
        parsedPathLower: p.pathname.toLowerCase(),
      };
    } catch {
      return { parsedHost: "", parsedPathLower: "" };
    }
  })();

  // If images are being blocked, handle image resource types specially:
  if (rTypeLower === "image") {
    // supported image extensions - allow these even when blocking images
    const supportedImageExtRe = /\.(jpe?g|png|webp|avif|bmp)(?:[?#]|$)/i;
    if (!blockImages) {
      // Default behaviour: still block a small set of undesired image extensions
      if (hasBlockedExtension(parsedPathLower)) return "blocked-ext";
    } else {
      // blockImages=true: only allow supported image extensions and common data URIs
      if (supportedImageExtRe.test(parsedPathLower)) return null;
      // allow data: URIs for supported image types
      if (
        urlLower.startsWith("data:") &&
        /image\/(png|jpeg|jpg|webp|avif)/.test(urlLower)
      )
        return null;
      return "blocked-image";
    }
  }
  if (isBlockedResourceType(rTypeLower)) return "blocked-resource-type";
  if (hasBlockedExtension(parsedPathLower)) return "blocked-ext";
  if (isBlockedDataUri(urlLower)) return "blocked-data-uri";
  if (blockSetLocal.has(rTypeLower)) return "blocked-by-inspector";
  const hostReason = hostBasedBlock(parsedHost);
  if (hostReason) return hostReason;
  return null;
}

function isBlockedResourceType(rTypeLower: string): boolean {
  return rTypeLower === "stylesheet" || rTypeLower === "font";
}

function hasBlockedExtension(parsedPathLower: string): boolean {
  const imageExtRe = /\.(svg|gif|ico)(?:[?#]|$)/i;
  const fontExtRe = /\.(woff2?|ttf|otf|eot)(?:[?#]|$)/i;
  try {
    return imageExtRe.test(parsedPathLower) || fontExtRe.test(parsedPathLower);
  } catch (e) {
    logger.debug("extension regex test failed:", e);
    return false;
  }
}

function isBlockedDataUri(urlLower: string): boolean {
  if (!urlLower.startsWith("data:")) return false;
  const m = urlLower.match(/^data:([^;,]+)[;,]/);
  const mime = m ? m[1] : "";
  return (
    mime.startsWith("image/svg") ||
    mime === "image/gif" ||
    mime === "image/x-icon" ||
    mime === "image/vnd.microsoft.icon" ||
    mime.startsWith("font/") ||
    mime.includes("woff") ||
    mime.includes("truetype") ||
    mime.includes("opentype")
  );
}

function hostBasedBlock(parsedHost: string): string | null {
  if (!parsedHost) return null;
  if (
    parsedHost === "fast.appcues.com" ||
    parsedHost.endsWith(".fast.appcues.com")
  )
    return "blocked-appcues-fast";
  if (parsedHost === "snap.licdn.com") return "blocked-licdn-snap";
  if (parsedHost === "sentry.io" || parsedHost.endsWith(".sentry.io"))
    return "blocked-sentry";
  if (
    parsedHost === "api.zeroheight.com" ||
    parsedHost.endsWith(".api.zeroheight.com")
  )
    return "blocked-zeroheight-api";
  return null;
}

export async function launchBrowser(): Promise<Browser> {
  return puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
}

export async function attachDefaultInterception(
  page: Page,
  opts?: BlockOptions,
): Promise<void> {
  // Make idempotent: avoid attaching multiple listeners to the same page.
  // Use a module-level WeakSet instead of mutating the Page object.
  if (attachedPages.has(page)) return;
  attachedPages.add(page);
  const allowSet = opts?.allow ?? new Set<string>();
  const blockSet = opts?.block ?? new Set<string>();
  const blockImages = opts?.blockImages ?? false;
  try {
    await page.setRequestInterception(true);
  } catch (e) {
    logger.debug("page.setRequestInterception not supported:", e);
  }

  page.on("request", (req: HTTPRequest) => {
    const reason = getBlockReason(
      req.url(),
      req.resourceType(),
      allowSet,
      blockSet,
      blockImages,
    );
    if (reason) {
      opts?.onRequest?.(req, "blocked", reason);
      void req.abort().catch((e) => {
        if (String(e).includes("Request is already handled")) return;
        logger.debug("req.abort error:", e);
      });
      return;
    }
    opts?.onRequest?.(req, "continued");
    void req.continue().catch((e) => {
      if (String(e).includes("Request is already handled")) return;
      logger.debug("req.continue error:", e);
    });
  });

  page.on("requestfailed", (req) => logger.debug("request failed:", req.url()));
  page.on("response", () => {
    // noop: consumers may attach their own handlers if they want details
  });
}
export const puppeteerHelper = { launchBrowser, attachDefaultInterception };

// Login & cookie helper: perform a single login flow and return serialized
// cookies suitable for a `Cookie` header in fetch requests. Caller is
// responsible for providing the page navigation URL and optional password.
export async function getAuthenticatedCookieHeader(options: {
  browser: Browser;
  url: string;
  password?: string;
}): Promise<string> {
  const { browser, url, password } = options;
  const page = await browser.newPage();
  try {
    const cfg = await import("@/utils/config");
    const navTimeout = cfg.config.scraper.viewport.debugNavTimeoutMs ?? 60000;
    await page.goto(url, { waitUntil: "networkidle2", timeout: navTimeout });
    try {
      const { tryLogin } = await import("@/utils/common/scraperHelpers");
      if (password) await tryLogin({ page, password });
    } catch (_e) {
      // ignore login helper failures
    }
    const cookies = await page.cookies();
    // map to simple name/value pairs
    const pairs = cookies.map((c) => ({ name: c.name, value: c.value }));
    const { serializeCookies } = await import("./fetchExtractor");
    return serializeCookies(pairs);
  } finally {
    try {
      await page.close();
    } catch {
      // ignore
    }
  }
}
