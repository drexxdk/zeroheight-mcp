/// <reference types="vitest/globals" />
import { normalizeImageUrl, hashFilenameFromUrl } from "../imageHelpers";

describe("imageHelpers", () => {
  test("normalizeImageUrl strips query and preserves protocol/host/path", () => {
    const src = "https://example.com/image.png?size=200";
    expect(normalizeImageUrl({ src })).toBe("https://example.com/image.png");
  });

  test("normalizeImageUrl returns original when invalid URL", () => {
    const src = "not a url";
    expect(normalizeImageUrl({ src })).toBe(src);
  });

  test("hashFilenameFromUrl returns a hashed filename with extension", () => {
    const url = "https://example.com/a.png";
    const fname = hashFilenameFromUrl({ url, ext: "png" });
    expect(typeof fname).toBe("string");
    expect(fname.endsWith(".png")).toBe(true);
  });
});
