import { z } from "zod";
import type { ToolDefinition } from "@/tools/toolTypes";
import {
  launchBrowser,
  attachDefaultInterception,
} from "@/tools/scraper/utils/puppeteer";
import { tryLogin } from "@/utils/common/scraperHelpers";
import { config } from "@/utils/config";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { hasStringProp, getProp } from "@/utils/common/typeGuards";

// API scraper input mirrors the main `scrape` tool but allows an optional
// `password` to support protected projects during CLI runs.
const apiScrapeInput = z.object({
  pageUrls: z.array(z.string()).optional(),
  includeImages: z
    .boolean()
    .optional()
    .default(false)
    .describe("Whether to include image data in the response"),
  password: z.string().optional(),
});

export const apiScraperTool: ToolDefinition<
  typeof apiScrapeInput,
  { message: string }
> = {
  title: "api-scraper",
  description:
    "API scraper that logs into the project root and captures API payloads.",
  inputSchema: apiScrapeInput,
  handler: async ({ pageUrls, includeImages, password }) => {
    const projectUrl = config.env.zeroheightProjectUrl;
    if (!projectUrl) {
      return { message: "ZEROHEIGHT_PROJECT_URL not set" };
    }

    const toolDir = path.dirname(fileURLToPath(import.meta.url));
    const outPath = path.join(toolDir, "pages.json");
    try {
      // ensure directory exists (should already), keep best-effort semantics
      fs.mkdirSync(toolDir, { recursive: true });
    } catch {
      // ignore
    }

    let browser = null as unknown as Awaited<
      ReturnType<typeof launchBrowser>
    > | null;
    try {
      browser = await launchBrowser();
      const page = await browser.newPage();
      try {
        await attachDefaultInterception(page, {
          includeImages: !!includeImages,
        });
      } catch {
        // best-effort
      }

      // Navigate to the root and attempt login if password provided
      await page
        .goto(projectUrl, { waitUntil: "networkidle2" })
        .catch(() => {});
      try {
        await tryLogin({ page, password });
      } catch {
        // ignore login errors for now
      }

      let captured = false;
      let resolveCaptured: (val: boolean) => void = () => {};
      const capturedPromise = new Promise<boolean>((res) => {
        resolveCaptured = res;
      });

      page.on("response", async (res): Promise<void> => {
        try {
          const url = res.url();
          const status = res.status();
          if (
            url.includes("/api/styleguide/load_pages") &&
            status === 200 &&
            !captured
          ) {
            const text = await res.text();
            // Attempt to write raw payload for debugging
            try {
              fs.writeFileSync(outPath, text, "utf8");
            } catch (_e) {
              // ignore write errors
            }

            // Parse and extract page URLs into `page-urls.json` next to tool
            try {
              let parsed: unknown = null;
              try {
                parsed = JSON.parse(text);
              } catch {
                parsed = null;
              }
              let urls: string[] = [];
              // If parsed looks like an array of objects with `url` keys
              if (Array.isArray(parsed)) {
                urls = parsed
                  .map((it) =>
                    hasStringProp(it, "url")
                      ? String(getProp(it, "url"))
                      : null,
                  )
                  .filter((u): u is string => typeof u === "string");
              }

              // Fallback: if no urls obtained, try reading pages-database.json
              if (!urls.length) {
                const fallbackPath = path.join(
                  path.dirname(fileURLToPath(import.meta.url)),
                  "pages-database.json",
                );
                try {
                  const dbText = fs.readFileSync(fallbackPath, "utf8");
                  const dbParsed = JSON.parse(dbText);
                  if (Array.isArray(dbParsed)) {
                    urls = dbParsed
                      .map((it) =>
                        hasStringProp(it, "url")
                          ? String(getProp(it, "url"))
                          : null,
                      )
                      .filter((u): u is string => typeof u === "string");
                  }
                } catch {
                  // ignore fallback read/parse errors
                }
              }

              if (urls.length) {
                const outUrlsPath = path.join(
                  path.dirname(fileURLToPath(import.meta.url)),
                  "page-urls.json",
                );
                try {
                  fs.writeFileSync(
                    outUrlsPath,
                    JSON.stringify(urls, null, 2),
                    "utf8",
                  );
                } catch (_e) {
                  // ignore
                }
              }
            } catch (_e) {
              // swallow parsing/writing errors
            }

            captured = true;
            resolveCaptured(true);
          }
        } catch (_e) {
          // swallow
        }
      });

      // If pageUrls provided, open the first one to trigger API; otherwise rely on root
      if (pageUrls && pageUrls.length > 0) {
        try {
          await page
            .goto(pageUrls[0], { waitUntil: "networkidle2" })
            .catch(() => {});
        } catch {
          // ignore
        }
      }

      // Wait up to 30s for capture
      const timed = Promise.race([
        capturedPromise,
        new Promise<boolean>((r) => setTimeout(() => r(false), 30000)),
      ]);
      const ok = await timed;
      try {
        await page.close();
      } catch {
        // ignore
      }
      try {
        await browser.close();
      } catch {
        // ignore
      }

      return { message: ok ? "captured" : "no-capture" };
    } catch (e) {
      try {
        if (browser) await browser.close();
      } catch {
        // ignore
      }
      return { message: `error: ${String(e)}` };
    }
  },
};

// Provide the expected named export `scrapeTool` so CLI callers can find it.
export const scrapeTool = apiScraperTool;
export default apiScraperTool;
