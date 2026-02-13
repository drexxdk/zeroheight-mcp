import { z } from "zod";
import { createErrorResponse, createSuccessResponse } from "../../common";

type JobStatus = "running" | "completed" | "failed";

type Job = {
  id: string;
  name: string;
  status: JobStatus;
  startedAt: number;
  finishedAt?: number;
  error?: string;
  logs: string[];
};

const jobs = new Map<string, Job>();

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function createJob(
  name: string,
  runner: (log: (s: string) => void) => Promise<unknown>,
) {
  const id = genId();
  const job: Job = {
    id,
    name,
    status: "running",
    startedAt: Date.now(),
    logs: [],
  };
  jobs.set(id, job);

  const logger = (s: string) => {
    const line = `[${new Date().toISOString()}] ${s}`;
    job.logs.push(line);
    // also mirror to server console for visibility
    console.log(line);
  };

  // Run in background
  (async () => {
    try {
      await runner(logger);
      job.status = "completed";
      job.finishedAt = Date.now();
      logger("Job completed");
    } catch (e) {
      job.status = "failed";
      job.finishedAt = Date.now();
      job.error = e instanceof Error ? e.message : String(e);
      logger(`Job failed: ${job.error}`);
    }
  })();

  return id;
}

export function getJob(id: string) {
  return jobs.get(id) || null;
}

export function listJobs() {
  return Array.from(jobs.values()).sort((a, b) => b.startedAt - a.startedAt);
}

// MCP tool: get job status
export const getJobStatusTool = {
  title: "scrape-job-status",
  description: "Get status for a background scrape job (id)",
  inputSchema: z.object({ jobId: z.string() }),
  handler: ({ jobId }: { jobId: string }) => {
    const j = getJob(jobId);
    if (!j) return createErrorResponse(`Job ${jobId} not found`);
    return createSuccessResponse({
      id: j.id,
      status: j.status,
      startedAt: j.startedAt,
      finishedAt: j.finishedAt,
      error: j.error,
    });
  },
};

export const getJobLogsTool = {
  title: "scrape-job-logs",
  description: "Get logs for a background scrape job (id)",
  inputSchema: z.object({ jobId: z.string(), tail: z.number().optional() }),
  handler: ({ jobId, tail }: { jobId: string; tail?: number }) => {
    const j = getJob(jobId);
    if (!j) return createErrorResponse(`Job ${jobId} not found`);
    const logs = typeof tail === "number" ? j.logs.slice(-tail) : j.logs;
    return createSuccessResponse({ logs });
  },
};
