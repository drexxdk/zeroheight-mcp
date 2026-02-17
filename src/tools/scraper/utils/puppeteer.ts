import puppeteer, { Browser, Page, HTTPRequest, HTTPResponse } from "puppeteer";

export type ReqRecord = {
  id: number;
  url: string;
  method: string;
  resourceType: string;
  status?: number | null;
  failure?: string | null;
  headers?: Record<string, string | string[]>;
  responseSize?: number | null;
  timestamp: number;
};

export async function launchBrowser(options?: {
  headless?: boolean;
}): Promise<Browser> {
  const headless = options?.headless ?? true;
  const browser = await puppeteer.launch({ headless });
  return browser;
}

export type InterceptOptions = {
  allowResourceTypes?: string[]; // e.g. ['script', 'stylesheet']
  blockResourceTypes?: string[]; // resource types to block
};

export async function createInterceptingPage(
  browser: Browser,
  opts?: InterceptOptions,
): Promise<{ page: Page; getRecords: () => ReqRecord[] }> {
  const page = await browser.newPage();
  await page.setRequestInterception(true);

  const records: ReqRecord[] = [];
  let counter = 0;

  const allowSet = new Set(
    (opts?.allowResourceTypes || []).map((s) => s.toLowerCase()),
  );
  const blockSet = new Set(
    (opts?.blockResourceTypes || []).map((s) => s.toLowerCase()),
  );

  page.on("request", (req: HTTPRequest) => {
    const id = ++counter;
    const url = req.url();
    const rType = req.resourceType().toLowerCase();
    const rec: ReqRecord = {
      id,
      url,
      method: req.method(),
      resourceType: rType,
      timestamp: Date.now(),
    };
    records.push(rec);

    if (allowSet.has(rType)) {
      req.continue().catch(() => {});
      return;
    }

    // default: block stylesheets and fonts unless explicitly allowed
    if ((rType === "stylesheet" || rType === "font") && !allowSet.has(rType)) {
      rec.failure = "blocked-resource-type";
      req.abort().catch(() => {});
      return;
    }

    if (blockSet.has(rType)) {
      rec.failure = "blocked-by-option";
      req.abort().catch(() => {});
      return;
    }

    req.continue().catch(() => {});
  });

  page.on("requestfailed", (req: HTTPRequest) => {
    const rec = records.find((r) => r.url === req.url());
    if (rec) rec.failure = req.failure()?.errorText ?? "failed";
  });

  page.on("response", async (res: HTTPResponse) => {
    try {
      const req = res.request();
      const rec = records.find((r) => r.url === req.url());
      if (!rec) return;
      rec.status = res.status();
      rec.headers = res.headers();
      const len = res.headers()["content-length"] as string | undefined;
      if (len) {
        const n = parseInt(len, 10);
        if (!Number.isNaN(n)) rec.responseSize = n;
      } else {
        try {
          const buffer = await res.buffer();
          rec.responseSize = buffer.length;
        } catch {
          rec.responseSize = null;
        }
      }
    } catch {
      // ignore
    }
  });

  return { page, getRecords: () => records };
}

// thumbnail generation/upload helpers removed — image handling is URL-only now
