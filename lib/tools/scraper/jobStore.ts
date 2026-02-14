import type { Scrape_jobsType } from "../../database.types";

export type JobRecord = Scrape_jobsType;

const SERVER_BASE =
  process.env.SERVER_API_BASE ||
  process.env.NEXT_PUBLIC_SERVER_API_BASE ||
  "http://localhost:3000";
const SERVER_API_KEY =
  process.env.SERVER_API_KEY || process.env.MCP_API_KEY || "";

async function callApi(path: string, opts: RequestInit = {}) {
  const url = `${SERVER_BASE}${path}`;
  const headers = new Headers(opts.headers || {});
  if (SERVER_API_KEY) headers.set("x-server-api-key", SERVER_API_KEY);
  headers.set("content-type", "application/json");
  const res = await fetch(url, { ...opts, headers });
  if (res.status === 204) return null;
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  if (!res.ok) {
    let msg = text;
    if (
      json &&
      typeof json === "object" &&
      json !== null &&
      "message" in json
    ) {
      const m = (json as Record<string, unknown>)["message"];
      if (typeof m === "string") msg = m;
    }
    throw new Error(`API ${path} failed: ${msg}`);
  }
  return json as unknown;
}

export async function createJobInDb(
  name: string,
  args?: Record<string, unknown>,
) {
  const payload = { name, args };
  const data = await callApi(`/api/jobs`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (!data || typeof data !== "object" || data === null) return null;
  const idVal = (data as Record<string, unknown>)["id"];
  return typeof idVal === "string" ? idVal : null;
}

export async function claimNextJob(): Promise<JobRecord | null> {
  const data = await callApi(`/api/jobs/claim`, { method: "POST" });
  if (!data) return null;
  return data as JobRecord;
}

export async function appendJobLog(jobId: string, line: string) {
  await callApi(`/api/jobs/${encodeURIComponent(jobId)}/log`, {
    method: "POST",
    body: JSON.stringify({ line }),
  });
}

export async function finishJob(
  jobId: string,
  success: boolean,
  errorMsg?: string,
) {
  const body: Record<string, unknown> = { success };
  if (errorMsg) body.error = errorMsg;
  await callApi(`/api/jobs/${encodeURIComponent(jobId)}/finish`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function getJobFromDb(jobId: string) {
  const data = await callApi(`/api/jobs/${encodeURIComponent(jobId)}`, {
    method: "GET",
  });
  if (!data) return null;
  return data as JobRecord;
}
