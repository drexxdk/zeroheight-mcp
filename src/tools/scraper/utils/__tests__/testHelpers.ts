/* Test helpers for strongly-typed mocks used in scraper utils tests */
import type {
  SupabaseClientMinimal,
  SupabaseResult,
  StorageHelper,
} from "@/utils/common/scraperHelpers";

export type MinimalSelect<T> = {
  select: (cols?: string) => Promise<SupabaseResult<T>>;
};

export type MockFrom = (table: string) => {
  // `select` can either return a Promise<SupabaseResult>` (minimal flow)
  // or a `QueryChain` to allow chained filters like `.in()`/`.order()` in
  // tests that mirror the real Supabase client's fluent API.
  select: (
    cols?: string,
  ) => Promise<SupabaseResult<unknown>> | QueryChain<unknown>;
  upsert?: (
    rows: unknown[],
    opts?: { onConflict?: string },
  ) => MinimalSelect<unknown>;
  insert?: (rows: unknown[]) => MinimalSelect<unknown>;
};

import type { TestDbClient } from "@/tools/scraper/utils/mockDb";

export type MockSupabaseClient = TestDbClient & Partial<SupabaseClientMinimal>;

export type MockStorage = StorageHelper;

export type MockedFn = {
  mockResolvedValue: (v: unknown) => void;
  mockImplementation: (fn: unknown) => void;
  mockImplementationOnce: (fn: unknown) => void;
};

export type QueryChain<T> =
  // Allow indexed access so test helpers can return objects that partially
  // implement the fluent API without strict structural mismatch errors.
  Record<string, unknown> & {
    in?: (
      value: unknown,
      values?: unknown,
    ) => { limit: (n: number) => Promise<SupabaseResult<T>> };
    ilike?: (pattern: string, value: string) => Promise<SupabaseResult<T>>;
    order?: (
      field: string,
      dir?: unknown,
    ) => { limit: (n: number) => Promise<SupabaseResult<T>> } | QueryChain<T>;
    then?: (fn: (v: SupabaseResult<T>) => unknown) => Promise<unknown>;
  };

export function makeSupabaseStub(fromImpl: MockFrom): MockSupabaseClient {
  return { from: fromImpl } as MockSupabaseClient;
}
