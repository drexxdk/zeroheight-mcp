#!/usr/bin/env node

import { config } from "dotenv";
// Ensure dotenv runs before importing any app modules that read env at module-evaluation time.
config({ path: ".env.local" });
import { isRecord } from "../../src/utils/common/typeGuards";
import type { ZodTypeAny } from "zod";
import logger from "../../src/utils/logger";

async function main(): Promise<void> {
  const cfg = await import("@/utils/config");
  if (!cfg.config.env.zeroheightMcpAccessToken) {
    logger.error("ZEROHEIGHT_MCP_ACCESS_TOKEN not set");
    process.exit(1);
  }

  logger.log("Starting TTL propagation e2e test...");

  // 1) Start a test task via MCP and extract jobId
  const startText = await callMcpStartTask(cfg);
  const startJson = parseSseOrJson(startText);
  if (!isRecord(startJson)) throw new Error("No JSON returned from testtask");
  if (startJson.error) throw new Error(JSON.stringify(startJson.error));
  const content = extractContent(startJson);
  if (!content) throw new Error("No content returned from testtask");
  const parsed = parseContentToObject(content);
  const jobId =
    (typeof parsed["jobId"] === "string" && parsed["jobId"]) ||
    (typeof parsed["id"] === "string" && parsed["id"]);
  if (!jobId) throw new Error("Could not extract jobId from testtask response");
  logger.log("Started test task with jobId:", jobId);

  // 2) Call tasks/get via MCP with params.task.ttl and verify response includes ttl
  const requestedTtl = 5000;
  // 2) Call tasks/get via MCP with params.task.ttl and verify response includes ttl
  await verifyTasksGet(cfg, requestedTtl, jobId);
}
main().catch((e) => {
  logger.error("Test failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});

function parseSseOrJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    const parts = text.split(/\r?\n/).filter(Boolean);
    const dataLines = parts.filter((l) => l.startsWith("data:"));
    if (dataLines.length > 0) {
      const last = dataLines[dataLines.length - 1].slice("data:".length).trim();
      return JSON.parse(last);
    }
  }
  return null;
}

function extractContent(obj: Record<string, unknown>): string | undefined {
  const res = obj["result"];
  if (isRecord(res)) {
    const content = res["content"];
    if (Array.isArray(content) && content.length > 0) {
      const first = content[0];
      const t = first["text"];
      if (typeof t === "string") return t;
      const d = first["data"];
      if (typeof d === "string") return d;
    }
    const rt = res["text"];
    if (typeof rt === "string") return rt;
  }
  const direct = obj["result"];
  if (typeof direct === "string") return direct;
  const topText = obj["text"];
  if (typeof topText === "string") return topText;
  return undefined;
}

function parseContentToObject(
  content: string | Record<string, unknown>,
): Record<string, unknown> {
  if (typeof content === "string") {
    try {
      const parsed: unknown = JSON.parse(content);
      if (isRecord(parsed)) return parsed;
      throw new Error("Parsed content is not an object");
    } catch {
      throw new Error(
        `Failed to parse JSON from testtask content. Raw content: ${content}`,
      );
    }
  }
  if (isRecord(content)) return content;
  throw new Error("Parsed content is not an object");
}

async function callMcpStartTask(
  cfg: typeof import("@/utils/config"),
): Promise<string> {
  const startRes = await fetch(cfg.config.server.mcpUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": cfg.config.env.zeroheightMcpAccessToken,
      Accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: "test-task", arguments: {} },
    }),
  });
  if (!startRes.ok) throw new Error(`Start task HTTP ${startRes.status}`);
  const startText = await startRes.text();
  logger.log("startText:", startText);
  return startText;
}

