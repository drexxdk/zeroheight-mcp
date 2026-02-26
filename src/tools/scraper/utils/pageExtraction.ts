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

/* eslint-disable complexity */

// The image-gathering routine is intentionally large and complex because
// it runs multiple DOM queries and normalization passes inside the
// browser context. Keep linting happy by disabling these specific
// complexity/length checks for this function only.
// eslint-disable-next-line max-lines-per-function
async function gatherAllImagesForPage(page: Page): Promise<unknown[]> {
  await new Promise((r) => setTimeout(r, config.scraper.prefetch.waitMs));

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
          pos += step;
          await new Promise((rr) => setTimeout(rr, stepMsArg));
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
    // ignore scrolling failures
  }

  // Wait a bit after scrolling to allow any lazy-loaded images to render
  try {
    await new Promise((r) => setTimeout(r, 1000));
  } catch {
    // ignore
  }

  // Also attempt to scroll any scrollable containers (virtualized/overflow areas)
  try {
    await page.evaluate(
      async (stepPxArg: number, stepMsArg: number) => {
        const step = stepPxArg || window.innerHeight;
        const els = Array.from(document.querySelectorAll("*")) as HTMLElement[];
        const scrollables = els.filter(
          (el) =>
            el.scrollHeight &&
            el.clientHeight &&
            el.scrollHeight > el.clientHeight + 10,
        );
        for (const el of scrollables) {
          try {
            let pos = 0;
            const max = el.scrollHeight || 0;
            while (pos < max) {
              el.scrollTop = Math.min(pos + step, max);
              pos += step;
              // small pause to allow lazy-loading
              await new Promise((r) => setTimeout(r, stepMsArg));
            }
          } catch {
            // ignore
          }
        }
      },
      config.scraper.prefetch.scrollStepPx,
      config.scraper.prefetch.scrollStepMs,
    );
  } catch {
    // ignore
  }

  // Extract image `src` and `alt` from <img> elements (simple pass).
  const imgsFromSrc = await page.$$eval(
    "img",
    (imgs: HTMLImageElement[]) =>
      imgs
        .map((img, index) => {
          try {
            let src = img.src || "";
            if (src && !src.startsWith("http"))
              src = new URL(src, window.location.href).href;
            return src ? { src, alt: img.alt || "", index } : null;
          } catch {
            return null;
          }
        })
        .filter((x) => x) as Array<{ src: string; alt: string; index: number }>,
  );

  // Collect URL-like attributes from <img> elements (data-src, data-srcset, etc.)
  const imgsFromAttrs = await page.$$eval("img", (imgs: HTMLImageElement[]) => {
    const out: Array<{ src: string; alt: string; index: number }> = [];
    imgs.forEach((img, index) => {
      try {
        const attrs = Array.from(img.attributes || []) as Attr[];
        attrs.forEach((a) => {
          try {
            const name = (a.name || "").toLowerCase();
            const val = (a.value || "").trim();
            if (!val) return;
            const looksLikeUrl =
              val.startsWith("http") ||
              val.startsWith("//") ||
              val.startsWith("/") ||
              val.includes("s3.") ||
              val.includes("amazonaws.com");
            if (
              name.includes("src") ||
              name.includes("data-src") ||
              looksLikeUrl
            ) {
              let url = val;
              if (url.startsWith("//")) url = window.location.protocol + url;
              if (url && !url.startsWith("http"))
                url = new URL(url, window.location.href).href;
              if (url) out.push({ src: url, alt: img.alt || "", index });
            }
          } catch {
            // ignore
          }
        });
      } catch {
        // ignore
      }
    });
    return out;
  });

  // Collect srcset entries
  const imgsFromSrcset = await page.$$eval(
    "img",
    (imgs: HTMLImageElement[]) => {
      const out: Array<{ src: string; alt: string; index: number }> = [];
      imgs.forEach((img, index) => {
        try {
          const ss =
            img.getAttribute("srcset") || img.getAttribute("data-srcset") || "";
          if (!ss) return;
          ss.split(",")
            .map((s) => s.trim().split(/\s+/)[0])
            .filter(Boolean)
            .forEach((entry) => {
              try {
                let url = entry;
                if (url.startsWith("//")) url = window.location.protocol + url;
                if (url && !url.startsWith("http"))
                  url = new URL(url, window.location.href).href;
                if (url) out.push({ src: url, alt: img.alt || "", index });
              } catch {
                // ignore
              }
            });
        } catch {
          // ignore
        }
      });
      return out;
    },
  );

  const bgImages = await page.$$eval(
    "*",
    (elements: Element[], imagesLength) =>
      elements
        .flatMap((el: Element, index) => {
          const out: Array<{ src: string; alt: string; index: number }> = [];
          try {
            const style = window.getComputedStyle(el);
            const bg = style.backgroundImage || "";
            if (bg) {
              const re = /url\((.*?)\)/g;
              let m: RegExpExecArray | null = null;
              while ((m = re.exec(bg)) !== null) {
                try {
                  let url = (m[1] || "").replace(/['"]+/g, "");
                  if (url.startsWith("//"))
                    url = window.location.protocol + url;
                  url = new URL(url, window.location.href).href;
                  if (url.startsWith("http"))
                    out.push({
                      src: url,
                      alt: "",
                      index: imagesLength + index,
                    });
                } catch {
                  // ignore
                }
              }
            }
          } catch {
            // ignore
          }
          return out;
        })
        .filter(Boolean),
    imgsFromSrc.length + imgsFromAttrs.length + imgsFromSrcset.length,
  );

  const sourceImages = await page.$$eval("source", (sources: Element[]) =>
    sources
      .flatMap((s, index) => {
        const out: Array<{ src: string; alt: string; index: number }> = [];
        try {
          const attrs = Array.from((s as Element).attributes || []) as Attr[];
          attrs.forEach((a) => {
            try {
              const name = (a.name || "").toLowerCase();
              const val = (a.value || "").trim();
              if (!val) return;
              const looksLikeUrl =
                val.startsWith("http") ||
                val.startsWith("//") ||
                val.startsWith("/") ||
                val.includes("s3.") ||
                val.includes("amazonaws.com");
              if (name.includes("src") || looksLikeUrl) {
                let url = val;
                if (url.startsWith("//")) url = window.location.protocol + url;
                if (url && !url.startsWith("http"))
                  url = new URL(url, window.location.href).href;
                if (url) out.push({ src: url, alt: "", index });
              }
            } catch {
              // ignore
            }
          });
        } catch {
          // ignore
        }
        return out;
      })
      .filter(Boolean),
  );

  // Final pass: scan attributes across all elements for URL-like values
  const attrImages = await page.$$eval("*", (elements: Element[]) => {
    const out: Array<{ src: string; alt: string; index: number }> = [];
    try {
      const re =
        /(https?:\/\/[^"\s'<>]+(?:s3[^"\s'<>]*|amazonaws\.com[^"\s'<>]*))/gi;
      elements.forEach((el, idx) => {
        try {
          const attrs = Array.from((el as Element).attributes || []) as Attr[];
          attrs.forEach((a) => {
            try {
              const v = (a.value || "").toString();
              let m: RegExpExecArray | null = null;
              while ((m = re.exec(v)) !== null) {
                try {
                  let url = m[1];
                  if (url.startsWith("//"))
                    url = window.location.protocol + url;
                  if (url && !url.startsWith("http"))
                    url = new URL(url, window.location.href).href;
                  if (url)
                    out.push({ src: url, alt: "", index: 1000000 + idx });
                } catch {
                  // ignore
                }
              }
            } catch {
              // ignore
            }
          });
        } catch {
          // ignore
        }
      });
    } catch {
      // ignore
    }
    return out;
  });

  // Also scan outerHTML for encoded URLs (e.g. ampersands/entities)
  const outerHtmlImages = await page.$$eval("*", (elements: Element[]) => {
    const out: Array<{ src: string; alt: string; index: number }> = [];
    try {
      const re =
        /(https?:\/\/[^"'\s<>]+(?:s3[^"'\s<>]*|amazonaws\.com[^"'\s<>]*))/gi;
      elements.forEach((el, idx) => {
        try {
          const html = (el as HTMLElement).outerHTML || "";
          let m: RegExpExecArray | null = null;
          while ((m = re.exec(html)) !== null) {
            try {
              let url = m[1];
              if (url.startsWith("//")) url = window.location.protocol + url;
              if (url && !url.startsWith("http"))
                url = new URL(url, window.location.href).href;
              if (url) out.push({ src: url, alt: "", index: 2000000 + idx });
            } catch {
              // ignore
            }
          }
        } catch {
          // ignore
        }
      });
    } catch {
      // ignore
    }
    return out;
  });

  return [
    ...imgsFromSrc,
    ...imgsFromAttrs,
    ...imgsFromSrcset,
    ...sourceImages,
    ...bgImages,
    ...attrImages,
    ...outerHtmlImages,
  ].filter(Boolean);
}

