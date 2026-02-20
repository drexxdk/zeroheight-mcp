#!/usr/bin/env tsx

import fs from "fs";
import path from "path";

type RawHeaders = Record<string, string | string[]>;

interface ReportRecord {
  timestamp?: number | string;
  responseSize?: number | null;
  headers?: RawHeaders;
  method?: string;
  url: string;
  status?: number;
  resourceType?: string;
}

interface InspectorReport {
  url?: string;
  blocked?: number;
  totalRequests?: number;
  totalBytes?: number;
  blockedTypes?: string[];
  records?: ReportRecord[];
}

interface HarHeader {
  name: string;
  value: string;
}

function toHeaderArray(headers?: RawHeaders): HarHeader[] {
  if (!headers) return [];
  return Object.entries(headers).map(([k, v]) => ({
    name: k,
    value: Array.isArray(v) ? v.join(", ") : String(v),
  }));
}

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

async function main(): Promise<void> {
  const input = process.argv[2];
  if (!input) {
    console.error(
      "Usage: npx tsx scripts/debug/report-to-har.ts <report.json>",
    );
    process.exit(2);
  }

  const reportPath = path.resolve(input);
  if (!fs.existsSync(reportPath)) {
    console.error("Report not found:", reportPath);
    process.exit(3);
  }

  const outDir = path.dirname(reportPath);
  ensureDir(outDir);
  const raw = fs.readFileSync(reportPath, "utf8");
  const report: InspectorReport = JSON.parse(raw) as InspectorReport;

  const entries = (report.records ?? []).map((r) => {
    const startedDateTime = r.timestamp
      ? new Date(r.timestamp).toISOString()
      : new Date().toISOString();
    const responseSize =
      typeof r.responseSize === "number" ? r.responseSize : -1;
    const headers = r.headers ?? {};

    return {
      startedDateTime,
      time: 0,
      request: {
        method: r.method ?? "GET",
        url: r.url,
        httpVersion: "HTTP/1.1",
        headers: [] as HarHeader[],
        queryString: [] as { name: string; value: string }[],
        headersSize: -1,
        bodySize: 0,
      },
      response: {
        status: typeof r.status === "number" ? r.status : 0,
        statusText: "",
        httpVersion: "HTTP/1.1",
        headers: toHeaderArray(headers),
        content: {
          size: responseSize,
          mimeType:
            (headers["content-type"] as string) ||
            (headers["Content-Type"] as string) ||
            "",
        },
        redirectURL: "",
        headersSize: -1,
        bodySize: responseSize,
      },
      cache: {},
      timings: {
        blocked: -1,
        dns: -1,
        connect: -1,
        send: 0,
        wait: 0,
        receive: 0,
        ssl: -1,
      },
    };
  });

  const har = {
    log: {
      version: "1.2",
      creator: { name: "report-to-har", version: "1" },
      pages: [] as { startedDateTime?: string; title?: string }[],
      entries,
    },
  };

  const outName = `trace-${new Date().toISOString().replace(/[:.]/g, "-")}.har`;
  const outPath = path.join(outDir, outName);
  fs.writeFileSync(outPath, JSON.stringify(har, null, 2), "utf8");
  console.log("Wrote HAR:", outPath);
}

main().catch((e) => {
  console.error(e && (e as Error).stack ? (e as Error).stack : String(e));
  process.exit(1);
});