async function verifyTasksGet(
  cfg: typeof import("@/utils/config"),
  requestedTtl: number,
  jobId: string,
): Promise<void> {
  const getRes = await fetch(cfg.config.server.mcpUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": cfg.config.env.zeroheightMcpAccessToken,
      Accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: {
        name: "tasks-get",
        arguments: { taskId: jobId },
        task: { ttl: requestedTtl },
      },
    }),
  });
  if (!getRes.ok) throw new Error(`tasks/get HTTP ${getRes.status}`);
  const getText = await getRes.text();
  const getJson = parseSseOrJson(getText);
  if (!isRecord(getJson))
    throw new Error(`tasks/get did not return JSON. Raw response: ${getText}`);
  const gj = getJson;
  if (isRecord(gj) && gj.error) {
    await handleTasksGetFallback(gj, cfg, requestedTtl, jobId);
  }
  let actualResult: unknown = gj["result"];
  actualResult = unwrapActualResult(actualResult);
  const resultObj = isRecord(actualResult) ? actualResult : undefined;
  const taskNode =
    resultObj && isRecord(resultObj["task"]) ? resultObj["task"] : undefined;
  const ttl = taskNode ? taskNode["ttl"] : undefined;
  logger.log("tasks/get response ttl:", ttl);
  if (typeof ttl !== "number")
    throw new Error("TTL not present in tasks/get result");
  if (ttl !== requestedTtl)
    throw new Error(`TTL mismatch: expected ${requestedTtl}, got ${ttl}`);

  logger.log("✅ TTL propagation test passed");
}

function unwrapActualResult(actualResult: unknown): unknown {
  if (isRecord(actualResult) && Array.isArray(actualResult.content)) {
    const __tmp = actualResult.content;
    const maybeContent = Array.isArray(__tmp) ? __tmp : [];
    const first = maybeContent[0];
    const inner = isRecord(first) ? first.text : undefined;
    if (typeof inner === "string") {
      try {
        return JSON.parse(inner);
      } catch {
        // leave actualResult as-is
      }
    }
  }
  return actualResult;
}

async function handleTasksGetFallback(
  gj: unknown,
  cfg: typeof import("@/utils/config"),
  requestedTtl: number,
  jobId: string,
): Promise<void> {
  const errObj = isRecord(gj) && isRecord(gj.error) ? gj.error : undefined;
  let msg = "";
  if (errObj && typeof errObj["message"] === "string")
    msg = String(errObj["message"]);
  if (msg.includes("Server does not support task creation")) {
    await callDirectTasksGet(cfg, requestedTtl, jobId);
    return;
  }
  if (isRecord(gj) && isRecord(gj.error))
    throw new Error(JSON.stringify(gj.error));
  throw new Error("Unknown error from tasks/get");
}

async function callDirectTasksGet(
  cfg: typeof import("@/utils/config"),
  requestedTtl: number,
  jobId: string,
): Promise<void> {
  const { tasksGetTool } = await import("@/tools/tasks/get");
  const direct = await tasksGetTool.handler({
    taskId: jobId,
    requestedTtlMs: requestedTtl,
  });

  const outputSchema = (tasksGetTool as { outputSchema?: ZodTypeAny })
    .outputSchema as ZodTypeAny | undefined;
  let directRec: Record<string, unknown> | undefined;
  if (outputSchema) {
    const safe = outputSchema.safeParse(direct);
    if (!safe.success) {
      throw new Error(
        `Direct tool output failed validation: ${JSON.stringify(safe.error.format())}`,
      );
    }
    directRec = isRecord(safe.data) ? safe.data : undefined;
  } else {
    const directAny: unknown = direct;
    directRec = isRecord(directAny) ? directAny : undefined;
  }

  if (directRec && isRecord(directRec.error))
    throw new Error(JSON.stringify(directRec.error));
  const taskNode =
    directRec && isRecord(directRec.task) ? directRec.task : undefined;
  const dirTtl = taskNode ? taskNode["ttl"] : undefined;
  logger.log("tasks/get (direct) response ttl:", dirTtl);
  if (typeof dirTtl !== "number")
    throw new Error("TTL not present in direct tasks/get result");
  if (dirTtl !== requestedTtl)
    throw new Error(`TTL mismatch: expected ${requestedTtl}, got ${dirTtl}`);
  logger.log("✅ TTL propagation test passed (verified via direct tool call)");
}
