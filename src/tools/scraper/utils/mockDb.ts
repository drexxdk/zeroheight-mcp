import type { SupabaseResult } from "@/utils/common/scraperHelpers";

export type TestThenable<T> = {
  limit: (n: number) => Promise<SupabaseResult<T>>;
  then: (fn: (v: SupabaseResult<T>) => unknown) => Promise<unknown>;
} & Record<string, unknown>;

export type TestQueryChain<T> = {
  in: (value: unknown, values?: unknown) => TestThenable<T>;
  ilike: (pattern: string, value: string) => Promise<SupabaseResult<T>>;
  order: (field: string, dir?: unknown) => TestThenable<T> | TestQueryChain<T>;
  then?: (fn: (v: SupabaseResult<T>) => unknown) => Promise<unknown>;
} & Record<string, unknown>;

export type TestFromReturn = {
  select: (cols?: string) => TestQueryChain<unknown>;
  upsert: (
    rows: unknown[],
    opts?: { onConflict?: string },
  ) => { select: (cols?: string) => Promise<SupabaseResult<unknown>> };
  insert: (rows: unknown[]) => {
    select: (cols?: string) => Promise<SupabaseResult<unknown>>;
  };
};

export type TestDbClient = { from: (table: string) => TestFromReturn };

export default {} as unknown;
