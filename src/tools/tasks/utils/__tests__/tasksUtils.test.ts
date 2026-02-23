/// <reference types="vitest/globals" />
import {
  SERVER_SUGGESTED_TTL_MS,
  SERVER_MAX_TTL_MS,
} from "@/tools/tasks/utils/ttl";
import { mapStatusToSep } from "@/tools/tasks/utils/status";
import { TERMINAL } from "@/tools/tasks/utils/terminal";
import { config } from "@/utils/config";

describe("tasks utils", () => {
  test("ttl constants reflect config values", () => {
    expect(SERVER_SUGGESTED_TTL_MS).toBe(config.server.suggestedTtlMs);
    expect(SERVER_MAX_TTL_MS).toBe(config.server.maxTtlMs);
  });

  test("mapStatusToSep maps running to working", () => {
    expect(mapStatusToSep({ status: "running" })).toBe("working");
    expect(mapStatusToSep({ status: "failed" })).toBe("failed");
  });

  test("TERMINAL contains final statuses", () => {
    expect(TERMINAL.has("completed")).toBe(true);
    expect(TERMINAL.has("cancelled")).toBe(true);
  });
});
