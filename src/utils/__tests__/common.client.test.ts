import { describe, test, expect, vi } from "vitest";

// Mock supabase client factory
vi.mock("@supabase/supabase-js", () => {
  return {
    createClient: vi.fn((url: string, key: string) => ({ url, key })),
  };
});

import { getSupabaseClient, getSupabaseAdminClient } from "@/utils/common";
import { config } from "@/utils/config";

describe("Supabase client helpers", () => {
  test("getSupabaseClient returns memoized client using config values", () => {
    // First call should create a client
    const c1 = getSupabaseClient();
    expect(c1).not.toBeNull();
    // subsequent call should return same instance
    const c2 = getSupabaseClient();
    expect(c2).toBe(c1);
    // ensure it used config values (stringified check avoids casting)
    expect(JSON.stringify(c1)).toContain(config.env.nextPublicSupabaseUrl);
  });

  test("getSupabaseAdminClient creates a new admin client when keys present", () => {
    const a1 = getSupabaseAdminClient();
    const a2 = getSupabaseAdminClient();
    expect(a1).not.toBeNull();
    expect(a2).not.toBeNull();
    // Admin client is created fresh on each call
    expect(a1).not.toBe(a2);
    expect(JSON.stringify(a1)).toContain(config.env.nextPublicSupabaseUrl);
  });
});
