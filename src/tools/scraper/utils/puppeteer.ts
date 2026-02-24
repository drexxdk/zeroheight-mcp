import puppeteer, { HTTPRequest, Page, Browser } from "puppeteer";
import logger from "@/utils/logger";

type BlockOptions = {
  allow?: Set<string>;
  block?: Set<string>;
  // When true, include image resource requests (do not aggressively block images).
  // Default `false` will behave like the historical default which blocks
  // certain undesirable image types and may block images entirely when the
  // caller opts out of including images.
  includeImages?: boolean;
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
  includeImages = false,
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

  // Image handling: `includeImages` flips the historical `blockImages` flag.
  // When `includeImages` is true we follow the historical non-blocking
  // behaviour (still blocking a few undesired extensions). When false we
  // aggressively block images except for a small set of supported types.
  if (rTypeLower === "image") {
    const supportedImageExtRe = /\.(jpe?g|png|webp|avif|bmp)(?:[?#]|$)/i;
    // When includeImages is true we allow supported raster images and
    // permissive data: URIs, while still blocking known undesired
    // extensions (svg, gif, ico) and font files. When includeImages is
    // false we aggressively block all images.
    if (includeImages) {
      if (hasBlockedExtension(parsedPathLower)) return "blocked-ext";
      if (supportedImageExtRe.test(parsedPathLower)) return null;
      if (
        urlLower.startsWith("data:") &&
        /image\/(png|jpeg|jpg|webp|avif)/.test(urlLower)
      )
        return null;
      // Unknown image path/extension: block by default to be safe.
      return "blocked-image";
    }
    // includeImages === false -> block images unconditionally
    return "blocked-image";
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
  {
    allow = new Set<string>(),
    block = new Set<string>(),
    includeImages = false,
    onRequest,
  }: BlockOptions = {},
): Promise<void> {
  try {
    await page.setRequestInterception(true);
  } catch (e) {
    logger.debug("page.setRequestInterception not supported:", e);
  }

  page.on("request", (req: HTTPRequest) => {
    const reason = getBlockReason(
      req.url(),
      req.resourceType(),
      allow,
      block,
      includeImages,
    );

    // Helper to detect if the interception has already been resolved.
    const isHandled = (() => {
      try {
        const fn = (
          req as unknown as { isInterceptResolutionHandled?: () => boolean }
        ).isInterceptResolutionHandled;
        if (typeof fn === "function") return fn.call(req as unknown);
        return false;
      } catch {
        return false;
      }
    })();

    if (reason) {
      onRequest?.(req, "blocked", reason);
      if (isHandled) {
        logger.debug("Skipping abort: request already handled", req.url());
        return;
      }
      void req.abort().catch((e) => logger.debug("req.abort error:", e));
      return;
    }
    onRequest?.(req, "continued");
    if (isHandled) {
      logger.debug("Skipping continue: request already handled", req.url());
      return;
    }
    void req.continue().catch((e) => logger.debug("req.continue error:", e));
  });

  page.on("requestfailed", (req) => logger.debug("request failed:", req.url()));
  page.on("response", () => {
    // noop: consumers may attach their own handlers if they want details
  });
}
export const puppeteerHelper = { launchBrowser, attachDefaultInterception };
