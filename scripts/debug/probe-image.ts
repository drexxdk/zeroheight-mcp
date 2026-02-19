#!/usr/bin/env tsx

export {};

async function main() {
  const argv = process.argv.slice(2);
  if (argv.length === 0) {
    console.error("Usage: npx tsx scripts/debug/probe-image.ts <url>");
    process.exit(1);
  }
  const url = argv[0];
  try {
    const res = await fetch(url);
    console.error("HTTP", res.status, res.statusText);
    const cl = res.headers.get("content-length");
    console.error("Content-Length:", cl);
    const buf = new Uint8Array(await res.arrayBuffer());
    function readBE(bytes: Uint8Array, off: number) {
      return (
        ((bytes[off] << 24) |
          (bytes[off + 1] << 16) |
          (bytes[off + 2] << 8) |
          bytes[off + 3]) >>>
        0
      );
    }
    if (
      buf.length >= 24 &&
      buf[0] === 0x89 &&
      buf[1] === 0x50 &&
      buf[2] === 0x4e &&
      buf[3] === 0x47
    ) {
      const width = readBE(buf, 16);
      const height = readBE(buf, 20);
      console.log("format: PNG");
      console.log("intrinsic:", `${width}x${height}`);
      console.log("bytes:", buf.length);
      return;
    }
    if (buf.length >= 4 && buf[0] === 0xff && buf[1] === 0xd8) {
      // JPEG: scan for SOF markers
      let i = 2;
      let found = false;
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
          console.log("format: JPEG");
          console.log("intrinsic:", `${width}x${height}`);
          console.log("bytes:", buf.length);
          found = true;
          break;
        }
        i += 2 + len;
      }
      if (!found)
        console.log(
          "format: JPEG (dimensions not found in scanned bytes)",
          "bytes:",
          buf.length,
        );
      return;
    }
    console.log("unknown format - first bytes:", buf.slice(0, 16));
    console.log("bytes:", buf.length);
  } catch (e) {
    console.error("fetch failed:", e instanceof Error ? e.message : e);
    process.exit(1);
  }
}

main();
