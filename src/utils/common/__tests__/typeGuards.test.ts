import { describe, it, expect } from "vitest";
import {
  isRecord,
  hasStringProp,
  isJson,
  getProp,
} from "@/utils/common/typeGuards";

describe("typeGuards", () => {
  it("isRecord recognizes objects and rejects null/primitive", () => {
    expect(isRecord({})).toBe(true);
    expect(isRecord([])).toBe(true);
    expect(isRecord(null)).toBe(false);
    expect(isRecord(42)).toBe(false);
    expect(isRecord("str")).toBe(false);
  });

  it("hasStringProp detects string properties", () => {
    expect(hasStringProp({ a: "x" }, "a")).toBe(true);
    expect(hasStringProp({ a: 1 }, "a")).toBe(false);
    expect(hasStringProp(null, "a")).toBe(false);
  });

  it("isJson returns true for serializable values and false for circular", () => {
    expect(isJson({ a: 1 })).toBe(true);
    const circular: Record<string, unknown> = {};
    circular["self"] = circular;
    expect(isJson(circular)).toBe(false);
  });

  it("getProp returns property values or undefined", () => {
    expect(getProp({ foo: "bar" }, "foo")).toBe("bar");
    expect(getProp(null, "foo")).toBeUndefined();
    expect(getProp({ a: 1 }, "missing")).toBeUndefined();
  });
});