async function quickScrollForLinks(page: Page): Promise<void> {
  try {
    await page.evaluate(async () => {
      try {
        const h = Math.min(
          window.innerHeight * 2.0,
          document.body.scrollHeight || 0,
        );
        window.scrollBy(0, h);
        await new Promise((r) => setTimeout(r, 300));
        window.scrollTo(0, 0);
      } catch {
        // ignore
      }
    });

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
              window.innerHeight * 2.0,
              document.body.scrollHeight || 0,
            );
            window.scrollBy(0, h);
            await new Promise((r) => setTimeout(r, 900));
            window.scrollTo(0, 0);
          } catch {
            // ignore
          }
        });
      } catch {
        // ignore
      }
    }

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
                } catch {
                  // ignore
                }
                resolve(false);
              }, 1500);
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

  // Try to wait briefly for `#main-content` to populate text content.
  // Some pages render main content asynchronously; poll for non-empty
  // innerText for up to ~2000ms before extracting. This is a lightweight
  // attempt and will fall back to existing extraction logic if not found.
  try {
    // Wait until the element exists and has >20 trimmed chars (heuristic)
    // Keep timeout short to avoid slowing fast runs.
    await page.waitForFunction(
      () => {
        try {
          const el = document.querySelector("#main-content");
          if (!el) return false;
          const txt = (el as HTMLElement).innerText || el.textContent || "";
          return txt.trim().length > 20;
        } catch {
          return false;
        }
      },
      { timeout: 2000 },
    );
  } catch {
    // ignore — fallback extraction will try `body` if content isn't available
  }

  const content: string = await page
    .$eval("#main-content", (el: Element) => {
      try {
        return (el as HTMLElement).innerText?.trim() || "";
      } catch {
        return el.textContent?.trim() || "";
      }
    })
    .catch(async () => {
      const body = await page.$("body");
      if (body) {
        return body.evaluate(
          (el: HTMLElement) =>
            (el.innerText?.trim() || el.textContent?.trim() || "") as string,
        );
      }
      return "";
    });

  let allImagesRaw: unknown[] = [];
  if (includeImages) {
    allImagesRaw = await gatherAllImagesForPage(page);
  }

  // DEBUG: log raw images discovered on the page to help diagnose missing images
  try {
    logger.debug("pageExtraction: gathered images (raw count):", {
      count: Array.isArray(allImagesRaw) ? allImagesRaw.length : 0,
      sample: Array.isArray(allImagesRaw)
        ? (allImagesRaw as unknown[]).slice(0, 40)
        : [],
    });
  } catch {
    // ignore logging failures
  }

  if (!includeImages) {
    await quickScrollForLinks(page);
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

  const supportedImages = normalizedImages.filter((img) => {
    const lowerSrc = img.src.toLowerCase();
    for (const ext of config.image.excludeFormats)
      if (lowerSrc.includes(`.${ext}`)) return false;
    return true;
  });

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
