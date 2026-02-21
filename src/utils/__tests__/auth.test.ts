import { authenticateRequest } from "../auth";
import { describe, test, expect } from "vitest";

type NextRequestLike = {
  headers: { get: (k: string) => string | null };
  nextUrl?: { searchParams: URLSearchParams };
};

function makeReq(
  headers: Record<string, string | null>,
  query = "",
): NextRequestLike {
  return {
    headers: {
      get(k: string) {
        return headers[k.toLowerCase()] ?? null;
      },
    },
    nextUrl: {
      searchParams: new URLSearchParams(query),
    },
  };
}

describe("authenticateRequest", () => {
  test("returns invalid when no key provided", () => {
    const req = makeReq({});
    const res = authenticateRequest({ request: req });
    expect(res.isValid).toBe(false);
    expect(res.error).toBeTruthy();
  });

  test("accepts matching server key via query param", () => {
    const req = makeReq({}, "api_key=test-zeroheight-token");
    const res = authenticateRequest({ request: req });
    expect(res.isValid).toBe(true);
  });

  test("rejects non-matching header key when server key set", () => {
    const req = makeReq({ authorization: "Bearer wrong-key" });
    const res = authenticateRequest({ request: req });
    expect(res.isValid).toBe(false);
  });
});
