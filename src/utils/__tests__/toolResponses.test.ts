/// <reference types="vitest/globals" />
import {
  createErrorResponse,
  createSuccessResponse,
  normalizeToToolResponse,
} from "../toolResponses";

describe("toolResponses", () => {
  test("createErrorResponse wraps message", () => {
    const res = createErrorResponse({ message: "oops" });
    expect(res).toHaveProperty("content");
    expect(res.content[0].text).toBe("oops");
  });

  test("createSuccessResponse stringifies data", () => {
    const res = createSuccessResponse({ data: { a: 1 } });
    expect(res.content[0].text).toContain('"a": 1');
  });

  test("normalizeToToolResponse returns error for error-shaped input", () => {
    const res = normalizeToToolResponse({ error: "bad" });
    expect(res.content[0].text).toBe("bad");
  });

  test("normalizeToToolResponse preserves ToolResponse-like input and stringifies non-text items", () => {
    const input = {
      content: [{ type: "text", text: "ok" }, { foo: "bar" }],
    } as unknown;
    const res = normalizeToToolResponse(input);
    expect(res.content.length).toBe(2);
    expect(res.content[0].text).toBe("ok");
    // second item should be JSON string
    expect(res.content[1].text).toContain('"foo": "bar"');
  });
});
