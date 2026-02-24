import type { Page } from "puppeteer";
import { config } from "@/utils/config";
import logger from "@/utils/logger";
import { isRecord, getProp } from "@/utils/common/typeGuards";

export type ExtractedImage = {
  src: string;
  alt: string;
  originalSrc?: string;
  index?: number;
};

export type ExtractPageDataResult = {
  title: string;
  content: string;
  normalizedImages: ExtractedImage[];
  supportedImages: ExtractedImage[];
  pageLinks: string[];
};

export async function extractPageData({
  page,
  pageUrl,
  allowedHostname,
  includeImages,
}: {
  page: Page;
  pageUrl: string;
  allowedHostname: string;
  includeImages?: boolean;
}): Promise<ExtractPageDataResult> {
  const title: string = await page.title();

  const content: string = await page
    .$eval("#main-content", (el: Element) => {
      // Use innerText to preserve visible spacing/layout so words aren't
      // concatenated when nodes are adjacent in the DOM.
      try {
        return (el as HTMLElement).innerText?.trim() || "";
      } catch {
        return el.textContent?.trim() || "";
      }
    })
    .catch(async () => {
      // Fallback to body text if #main-content selector fails (e.g. on non-Zeroheight pages)
      const body = await page.$("body");
      if (body) {
        return body.evaluate(
          (el: HTMLElement) =>
            (el.innerText?.trim() || el.textContent?.trim() || "") as string,
        );
      }
      return "";
    });

  // If images aren't requested, skip waits/scrolls and image enumeration
  // to speed up extraction for page-only runs.
  let allImagesRaw: unknown[] = [];
  if (includeImages) {
    // Allow brief time for client-side rendered images/backgrounds to load.
    await new Promise((r) => setTimeout(r, config.scraper.prefetch.waitMs));

    // Perform an automated gentle scroll to trigger lazy-loading of images.
    try {
      const stepPx = config.scraper.prefetch.scrollStepPx;
      const stepMs = config.scraper.prefetch.scrollStepMs;
      const finalWait = config.scraper.prefetch.finalWaitMs;
      await page.evaluate(
        async (
          stepPxArg: number,
          stepMsArg: number,
          finalWaitArg: number,
          fallbackArg: number,
        ) => {
          const step = stepPxArg || window.innerHeight || fallbackArg;
          let pos = 0;
          const max =
            document.body.scrollHeight || document.documentElement.scrollHeight;
          while (pos < max) {
            window.scrollBy(0, step);
            // small pause between scroll steps
            await new Promise((rr) => setTimeout(rr, stepMsArg));
            void e;
          }
          await new Promise((rr) => setTimeout(rr, finalWaitArg));
          window.scrollTo(0, 0);
        },
        stepPx,
        stepMs,
        finalWait,
        config.scraper.prefetch.scrollStepPx,
      );
    } catch {
      // ignore scrolling failures and proceed with extraction
    }

    const images = await page.$$eval("img", (imgs: HTMLImageElement[]) =>
      imgs.flatMap((img, index) => {
        const out: Array<{ src: string; alt: string; index: number }> = [];
        try {
          let src = img.src || "";
          if (src && !src.startsWith("http"))
            src = new URL(src, window.location.href).href;
          if (src) out.push({ src, alt: img.alt, index });
        } catch {
          // ignore
        }
        // Parse srcset entries (e.g. responsive images)
        try {
          const ss = img.getAttribute("srcset") || "";
          if (ss) {
            ss.split(",")
              .map((s) => s.trim().split(/\s+/)[0])
              .filter(Boolean)
              .forEach((entry) => {
                try {
                  let url = entry;
                  if (url && !url.startsWith("http"))
                    url = new URL(url, window.location.href).href;
                  if (url) out.push({ src: url, alt: img.alt, index });
                } catch {
                  // ignore
                }
              });
          }
        } catch {
          // ignore
        }
        return out;
      }),
    );

    const bgImages = await page.$$eval(
      "*",
      (elements: Element[], imagesLength) => {
        return elements
          .map((el: Element, index) => {
            const style = window.getComputedStyle(el);
            const bg = style.backgroundImage;
            if (bg && bg.startsWith("url(")) {
              let url = bg.slice(4, -1).replace(/['"]+/g, "");
              url = new URL(url, window.location.href).href;
              if (url.startsWith("http"))
                return { src: url, alt: "", index: imagesLength + index };
            }
          })
          .filter(Boolean);
      },
      images.length,
    );

    // Also collect <source> elements (used by <picture>) and their src/srcset
    const sourceImages = await page.$$eval("source", (sources: Element[]) =>
      sources
        .flatMap((s, index) => {
          const out: Array<{ src: string; alt: string; index: number }> = [];
          try {
            const srcAttr = (s as HTMLSourceElement).getAttribute("src") || "";
            if (srcAttr) {
              let url = srcAttr;
              if (url && !url.startsWith("http"))
                url = new URL(url, window.location.href).href;
              if (url) out.push({ src: url, alt: "", index });
            }
          } catch {
            // ignore
          }
          try {
            const ss = (s as HTMLSourceElement).getAttribute("srcset") || "";
            if (ss) {
              ss.split(",")
                .map((r) => r.trim().split(/\s+/)[0])
                .filter(Boolean)
                .forEach((entry) => {
                  try {
                    let url = entry;
                    if (url && !url.startsWith("http"))
                      url = new URL(url, window.location.href).href;
                    if (url) out.push({ src: url, alt: "", index });
                  } catch {
                    // ignore
                  }
                });
            }
          } catch {
            // ignore
          }
          return out;
        })
        .filter(Boolean),
    );

    // Merge image sources from <img>, <source>, and backgrounds
    allImagesRaw = [...images, ...sourceImages, ...bgImages].filter(Boolean);
  }

  // Even when images are disabled we should perform a quick, lightweight
  // scroll to surface lazy-loaded page content (links) that may only appear
  // after a small scroll. This avoids missing pages while still avoiding
  // the heavier image-loading waits.
  if (!includeImages) {
    try {
      // First quick pass: short scroll + short wait. If this surfaces
      // at least one page link we skip the longer pass to save time.
      await page.evaluate(async () => {
        try {
          const h = Math.min(
            window.innerHeight * 1.5,
            document.body.scrollHeight || 0,
          );
          window.scrollBy(0, h);
          await new Promise((r) => setTimeout(r, 150));
          window.scrollTo(0, 0);
        } catch {
          // ignore
        }
      });

      // Check if any Zeroheight page links are present; if not, perform
      // a longer second pass to catch late-inserted content.
      const pageLinkCount = await page.evaluate(() => {
        try {
          return document.querySelectorAll('a[href*="/p/"]').length || 0;
        } catch {
          return 0;
        }
      });

      if (!pageLinkCount || pageLinkCount === 0) {
        try {
          await page.evaluate(async () => {
            try {
              const h = Math.min(
                window.innerHeight * 1.5,
                document.body.scrollHeight || 0,
              );
              window.scrollBy(0, h);
              // longer wait to allow mutation scripts to run
              await new Promise((r) => setTimeout(r, 600));
              window.scrollTo(0, 0);
            } catch {
              // ignore
            }
          });
        } catch {
          // ignore
        }
      }
      // If we still have no page links, wait briefly for DOM mutations that
      // may inject links (e.g. client-side rendering that reacts to scroll
      // events). This is cheaper than enabling images and catches late
      // insertions without a full page re-fetch.
      const pageLinkCountAfterWait = await page.evaluate(() => {
        try {
          return document.querySelectorAll('a[href*="/p/"]').length || 0;
        } catch {
          return 0;
        }
      });

      if (!pageLinkCountAfterWait || pageLinkCountAfterWait === 0) {
        try {
          await page.evaluate(async () => {
            // Wait up to 800ms for nodes matching the selector to appear.
            return await new Promise((resolve) => {
              try {
                if (document.querySelector('a[href*="/p/"]'))
                  return resolve(true);
                const obs = new MutationObserver(() => {
                  if (document.querySelector('a[href*="/p/"]')) {
                    obs.disconnect();
                    resolve(true);
                  }
                });
                obs.observe(document.body || document.documentElement, {
                  childList: true,
                  subtree: true,
                });
                setTimeout(() => {
                  try {
                    obs.disconnect();
                  } catch {}
                  resolve(false);
                }, 800);
              } catch {
                resolve(false);
              }
            });
          });
        } catch {
          // ignore
        }
      }
    } catch {
      // ignore
    }
  }
  const allImages: ExtractedImage[] = allImagesRaw
    .filter(isRecord)
    .map((it) => {
      const src =
        typeof getProp(it, "src") === "string"
          ? String(getProp(it, "src"))
          : "";
      const alt =
        typeof getProp(it, "alt") === "string"
          ? String(getProp(it, "alt"))
          : "";
      const index =
        typeof getProp(it, "index") === "number"
          ? Number(getProp(it, "index"))
          : undefined;
      return { src, alt, index };
    })
    .filter((img) => typeof img.src === "string" && img.src.startsWith("http"));

  // Normalize image URLs to prevent duplicates from signed URLs
  const normalizedImages = allImages.map((img) => {
    let normalizedSrc = img.src;

    if (normalizedSrc.includes("cdn.zeroheight.com")) {
      try {
        const url = new URL(normalizedSrc);
        normalizedSrc = `${url.protocol}//${url.hostname}${url.pathname}`;
      } catch (e) {
        logger.debug("pageExtraction metadata parse error:", e);
      }
    }

    if (
      normalizedSrc.includes("s3.") ||
      normalizedSrc.includes("amazonaws.com")
    ) {
      try {
        const url = new URL(normalizedSrc);
        normalizedSrc = `${url.protocol}//${url.hostname}${url.pathname}`;
      } catch (e) {
        logger.debug("pageExtraction attribute parse error:", e);
      }
    }

    return { ...img, src: normalizedSrc, originalSrc: img.src };
  });

  // Filter out excluded image formats
  const supportedImages = normalizedImages.filter((img) => {
    const lowerSrc = img.src.toLowerCase();
    for (const ext of config.image.excludeFormats)
      if (lowerSrc.includes(`.${ext}`)) return false;
    return true;
  });

  // Find additional page links (Zeroheight /p/ pattern) on the page
  const pageLinks: string[] = await page
    .$$eval(
      'a[href*="/p/"]',
      (links, base, host) =>
        links
          .map((link) => link.href)
          .filter((href) => {
            try {
              const linkUrl = new URL(href, base);
              return linkUrl.hostname === host;
            } catch {
              return false;
            }
          }),
      pageUrl,
      allowedHostname,
    )
    .catch(() => []);

  return { title, content, normalizedImages, supportedImages, pageLinks };
}
