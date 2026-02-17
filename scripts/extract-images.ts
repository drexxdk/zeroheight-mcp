import fs from "fs";
import path from "path";

function latestReportPath(): string | null {
  const dir = path.join(process.cwd(), "logs", "puppeteer-inspect");
  if (!fs.existsSync(dir)) return null;
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.startsWith("report-") && f.endsWith(".json"))
    .map((f) => ({ f, t: fs.statSync(path.join(dir, f)).mtime.getTime() }))
    .sort((a, b) => b.t - a.t);
  return files.length ? path.join(dir, files[0].f) : null;
}

function extractImageUrls(reportPath: string) {
  const raw = fs.readFileSync(reportPath, "utf8");
  const doc = JSON.parse(raw);
  const urls: string[] = [];
  if (Array.isArray(doc.records)) {
    for (const r of doc.records) {
      if (r && r.resourceType === "image" && typeof r.url === "string") {
        urls.push(r.url);
      }
    }
  }
  return Array.from(new Set(urls));
}

function writeData(urls: string[]) {
  const outDir = path.join(process.cwd(), "src", "data");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, "extracted-images.json");
  fs.writeFileSync(outPath, JSON.stringify(urls, null, 2), "utf8");
  return outPath;
}

function main() {
  const rp = latestReportPath();
  if (!rp) {
    console.error("No inspector report found in logs/puppeteer-inspect");
    process.exit(1);
  }
  console.error("Using report:", rp);
  const urls = extractImageUrls(rp);
  if (!urls.length) {
    console.error("No image URLs found in report");
  } else {
    const out = writeData(urls);
    console.error(`Wrote ${urls.length} URLs to ${out}`);
  }
}

main();
