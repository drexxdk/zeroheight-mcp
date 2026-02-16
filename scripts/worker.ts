import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import {
  ZEROHEIGHT_PROJECT_URL,
  ZEROHEIGHT_PROJECT_PASSWORD,
} from "../src/utils/config";

import {
  claimNextJob,
  appendJobLog,
  finishJob,
} from "../src/tools/scraper/jobStore";
import { scrapeZeroheightProject } from "../src/tools/scraper/scrapeZeroheightProject";
import { JobCancelled } from "../src/utils/common/errors";

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  console.log("Worker started, polling for jobs...");
  while (true) {
    try {
      const job = await claimNextJob();
      if (!job) {
        await sleep(2000);
        continue;
      }

      const jobId = job.id;
      await appendJobLog(jobId, `Claimed job ${jobId}`);

      // run the scrape; pass a logger that writes to DB
      const logger = async (s: string) => {
        await appendJobLog(jobId, s);
      };

      try {
        // project URL and password come from env; args from job.args could be used
        const args =
          (job.args as Record<string, unknown> | undefined) || undefined;
        const pageUrls = Array.isArray(args?.pageUrls)
          ? (args.pageUrls as string[])
          : undefined;
        const projectUrl = ZEROHEIGHT_PROJECT_URL || "";
        const projectPassword = ZEROHEIGHT_PROJECT_PASSWORD || undefined;

        await scrapeZeroheightProject(
          projectUrl,
          projectPassword,
          pageUrls,
          (msg: string) => {
            void logger(msg);
          },
        );
        await finishJob(jobId, true);
      } catch (e: unknown) {
        const errMsg = e instanceof Error ? e.message : String(e);
        if (e instanceof JobCancelled) {
          await appendJobLog(jobId, "Job cancelled by request");
          // finish endpoint will respect cancelled status, so calling finish is optional
          await finishJob(jobId, false);
        } else {
          await appendJobLog(jobId, `Error: ${errMsg}`);
          await finishJob(jobId, false, errMsg);
        }
      }
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : String(e);
      console.error("Worker loop error", errMsg);
      await sleep(5000);
    }
  }
}

main();
