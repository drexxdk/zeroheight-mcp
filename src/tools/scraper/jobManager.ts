import { z } from "zod";
import {
  createErrorResponse,
  createSuccessResponse,
} from "@/lib/toolResponses";
import { JobCancelled } from "@/lib/common/errors";
import { finishJob as finishJobInDb, markJobCancelledInDb } from "./jobStore";

type JobStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

type Job = {
  id: string;
  name: string;
  status: JobStatus;
  startedAt: number;
  finishedAt?: number;
  error?: string;
  logs: string[];
  cancelRequested?: boolean;
  externalId?: string | null;
};

const jobs = new Map<string, Job>();

export function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function createJob(
  name: string,
  runner: (log: (s: string) => void) => Promise<unknown>,
  externalId?: string,
) {
  const id = externalId ?? genId();
  const job: Job = {
    id,
    name,
    status: "running",
    startedAt: Date.now(),
    logs: [],
    externalId: externalId ?? null,
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
      // If the runner finished but a cancel was requested, keep cancelled state
      if (job.cancelRequested) {
        job.status = "cancelled";
        job.finishedAt = Date.now();
        logger("Job cancelled");
        if (job.externalId) {
          try {
            logger(`Marking external job ${job.externalId} cancelled in DB`);
            await markJobCancelledInDb(job.externalId);
            logger(`External job ${job.externalId} marked cancelled`);
          } catch (notifyErr) {
            logger(
              `Failed to mark external job cancelled: ${String(notifyErr)}`,
            );
            console.error(`Failed to mark external job cancelled:`, notifyErr);
          }
        }
      } else {
        job.status = "completed";
        job.finishedAt = Date.now();
        logger("Job completed");
        if (job.externalId) {
          try {
            logger(`Marking external job ${job.externalId} completed in DB`);
            await finishJobInDb(job.externalId, true);
            logger(`External job ${job.externalId} marked completed`);
          } catch (notifyErr) {
            logger(
              `Failed to mark external job completed: ${String(notifyErr)}`,
            );
            console.error(`Failed to mark external job completed:`, notifyErr);
          }
        }
      }
    } catch (e) {
      // If the runner threw a JobCancelled, treat it as cancellation
      if (e instanceof JobCancelled || job.cancelRequested) {
        job.status = "cancelled";
        job.finishedAt = Date.now();
        logger("Job cancelled");
        if (job.externalId) {
          try {
            await markJobCancelledInDb(job.externalId);
          } catch {
            // ignore
          }
        }
      } else {
        job.status = "failed";
        job.finishedAt = Date.now();
        job.error = e instanceof Error ? e.message : String(e);
        logger(`Job failed: ${job.error}`);
        if (job.externalId) {
          try {
            await finishJobInDb(job.externalId, false, job.error);
          } catch {
            // ignore
          }
        }
      }
    }
  })();

  return id;
}

export function getJob(id: string) {
  return jobs.get(id) || null;
}

export function cancelJob(id: string) {
  const j = jobs.get(id);
  if (!j) return false;
  if (j.status === "running") {
    j.cancelRequested = true;
    j.status = "cancelled" as JobStatus;
    j.finishedAt = Date.now();
    const line = `[${new Date().toISOString()}] Job cancelled via MCP`;
    j.logs.push(line);
    console.log(line);
    return true;
  }
  if (j.status === "queued") {
    j.status = "cancelled" as JobStatus;
    j.finishedAt = Date.now();
    const line = `[${new Date().toISOString()}] Queued job cancelled via MCP`;
    j.logs.push(line);
    console.log(line);
    return true;
  }
  return false;
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
