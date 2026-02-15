import type { Page } from "puppeteer";

export async function tryLogin(page: Page, password?: string): Promise<void> {
  if (!password) return;
  try {
    // Wait briefly for a password input to appear (some pages render it asynchronously)
    await page.waitForSelector('input[type="password"]', { timeout: 2000 });
  } catch {
    // Try to open a potential login form by clicking common login buttons/links
    try {
      const clicked = await page.$$eval("a, button", (els) => {
        const matcher = /log|sign|login|signin/i;
        for (const el of els as HTMLElement[]) {
          try {
            const text = (el.textContent || "").trim();
            if (matcher.test(text)) {
              (el as HTMLElement).click();
              return true;
            }
          } catch {}
        }
        return false;
      });
      if (!clicked) return;
      try {
        await page.waitForSelector('input[type="password"]', { timeout: 3000 });
      } catch {
        return;
      }
    } catch {
      return;
    }
  }
  const passwordInput = await page.$('input[type="password"]');
  if (!passwordInput) return;
  await passwordInput.type(password);
  await page.keyboard.press("Enter");
  await new Promise((r) => setTimeout(r, 2000));
}

export async function retryAsync<T>(
  fn: () => Promise<T>,
  retries = 3,
  delayMs = 500,
): Promise<T> {
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

export type StorageHelper = {
  upload: (filename: string, file: Buffer) => Promise<StorageUploadResult>;
  listBuckets?: () => Promise<{
    data?: Array<{ name: string }> | null;
    error?: unknown;
  }>;
  createBucket?: (
    name: string,
    opts: {
      public: boolean;
      allowedMimeTypes?: string[] | null;
      fileSizeLimit?: number | null;
    },
  ) => Promise<{ data?: unknown; error?: unknown }>;
};

export async function uploadWithRetry(
  storage: StorageHelper,
  filename: string,
  file: Buffer,
): Promise<StorageUploadResult> {
  try {
    return await retryAsync(() => storage.upload(filename, file), 3, 500);
  } catch (e) {
    return { error: { message: String(e) } };
  }
}

export type SupabaseResult<T = unknown> = {
  data?: T | null;
  error?: { message?: string } | null;
};

export type SupabaseClientMinimal = {
  from: (table: string) => {
    upsert: (
      rows: unknown,
      opts?: { onConflict?: string },
    ) => {
      select: (
        sel: string,
      ) => Promise<SupabaseResult<Array<Record<string, unknown>>>>;
    };
    insert: (rows: unknown) => Promise<SupabaseResult<unknown>>;
  };
};
