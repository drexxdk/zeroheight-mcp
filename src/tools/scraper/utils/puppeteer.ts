import puppeteer, { HTTPRequest, Page, Browser } from "puppeteer";

type BlockOptions = {
  allow?: Set<string>;
  block?: Set<string>;
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
): string | null {
  const rTypeLower = rType.toLowerCase();
  if (allowSetLocal.has(rTypeLower)) return null;
  const urlLower = reqUrl.toLowerCase();
  let parsedHost = "";
  let parsedPathLower = "";
  try {
    const p = new URL(reqUrl);
    parsedHost = p.hostname.toLowerCase();
    parsedPathLower = p.pathname.toLowerCase();
  } catch {
    parsedHost = "";
    parsedPathLower = "";
  }

  if (rTypeLower === "stylesheet" || rTypeLower === "font")
    return "blocked-resource-type";

  const imageExtRe = /\.(svg|gif|ico)(?:[?#]|$)/i;
  const fontExtRe = /\.(woff2?|ttf|otf|eot)(?:[?#]|$)/i;
  try {
    if (imageExtRe.test(parsedPathLower) || fontExtRe.test(parsedPathLower))
      return "blocked-ext";
  } catch (e) {
    console.debug("extension regex test failed:", e);
  }

  if (urlLower.startsWith("data:")) {
    const m = urlLower.match(/^data:([^;,]+)[;,]/);
    const mime = m ? m[1] : "";
    if (
      mime.startsWith("image/svg") ||
      mime === "image/gif" ||
      mime === "image/x-icon" ||
      mime === "image/vnd.microsoft.icon" ||
      mime.startsWith("font/") ||
      mime.includes("woff") ||
      mime.includes("truetype") ||
      mime.includes("opentype")
    ) {
      return "blocked-data-uri";
    }
  }

  if (blockSetLocal.has(rTypeLower)) return "blocked-by-inspector";

  // host-based
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
  const allowSet = opts?.allow ?? new Set<string>();
  const blockSet = opts?.block ?? new Set<string>();
  try {
    await page.setRequestInterception(true);
  } catch (e) {
    console.debug("page.setRequestInterception not supported:", e);
  }

  page.on("request", (req: HTTPRequest) => {
    const reason = getBlockReason(
      req.url(),
      req.resourceType(),
      allowSet,
      blockSet,
    );
    if (reason) {
      opts?.onRequest?.(req, "blocked", reason);
      void req.abort().catch((e) => console.debug("req.abort error:", e));
      return;
    }
    opts?.onRequest?.(req, "continued");
    void req.continue().catch((e) => console.debug("req.continue error:", e));
  });

  page.on("requestfailed", (req) =>
    console.debug("request failed:", req.url()),
  );
  page.on("response", () => {
    // noop: consumers may attach their own handlers if they want details
  });
}
export const puppeteerHelper = { launchBrowser, attachDefaultInterception };
