import { describe, test, expect } from "vitest";
import { config } from "@/utils/config";

describe("config defaults in test env", () => {
  test("env defaults are present and valid types", () => {
    expect(config.env.zeroheightMcpAccessToken).toBeDefined();
    expect(typeof config.env.zeroheightMcpAccessToken).toBe("string");
    expect(config.env.nextPublicSupabaseUrl).toMatch(/https?:\/\//);
  });
});
