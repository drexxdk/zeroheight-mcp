import type { Scrape_jobsType } from "../../database.types";
import serverApi from "./serverApi";

export type JobRecord = Scrape_jobsType;

export async function createJobInDb(
  name: string,
  args?: Record<string, unknown>,
) {
  const payload = { name, args };
  const data = await serverApi.createJobInDb(payload);
  if (!data || typeof data !== "object" || data === null) return null;
  const idVal = (data as Record<string, unknown>)["id"];
  return typeof idVal === "string" ? idVal : null;
}

export async function claimNextJob(): Promise<JobRecord | null> {
  const data = await serverApi.callServer(`/api/jobs/claim`, {});
  if (!data) return null;
  return data as JobRecord;
}

export async function appendJobLog(jobId: string, line: string) {
  await serverApi.callServer(`/api/jobs/${encodeURIComponent(jobId)}/log`, {
    line,
  });
}

export async function finishJob(
  jobId: string,
  success: boolean,
  errorMsg?: string,
) {
  const body: Record<string, unknown> = { success };
  if (errorMsg) body.error = errorMsg;
  await serverApi.callServer(
    `/api/jobs/${encodeURIComponent(jobId)}/finish`,
    body,
  );
}

export async function getJobFromDb(jobId: string) {
  const data = await serverApi.callServer(
    `/api/jobs/${encodeURIComponent(jobId)}`,
  );
  if (!data) return null;
  return data as JobRecord;
}
