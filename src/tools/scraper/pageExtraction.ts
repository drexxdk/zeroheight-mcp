import type { Page } from "puppeteer";
import { EXCLUDE_IMAGE_FORMATS } from "@/lib/config";

export type ExtractedImage = {
  src: string;
  alt: string;
  originalSrc?: string;
  index?: number;
};

export async function extractPageData(
  page: Page,
  pageUrl: string,
  allowedHostname: string,
) {
  const title: string = await page.title();

  const content: string = await page
    .$eval(
      ".zh-content, .content, main .content, [data-testid='page-content'], .page-content",
      (el: Element) => el.textContent?.trim() || "",
    )
    .catch(async () => {
      return page
        .$eval("body", (body) => {
          const clone = body.cloneNode(true) as HTMLElement;
          const navs = clone.querySelectorAll(
            "nav, header, .navigation, .header, .sidebar",
          );
          navs.forEach((nav) => nav.remove());
          const mainContent = clone.querySelector(
            "main, .main, .content, .zh-content, [role='main']",
          );
          if (mainContent) return mainContent.textContent?.trim() || "";
          return clone.textContent?.trim().substring(0, 10000) || "";
        })
        .catch(() => "");
    });

  const images = await page.$$eval("img", (imgs: HTMLImageElement[]) =>
    imgs.map((img, index) => {
      let src = img.src;
      if (!src.startsWith("http"))
        src = new URL(src, window.location.href).href;
      return { src, alt: img.alt, index };
    }),
  );

  const bgImages = await page.$$eval(
    "*",
    (elements, imagesLength) => {
      return elements
        .map((el, index) => {
          const style = window.getComputedStyle(el as Element);
          const bg = style.backgroundImage;
          if (bg && bg.startsWith("url(")) {
            let url = bg.slice(4, -1).replace(/['"]+/g, "");
            if (!url.startsWith("http"))
              url = new URL(url, window.location.href).href;
            if (url.startsWith("http"))
              return { src: url, alt: "", index: imagesLength + index };
          }
        })
        .filter(Boolean);
    },
    images.length,
  );

  const allImages = [...images, ...bgImages].filter(
    Boolean,
  ) as ExtractedImage[];

  // Normalize image URLs to prevent duplicates from signed URLs
  const normalizedImages = allImages.map((img) => {
    let normalizedSrc = img.src;

    if (normalizedSrc.includes("cdn.zeroheight.com")) {
      try {
        const url = new URL(normalizedSrc);
        normalizedSrc = `${url.protocol}//${url.hostname}${url.pathname}`;
      } catch {}
    }

    if (
      normalizedSrc.includes("s3.") ||
      normalizedSrc.includes("amazonaws.com")
    ) {
      try {
        const url = new URL(normalizedSrc);
        normalizedSrc = `${url.protocol}//${url.hostname}${url.pathname}`;
      } catch {}
    }

    return { ...img, src: normalizedSrc, originalSrc: img.src };
  });

  // Filter out excluded image formats
  const supportedImages = normalizedImages.filter((img) => {
    const lowerSrc = img.src.toLowerCase();
    for (const ext of EXCLUDE_IMAGE_FORMATS)
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
