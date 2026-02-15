## Failed image: `0833d8-logo` (2026-02-15)

Symptom

- Scrape run downloaded 174 images and failed on 1: `0833d8-logo`.
- Logs show Sharp error: "Input buffer contains unsupported image format" and later: "Skipping non-image content: text/html; charset=utf-8".

What likely happened

- The scraper attempted to fetch a URL that resolves to a Zeroheight page (`/p/0833d8-logo`) rather than a raw image asset.
- The HTTP response was HTML (login/consent/error/Cloudflare page or a wrapper) so Sharp failed when trying to parse image bytes.

Quick checks to run tomorrow

1. Re-fetch the failing URL headers:
   - `curl -I "<URL>"` -> check `Content-Type` and status.
2. Fetch full body and inspect first bytes (Node):
   ```js
   // debug-fetch.js
   import fs from "fs";
   const res = await fetch("<URL>");
   console.log(res.status, res.headers.get("content-type"), res.url);
   const buf = Buffer.from(await res.arrayBuffer());
   fs.writeFileSync("debug.bin", buf);
   console.log(buf.slice(0, 64).toString("hex"));
   ```
3. Replay the fetch with the same cookies/headers the scraper uses (if images are behind login).

Possible fixes / experiments

- Add debug logging in `downloadImage` to log `response.status`, `response.url`, and `content-type` when `content-type` is not an image (helpful when `SCRAPER_DEBUG=true`).
- Ensure the downloader uses `originalSrc` (if present) and that prefetch supplies cookies to image downloader.
- Filter obvious page-URLs in `extractPageData` (skip `src` values containing `/p/` or those without an image extension), or add a lightweight HEAD request before downloading.
- Add a `Referer` header (page URL) and any authentication cookies to the image fetch; follow redirects but detect HTML responses and bail early.
- If site uses JS to transform images, consider evaluating the final `img.src` after navigation (already done) or fetching via Puppeteer’s `page.goto(img.src)` in a debug run.

Next actionable tasks

1. Add temporary debug logs to `downloadImage` and run the same scrape with `SCRAPER_DEBUG=true` to capture failing URL metadata.
2. If that proves the URL is a page, add a short filter to `extractPageData` to skip `/p/` links as images.
3. Re-run scrape and confirm zero failures.

Notes

- The failing filename `0833d8-logo` is the last path segment printed by the scraper; this matches a page id, which supports the "downloaded HTML page" hypothesis.

Recorded by: developer
