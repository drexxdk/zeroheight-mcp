#!/usr/bin/env tsx
/* eslint-disable complexity */
/* eslint-disable max-lines-per-function */

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import type { KnownModule } from "./utils/toolTypes";
import path from "path";

export type Command =
  | "scrape-pages"
  | "api-scraper"
  | "scrape-project"
  | "build-pages-model"
  | "fix-pages-query"
  | "scrape"
  | "run-tool"
  | "check-task-status"
  | "clear-data"
  | "run-tools-list"
  | "test-mcp-list"
  | "cancel-task"
  | "tail-job"
  | "tail-job-long"
  | "tail-job-admin"
  | "start-test-task"
  | "check-task";

export async function run(
  command: Command,
  opts?: { argv?: string[]; args?: Record<string, unknown> },
): Promise<void> {
  const { config } = await import("@/utils/config");
  const logger = (await import("@/utils/logger")).default;
  const runTool = (await import("./utils/run-tool")).default;
  const argv = opts?.argv ?? [];

  switch (command) {
    case "scrape":
      {
        // unified scrape entry that accepts flags for includeImages and fullScrape
        const parseBoolFlag = (names: string[]): boolean => {
          // check opts.args first
          if (
            opts?.args &&
            typeof opts.args === "object" &&
            opts.args !== null
          ) {
            for (const n of names) {
              const v = Reflect.get(opts.args as object, n);
              if (typeof v === "boolean") return v;
              if (typeof v === "string") {
                if (v === "true") return true;
                if (v === "false") return false;
              }
            }
          }
          // fall back to argv parsing
          for (const a of argv) {
            for (const name of names) {
              const kebab = name.replace(
                /([A-Z])/g,
                (m) => `-${m.toLowerCase()}`,
              );
              if (a === `--${name}` || a === `--${kebab}`) return true;
              if (a.startsWith(`--${name}=`) || a.startsWith(`--${kebab}=`)) {
                const rhs = a.split("=")[1];
                return rhs === "true" || rhs === "1";
              }
            }
          }
          // fall back to npm-config env vars (npm interprets flags)
          for (const name of names) {
            const envKey = `npm_config_${name.toLowerCase().replace(/-/g, "_")}`;
            // eslint-disable-next-line no-restricted-properties
            const envVal = process.env[envKey];
            if (typeof envVal === "string") {
              if (envVal === "true" || envVal === "1") return true;
              if (envVal === "false" || envVal === "0") return false;
            }
          }

          return false;
        };

        const includeImages = parseBoolFlag([
          "includeImages",
          "include-images",
        ]);
        const fullScrape = parseBoolFlag(["fullScrape", "full-scrape"]);

        const password = (await import("@/utils/config")).config.env
          .zeroheightProjectPassword as string | undefined;

        if (fullScrape) {
          await runTool("@/tools/scraper/scrape" as KnownModule, {
            exportName: "scrapeTool",
            args: { password, includeImages },
          });
          return;
        }

        // page-only default
        const urls: string[] = (opts?.args &&
          (opts.args.pageUrls as unknown as string[])) ?? [
          "https://designsystem.lruddannelse.dk/10548dffa/p/51380f-graph-patterns-wip",
          "https://designsystem.lruddannelse.dk/10548dffa/p/3441e1-lindhardt-og-ringhof-uddannelse-design-system",
        ];
        await runTool("@/tools/scraper/scrape" as KnownModule, {
          exportName: "scrapeTool",
          args: { pageUrls: urls, password, includeImages },
        });
      }
      return;

    case "scrape-pages": {
      const urls: string[] = (opts?.args &&
        (opts.args.pageUrls as unknown as string[])) ?? [
        "https://designsystem.lruddannelse.dk/10548dffa/p/51380f-graph-patterns-wip",
        "https://designsystem.lruddannelse.dk/10548dffa/p/3441e1-lindhardt-og-ringhof-uddannelse-design-system",
      ];
      const password = config.env.zeroheightProjectPassword || undefined;
      const api = await import("@/tools/api-scraper/api-scraper");
      const outFile = path.join(
        process.cwd(),
        "src",
        "generated",
        "pages.json",
      );
      await api.fetchPages({
        rootUrl: urls[0] ?? config.env.zeroheightProjectUrl,
        password,
        outFile,
      });
      return;
    }

    case "api-scraper": {
      // Run the API scraper (browser capture of pages API)
      const password = config.env.zeroheightProjectPassword || undefined;
      const api = await import("@/tools/api-scraper/api-scraper");
      const outFile = path.join(
        process.cwd(),
        "src",
        "tools",
        "api-scraper",
        "generated",
        "pages.json",
      );
      await api.fetchPages({
        rootUrl: config.env.zeroheightProjectUrl,
        password,
        outFile,
      });

      // After capturing pages, run analysis and build steps to produce the
      // canonical pages-model.json so `npx tsx scripts/cli.ts api-scraper`
      // performs the full capture→analyze→build flow.
      try {
        const build =
          await import("@/tools/api-scraper/utils/build-pages-model");
        await build.default();
      } catch {
        // continue even if build fails
      }
      return;
    }

    case "scrape-project": {
      const password = config.env.zeroheightProjectPassword || undefined;
      const api = await import("@/tools/api-scraper/api-scraper");
      const outFile = path.join(
        process.cwd(),
        "src",
        "generated",
        "pages.json",
      );
      await api.fetchPages({
        rootUrl: config.env.zeroheightProjectUrl,
        password,
        outFile,
      });
      return;
    }

    case "run-tool": {
      // Generic entry to run any tool module via the existing runTool helper.
      // Usage: run('run-tool', { args: { modulePath, exportName, args } })
      const a = opts?.args ?? {};
      const modulePath = a.modulePath as string | undefined;
      const exportName = (a.exportName as string | undefined) ?? "default";
      const toolArgs = (a.args as Record<string, unknown> | undefined) ?? {};
      if (!modulePath) throw new Error("modulePath is required for run-tool");
      await runTool(modulePath as KnownModule, {
        exportName: exportName as string,
        args: toolArgs,
      });
      return;
    }

    case "build-pages-model": {
      const build = await import("@/tools/api-scraper/utils/build-pages-model");
      await build.default();
      return;
    }

    /* analyzer removed: use existing pages-query.json as reference only */

    case "fix-pages-query": {
      const fix = await import("@/tools/api-scraper/utils/fix-pages-query");
      await fix.default();
      return;
    }

    case "check-task-status": {
      const ids = opts?.argv && opts.argv.length ? opts.argv : argv;
      if (!ids || ids.length === 0) {
        logger.error(
          "Usage: npx tsx scripts/cli.ts check-task-status <taskId> [...ids]",
        );
        process.exit(2);
      }
      const { getJobFromDb } =
        await import("../src/tools/tasks/utils/jobStore");
      for (const jobId of ids) {
        logger.log(`Checking status for jobId=${jobId}...`);
        const job = await getJobFromDb({ jobId });
        logger.log(JSON.stringify(job, null, 2));
      }
      return;
    }

    case "clear-data": {
      if (!config.env.zeroheightMcpAccessToken) {
        logger.error(
          "❌ Error: ZEROHEIGHT_MCP_ACCESS_TOKEN environment variable not set",
        );
        process.exit(1);
      }

      logger.log(`Calling clear-all-data tool (destructive) ...`);

      // `runTool` already logs the structured result; avoid duplicate logging
      // here to prevent printing the same payload twice.
      await runTool("@/tools/database/clear-all-data" as KnownModule, {
        exportName: "clearAllDataTool",
        args: { apiKey: config.env.zeroheightMcpAccessToken },
      });
      return;
    }

    case "run-tools-list": {
      // Use local list tool via runTool
      const res = await runTool("@/tools/mcp/list" as KnownModule, {
        exportName: "listToolsTool",
      });
      try {
        logger.log(JSON.stringify(res, null, 2));
      } catch {
        logger.log(String(res));
      }
      return;
    }

    case "test-mcp-list": {
      // Call the same local tool but display headers/metadata
      type ListResult = {
        status?: number;
        headers?: Record<string, string>;
        body?: unknown;
      };
      const r = (await runTool("@/tools/mcp/list" as KnownModule, {
        exportName: "listToolsTool",
      })) as unknown;
      if (r && typeof r === "object") {
        const resObj = r as ListResult;
        const status = resObj.status;
        const headers = resObj.headers;
        const body = resObj.body;
        logger.log("STATUS", status);
        logger.log("HEADERS", headers);
        try {
          logger.log(JSON.stringify(body, null, 2));
        } catch {
          logger.log(String(body));
        }
      } else {
        try {
          logger.log(JSON.stringify(r, null, 2));
        } catch {
          logger.log(String(r));
        }
      }
      return;
    }

    case "cancel-task": {
      const ids = opts?.argv ?? [];
      if (ids.length === 0) {
        logger.error(
          "Usage: npx tsx scripts/cli.ts cancel-task <taskId> [...ids]",
        );
        process.exit(2);
      }
      for (const id of ids) {
        const res = await runTool("@/tools/tasks/cancel" as KnownModule, {
          exportName: "tasksCancelTool",
          args: { taskId: id },
        });
        logger.log(JSON.stringify(res, null, 2));
      }
      return;
    }

    case "check-task": {
      const ids = opts?.argv ?? [];
      if (ids.length === 0) {
        logger.error("Usage: npx tsx scripts/cli.ts check-task <taskId>");
        process.exit(2);
      }
      for (const id of ids) {
        const res = await runTool("@/tools/tasks/get" as KnownModule, {
          exportName: "tasksGetTool",
          args: { taskId: id, requestedTtlMs: 0 },
        });
        logger.log(JSON.stringify(res, null, 2));
      }
      return;
    }

    case "start-test-task": {
      const arg = opts?.argv?.[0];
      let durationMinutes = arg ? Number(arg) : 5;
      if (Number.isNaN(durationMinutes) || durationMinutes <= 0) {
        logger.warn(
          `Invalid duration provided (${String(arg)}). Falling back to default 5 minutes.`,
        );
        durationMinutes = 5;
      }
      const res = await runTool("@/tools/scraper/testTask" as KnownModule, {
        exportName: "testTaskTool",
        args: { durationMinutes },
      });
      logger.log("Tool returned:", JSON.stringify(res, null, 2));
      return;
    }

    case "tail-job": {
      const ids = opts?.argv ?? [];
      if (ids.length === 0) {
        logger.error("Usage: npx tsx scripts/cli.ts tail-job <taskId>");
        process.exit(2);
      }
      for (const jobId of ids) {
        logger.log("Querying task result:", jobId);
        const res = await runTool("@/tools/tasks" as KnownModule, {
          exportName: "tasksResultTool",
          args: { taskId: jobId, timeoutMs: 10000 },
        });
        logger.log(JSON.stringify(res, null, 2));
      }
      return;
    }

    case "tail-job-long": {
      const ids = opts?.argv ?? [];
      if (ids.length === 0) {
        logger.error(
          "Usage: npx tsx scripts/cli.ts tail-job-long <taskId> [timeoutMs]",
        );
        process.exit(2);
      }
      const defaultTimeout = config.server.longTailTimeoutMs;
      const timeoutMsArg = Number(opts?.argv?.[1] ?? defaultTimeout);
      const timeoutMs = Number.isFinite(timeoutMsArg)
        ? timeoutMsArg
        : defaultTimeout;
      for (const jobId of ids) {
        logger.log(
          "Querying task result (long wait):",
          jobId,
          `timeoutMs=${timeoutMs}`,
        );
        const res = await runTool("@/tools/tasks" as KnownModule, {
          exportName: "tasksResultTool",
          args: { taskId: jobId, timeoutMs },
        });
        logger.log(JSON.stringify(res, null, 2));
      }
      return;
    }

    case "tail-job-admin": {
      const jobId = opts?.argv?.[0];
      if (!jobId) {
        logger.error("Usage: npx tsx scripts/cli.ts tail-job-admin <taskId>");
        process.exit(2);
      }
      const { getSupabaseAdminClient } = await import("../src/utils/common");
      const supabase = getSupabaseAdminClient();
      if (!supabase) {
        logger.error("Admin supabase client not configured");
        process.exit(1);
      }
      logger.log("Fetching job via admin client:", jobId);
      const { data, error } = await supabase
        .from("tasks")
        .select("id, status, logs, started_at, finished_at")
        .eq("id", jobId)
        .maybeSingle();
      if (error) {
        logger.error("Supabase error:", error);
        process.exit(1);
      }
      if (!data) {
        logger.log("No job found with id=", jobId);
        return;
      }
      logger.log(JSON.stringify(data, null, 2));
      return;
    }

    default:
      // TypeScript should prevent this, but keep a runtime guard for safety
      throw new Error(`Unknown command: ${String(command)}`);
  }
}

import { fileURLToPath } from "url";

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  // invoked directly from CLI
  (async () => {
    try {
      const [, , commandRaw, ...rest] = process.argv;
      if (!commandRaw) {
        const logger = (await import("@/utils/logger")).default;
        logger.error("Usage: npx tsx scripts/cli.ts <command> [args]");
        process.exit(2);
      }
      // runtime-validate command string
      const validCommands: Command[] = [
        "scrape",
        "scrape-pages",
        "api-scraper",
        "scrape-project",
        "build-pages-model",
        "fix-pages-query",
        "run-tool",
        "check-task-status",
        "clear-data",
        "run-tools-list",
        "test-mcp-list",
        "cancel-task",
        "tail-job",
        "tail-job-long",
        "tail-job-admin",
        "start-test-task",
        "check-task",
      ];
      if (!validCommands.includes(commandRaw as Command)) {
        const logger = (await import("@/utils/logger")).default;
        logger.error(`Unknown command: ${commandRaw}`);
        logger.error(`Allowed: ${validCommands.join(", ")}`);
        process.exit(2);
      }
      await run(commandRaw as Command, { argv: rest });
    } catch (err) {
      const logger = (await import("@/utils/logger")).default;
      logger.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  })();
}
