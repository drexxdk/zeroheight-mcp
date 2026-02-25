import fs from "fs";
import path from "path";
import puppeteer, { Page } from "puppeteer";
import { tryLogin } from "@/utils/common/scraperHelpers";
import { convertPagesToModel, PageModel } from "@/utils/pages-to-model";

export async function fetchPages(options: {
  rootUrl: string;
  password?: string;
  outFile: string;
}): Promise<void> {
  const { rootUrl, password, outFile } = options;
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    const page: Page = await browser.newPage();

    const diagDir = path.join(
      process.cwd(),
      "src",
      "tools",
      "api-scraper",
      "generated",
    );
    fs.mkdirSync(diagDir, { recursive: true });

    let captured = false;
    let resolveCaptured: (v?: unknown) => void = () => {};
    const capturedPromise = new Promise<unknown>(
      (resolve: (v?: unknown) => void): void => {
        resolveCaptured = resolve;
      },
    );

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
          try {
            fs.writeFileSync(path.join(diagDir, "pages.json"), text, "utf8");
          } catch (_e) {
            // ignore write errors
          }
          captured = true;
          resolveCaptured(true);
        }
      } catch (_e) {
        // swallow
      }
    });

    await page.goto(rootUrl, { waitUntil: "networkidle2", timeout: 30000 });

    if (password) await tryLogin({ page, password }).catch(() => {});

    await page
      .waitForNavigation({ waitUntil: "networkidle2", timeout: 1000 })
      .catch(() => {});

    let result: unknown;
    try {
      await Promise.race([
        capturedPromise,
        new Promise((_, rej) =>
          setTimeout(() => rej(new Error("no auto request")), 20000),
        ),
      ]);

      const pagesPath = path.join(
        process.cwd(),
        "src",
        "tools",
        "api-scraper",
        "generated",
        "pages.json",
      );
      if (fs.existsSync(pagesPath)) {
        const txt = fs.readFileSync(pagesPath, "utf8");
        result = JSON.parse(txt);
      } else {
        throw new Error("captured response but pages.json missing");
      }
    } catch (_waitErr) {
      throw new Error(
        "Automatic /api/styleguide/load_pages request was not observed within timeout",
      );
    }

    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    try {
      fs.writeFileSync(outFile, JSON.stringify(result, null, 2), "utf8");
      // eslint-disable-next-line no-console
      console.log("Wrote pages JSON to", outFile);
    } catch (_e) {
      // ignore write errors
    }

    try {
      const rawCaptured = result;
      const models: PageModel[] = convertPagesToModel(rawCaptured);

      const groups: Record<string, PageModel[]> = {};
      for (const m of models) {
        let normalized = (m.url || "").toString();
        try {
          normalized = new URL(normalized, rootUrl).href;
        } catch (_e) {
          // leave as-is if URL parsing fails
        }
        if (normalized.endsWith("/")) normalized = normalized.slice(0, -1);
        groups[normalized] = groups[normalized] || [];
        groups[normalized].push(m);
      }

      const scoreModel = (mm: PageModel): number => {
        const imagesScore = (mm.images || []).length * 100;
        const contentScore = (mm.content || "").toString().length;
        const titleScore = (mm.title || "").toString().length;
        return imagesScore + contentScore + titleScore;
      };

      const canonical: PageModel[] = Object.keys(groups).map(
        (url): PageModel => {
          const list = groups[url];
          let best = list[0];
          let bestScore = scoreModel(best);
          for (let i = 1; i < list.length; i++) {
            const s = scoreModel(list[i]);
            if (s > bestScore) {
              best = list[i];
              bestScore = s;
            }
          }
          best.url = url;
          return best;
        },
      );

      const sorted = canonical.slice().sort((a, b) => {
        if (a.url === b.url)
          return (a.title || "").localeCompare(b.title || "");
        return (a.url || "").localeCompare(b.url || "");
      });

      const outModelPath = path.join(
        process.cwd(),
        "src",
        "tools",
        "api-scraper",
        "generated",
        "pages-model.json",
      );
      fs.writeFileSync(outModelPath, JSON.stringify(sorted, null, 2), "utf8");
      // eslint-disable-next-line no-console
      console.log("Wrote canonical pages model to", outModelPath);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("Failed to convert/canonicalize captured pages:", e);
    }
  } finally {
    await browser.close();
  }
}

export default fetchPages;
