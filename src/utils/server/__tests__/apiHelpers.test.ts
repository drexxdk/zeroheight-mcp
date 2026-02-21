/// <reference types="vitest/globals" />
import { z } from "zod";
import { parseAndValidateJson } from "../apiHelpers";

function makeReq(body?: Record<string, unknown>): Request {
  const init: RequestInit = {
    method: "POST",
    body: body === undefined ? "" : JSON.stringify(body),
    headers: {},
  };
  return new Request("http://localhost", init);
}

describe("parseAndValidateJson", () => {
  const schema = z.object({
    name: z.string(),
    age: z.number().int().optional(),
  });

  test("returns data for valid payload", async () => {
    const req = makeReq({ name: "alice", age: 30 });
    const res = await parseAndValidateJson(req, schema);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.name).toBe("alice");
  });

  test("returns error for invalid payload", async () => {
    const req = makeReq({ name: 123 });
    const res = await parseAndValidateJson(req, schema);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain("name");
  });
});
