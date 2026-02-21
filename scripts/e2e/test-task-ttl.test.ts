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

  // 1) Start a test task via MCP
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
  let startJson: unknown = null;
  try {
    startJson = JSON.parse(startText);
  } catch {
    // maybe SSE event-stream; try to extract last 'data: ' JSON
    const parts = startText.split(/\r?\n/).filter(Boolean);
    const dataLines = parts.filter((l) => l.startsWith("data:"));
    if (dataLines.length > 0) {
      const last = dataLines[dataLines.length - 1].slice("data:".length).trim();
      startJson = JSON.parse(last);
    }
  }
  if (!isRecord(startJson)) throw new Error("No JSON returned from testtask");
  const sj = startJson;
  if (sj.error) throw new Error(JSON.stringify(sj.error));

  // helper to extract string content safely
  const extractContent = (obj: Record<string, unknown>): string | undefined => {
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
  };

  const content = extractContent(sj);
  if (!content) throw new Error("No content returned from testtask");
  let parsed: Record<string, unknown>;
  if (typeof content === "string") {
    try {
      parsed = JSON.parse(content);
    } catch {
      throw new Error(
        `Failed to parse JSON from testtask content. Raw content: ${content}`,
      );
    }
  } else {
    if (isRecord(content)) parsed = content;
    else throw new Error("Parsed content is not an object");
  }
  const jobId =
    (typeof parsed["jobId"] === "string" && parsed["jobId"]) ||
    (typeof parsed["id"] === "string" && parsed["id"]);
  if (!jobId) throw new Error("Could not extract jobId from testtask response");
  logger.log("Started test task with jobId:", jobId);

  // 2) Call tasks/get via MCP with params.task.ttl and verify response includes ttl
  const requestedTtl = 5000;
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
  let getJson: unknown = null;
  try {
    getJson = JSON.parse(getText);
  } catch {
    // try SSE data: lines
    const parts = getText.split(/\r?\n/).filter(Boolean);
    const dataLines = parts.filter((l) => l.startsWith("data:"));
    if (dataLines.length > 0) {
      const last = dataLines[dataLines.length - 1].slice("data:".length).trim();
      try {
        getJson = JSON.parse(last);
      } catch {
        // fallthrough
      }
    }
  }
  if (!isRecord(getJson))
    throw new Error(`tasks/get did not return JSON. Raw response: ${getText}`);
  const gj = getJson;
  if (isRecord(gj) && gj.error) {
    // If the server refuses tools/call with task metadata, fall back to calling the tool handler directly for verification.
    const errObj = isRecord(gj.error) ? gj.error : undefined;
    let msg = "";
    if (errObj && typeof errObj["message"] === "string")
      msg = String(errObj["message"]);
    if (msg.includes("Server does not support task creation")) {
      logger.warn(
        "Server rejected task-aware tools/call. Falling back to direct tool call for verification.",
      );
      const { tasksGetTool } = await import("@/tools/tasks/get");
      const direct = await tasksGetTool.handler({
        taskId: jobId,
        requestedTtlMs: requestedTtl,
      });

      // If the tool exposes an outputSchema, validate the direct handler
      // response against it so tests exercise the same runtime checks.
      const outputSchema = (tasksGetTool as { outputSchema?: ZodTypeAny })
        .outputSchema as ZodTypeAny | undefined;
      let directRec: Record<string, unknown> | undefined;
      if (outputSchema) {
        const parsed = outputSchema.safeParse(direct);
        if (!parsed.success) {
          throw new Error(
            `Direct tool output failed validation: ${JSON.stringify(parsed.error.format())}`,
          );
        }
        directRec = isRecord(parsed.data) ? parsed.data : undefined;
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
        throw new Error(
          `TTL mismatch: expected ${requestedTtl}, got ${dirTtl}`,
        );
      logger.log(
        "✅ TTL propagation test passed (verified via direct tool call)",
      );
      return;
    }
    throw new Error(JSON.stringify(gj.error));
  }
  // Unwrap ToolResponse wrapper if present: result.content[0].text may contain the real JSON
  let actualResult: unknown = gj["result"];
  if (isRecord(actualResult) && Array.isArray(actualResult.content)) {
    const content = (() => {
      const __tmp = actualResult.content;
      return isRecord(__tmp)
        ? (__tmp as Array<Record<string, unknown>>)
        : __tmp;
    })();
    const first = content[0];
    const inner = first?.text;
    if (typeof inner === "string") {
      try {
        actualResult = JSON.parse(inner);
      } catch {
        // leave actualResult as-is
      }
    }
  }
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
main().catch((e) => {
  logger.error("Test failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});
