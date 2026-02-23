/// <reference types="vitest/globals" />
import { toErrorObj } from "@/utils/common/errorUtils";

describe("toErrorObj", () => {
  test("returns message for Error instances", () => {
    const res = toErrorObj(new Error("boom"));
    expect(res).toEqual({ message: "boom" });
  });

  test("returns message for record with message", () => {
    const res = toErrorObj({ message: "oops" });
    expect(res).toEqual({ message: "oops" });
  });

  test("returns null for null/undefined", () => {
    expect(toErrorObj(null)).toBeNull();
    expect(toErrorObj(undefined)).toBeNull();
  });

  test("stringifies primitives", () => {
    expect(toErrorObj(123)).toEqual({ message: "123" });
    expect(toErrorObj("hey")).toEqual({ message: "hey" });
  });
});
