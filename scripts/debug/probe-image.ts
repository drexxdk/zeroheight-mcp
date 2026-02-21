#!/usr/bin/env tsx

export {};
import logger from "../../src/utils/logger";

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv.length === 0) {
    logger.error("Usage: npx tsx scripts/debug/probe-image.ts <url>");
    process.exit(1);
  }
  const url = argv[0];
  try {
    const res = await fetch(url);
    logger.error("HTTP", res.status, res.statusText);
    const cl = res.headers.get("content-length");
    logger.error("Content-Length:", cl);
    const buf = new Uint8Array(await res.arrayBuffer());
    processBuffer(buf);
  } catch (e) {
    logger.error("fetch failed:", e instanceof Error ? e.message : e);
    process.exit(1);
  }
}

function readBE(bytes: Uint8Array, off: number): number {
  return (
    ((bytes[off] << 24) |
      (bytes[off + 1] << 16) |
      (bytes[off + 2] << 8) |
      bytes[off + 3]) >>>
    0
  );
}

function detectPng(buf: Uint8Array): { width: number; height: number } | null {
  if (
    buf.length >= 24 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47
  ) {
    return { width: readBE(buf, 16), height: readBE(buf, 20) };
  }
  return null;
}

function detectJpeg(
  buf: Uint8Array,
): { width?: number; height?: number; found: boolean } | null {
  if (!(buf.length >= 4 && buf[0] === 0xff && buf[1] === 0xd8)) return null;
  let i = 2;
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xff) {
      i++;
      continue;
    }
    const marker = buf[i + 1];
    const len = (buf[i + 2] << 8) | buf[i + 3];
    if (marker >= 0xc0 && marker <= 0xc3) {
      const height = (buf[i + 5] << 8) | buf[i + 6];
      const width = (buf[i + 7] << 8) | buf[i + 8];
      return { width, height, found: true };
    }
    i += 2 + len;
  }
  return { found: false };
}

function processBuffer(buf: Uint8Array): void {
  const png = detectPng(buf);
  if (png) {
    logger.log("format: PNG");
    logger.log("intrinsic:", `${png.width}x${png.height}`);
    logger.log("bytes:", buf.length);
    return;
  }

  const jpeg = detectJpeg(buf);
  if (jpeg) {
    if (jpeg.found && jpeg.width && jpeg.height) {
      logger.log("format: JPEG");
      logger.log("intrinsic:", `${jpeg.width}x${jpeg.height}`);
      logger.log("bytes:", buf.length);
    } else {
      logger.log(
        "format: JPEG (dimensions not found in scanned bytes)",
        "bytes:",
        buf.length,
      );
    }
    return;
  }

  logger.log("unknown format - first bytes:", buf.slice(0, 16));
  logger.log("bytes:", buf.length);
}

main();
