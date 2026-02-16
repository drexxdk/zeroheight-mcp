import type { Page } from "puppeteer";
import { extractPageData, ExtractedImage } from "./pageExtraction";
import { processImagesForPage } from "./pageProcessors";
import type { ImagesType, PagesType } from "@/database.types";

export type OverallProgress = {
  current: number;
  total: number;
  pagesProcessed: number;
  imagesProcessed: number;
};

export type LogProgressFn = (icon: string, message: string) => void;

export type ProcessPageParams = {
  page: Page;
  link: string;
  allowedHostname: string;
  storage: ReturnType<
    typeof import("@/utils/common/supabaseClients").getClient
  >["storage"];
  overallProgress: OverallProgress;
  allExistingImageUrls: Set<string>;
  pendingImageRecords: Array<{
    pageUrl: string;
    original_url: ImagesType["original_url"];
    storage_path: ImagesType["storage_path"];
  }>;
  logProgress: LogProgressFn;
  shouldCancel?: () => boolean;
  // helpers for marking attempts and invariant checks
  checkProgressInvariant: (p: OverallProgress, ctx: string) => void;
};

export async function processPageAndImages(
  params: ProcessPageParams & {
    preExtracted?:
      | {
          title: string;
          content: string;
          supportedImages: Array<{
            src: string;
            alt: string;
            originalSrc?: string;
          }>;
          normalizedImages: Array<{ src: string; alt: string }>;
          pageLinks: string[];
        }
      | undefined;
  },
) {
  const {
    page,
    link,
    allowedHostname,
    storage,
    overallProgress,
    allExistingImageUrls,
    pendingImageRecords,
    logProgress,
    shouldCancel,
    preExtracted,
  } = params;
  // Caller is expected to have navigated the `page` to `link` and handled redirects.
  const usedLink = link;

  const {
    title: pageTitle,
    content: pageContent,
    supportedImages,
    normalizedImages,
    pageLinks,
  } = (preExtracted as
    | undefined
    | {
        title: string;
        content: string;
        supportedImages: Array<{
          src: string;
          alt: string;
          originalSrc?: string;
        }>;
        normalizedImages: Array<{ src: string; alt: string }>;
        pageLinks: string[];
      }) ?? (await extractPageData(page, usedLink, allowedHostname));

  // Update progress counters for images
  // Note: callers should reserve `overallProgress.total` for images before
  // invoking this function when deterministic totals are required. If the
  // caller didn't, we still log the discovery but do not mutate `total`
  // here to avoid race conditions with concurrent workers.
  if (supportedImages.length > 0) {
    logProgress(
      "📷",
      `Found ${supportedImages.length} supported image${supportedImages.length === 1 ? "" : "s"} on this page (${normalizedImages.length - supportedImages.length} filtered out)`,
    );
  }

  const imgStats = await processImagesForPage({
    supportedImages,
    link: usedLink,
    storage,
    overallProgress,
    allExistingImageUrls,
    pendingImageRecords,
    logProgress,
    shouldCancel,
  });

  const pageUpsert = {
    url: usedLink as PagesType["url"],
    title: pageTitle,
    content: pageContent,
  };

  const processedPageEntry = {
    url: usedLink as PagesType["url"],
    title: pageTitle,
    content: pageContent,
    images: supportedImages.map((img: ExtractedImage) => ({
      src: img.src,
      alt: img.alt,
    })),
  };

  return {
    usedLink,
    pageUpsert,
    processedPageEntry,
    pageLinks,
    normalizedImages,
    supportedImages,
    imgStats,
  };
}
