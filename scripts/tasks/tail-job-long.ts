#!/usr/bin/env tsx

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import type { ToolResponse } from "@/utils/toolResponses";
import { normalizeToToolResponse } from "@/utils/toolResponses";
import type { ZodTypeAny } from "zod";

async function main(): Promise<void> {
  const ids = process.argv.slice(2);
  if (ids.length === 0) {
    console.error(
      "Usage: npx tsx scripts/tasks/tail-job-long.ts <taskId> [timeoutMs]",
    );
    process.exit(2);
  }
  const { config } = await import("../../src/utils/config");
  const defaultTimeout = config.server.longTailTimeoutMs;
  const timeoutMsArg = Number(process.argv[3] ?? String(defaultTimeout)); // default 5 minutes
  const timeoutMs = Number.isFinite(timeoutMsArg)
    ? timeoutMsArg
    : defaultTimeout;

  const { tasksResultTool } = await import("../../src/tools/tasks");
  for (const jobId of ids) {
    console.log(
      "Querying task result (long wait):",
      jobId,
      `timeoutMs=${timeoutMs}`,
    );
    const raw = await tasksResultTool.handler({
      taskId: jobId,
      timeoutMs,
    });
    const outputSchema = tasksResultTool.outputSchema as ZodTypeAny | undefined;
    if (outputSchema) {
      const parsed = outputSchema.safeParse(raw);
      if (!parsed.success) {
        console.error(
          "Validation failed for tasksResultTool:",
          parsed.error.format(),
        );
        const res = normalizeToToolResponse(raw);
        console.log(JSON.stringify(res, null, 2));
      } else {
        console.log(JSON.stringify(parsed.data, null, 2));
      }
    } else {
      const res: ToolResponse = normalizeToToolResponse(raw);
      console.log(JSON.stringify(res, null, 2));
    }
  }
}

main().catch((e) => {
  console.error("Error tailing job:", e instanceof Error ? e.message : e);
  process.exit(1);
});
