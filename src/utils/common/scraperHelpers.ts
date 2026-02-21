import type { Page } from "puppeteer";

export async function tryLogin(options: {
  page: Page;
  password?: string;
}): Promise<void> {
  const { page, password } = options;
  if (!password) return;
  const passwordInput = await page.$('input[type="password"]');
  if (!passwordInput) return;
  await passwordInput.type(password);
  await page.keyboard.press("Enter");
  try {
    const { config } = await import("@/utils/config");
    await new Promise((r) =>
      setTimeout(r, config.scraper.login.postSubmitWaitMs),
    );
  } catch {
    await new Promise((r) => setTimeout(r, 2000));
  }
}

export async function retryAsync<T>(options: {
  fn: () => Promise<T>;
  retries?: number;
  delayMs?: number;
}): Promise<T> {
  const { fn } = options;
  let { retries, delayMs } = options;
  try {
    const { config } = await import("@/utils/config");
    retries =
      typeof retries === "number" ? retries : config.scraper.retry.maxAttempts;
    delayMs =
      typeof delayMs === "number"
        ? delayMs
        : config.scraper.retry.defaultDelayMs;
  } catch {
    retries = typeof retries === "number" ? retries : 3;
    delayMs = typeof delayMs === "number" ? delayMs : 500;
  }
  let lastError: unknown;
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (e) {
      lastError = e;
      if (i < retries - 1) await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw lastError;
}

export type StorageUploadResult = {
  data?: { path?: string } | null;
  error?: { message?: string } | null;
};

export type ListBucketsResult = {
  data?: Array<{ name: string }> | null;
  error?: { message?: string } | null;
};

export type CreateBucketResult = {
  data?: { name?: string } | null;
  error?: { message?: string } | null;
};

export type StorageHelper = {
  upload: (filename: string, file: Buffer) => Promise<StorageUploadResult>;
  listBuckets?: () => Promise<ListBucketsResult>;
  createBucket?: (
    name: string,
    opts?: {
      public?: boolean;
      allowedMimeTypes?: string[] | null;
      fileSizeLimit?: number | null;
    },
  ) => Promise<CreateBucketResult>;
};

export async function uploadWithRetry(options: {
  storage: StorageHelper;
  filename: string;
  file: Buffer;
}): Promise<StorageUploadResult> {
  const { storage, filename, file } = options;
  try {
    return await retryAsync({ fn: () => storage.upload(filename, file) });
  } catch (e) {
    return { error: { message: String(e) } };
  }
}

export type SupabaseResult<T = Record<string, unknown>> = {
  data?: T | null;
  error?: { message?: string } | null;
};

export type SupabaseClientMinimal = {
  from: (table: string) => {
    upsert: (
      rows: Array<Record<string, unknown>>,
      opts?: { onConflict?: string },
    ) => {
      select: (
        sel: string,
      ) => Promise<SupabaseResult<Array<Record<string, unknown>>>>;
    };
    insert: (
      rows: Array<Record<string, unknown>>,
    ) => Promise<SupabaseResult<Array<Record<string, unknown>>>>;
  };
};
