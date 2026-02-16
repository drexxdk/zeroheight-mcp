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
  await new Promise((r) => setTimeout(r, 2000));
}

export async function retryAsync<T>(options: {
  fn: () => Promise<T>;
  retries?: number;
  delayMs?: number;
}): Promise<T> {
  const { fn, retries = 3, delayMs = 500 } = options;
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
