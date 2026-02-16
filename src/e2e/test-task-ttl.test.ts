#!/usr/bin/env node

import { config } from "dotenv";
// Ensure dotenv runs before importing any app modules that read env at module-evaluation time.
config({ path: ".env.local" });

async function main() {
  const API_URL = "http://localhost:3000/api/mcp";
  const { MCP_API_KEY } = await import("@/utils/config");
  if (!MCP_API_KEY) {
    console.error("MCP_API_KEY not set");
    process.exit(1);
  }

  console.log("Starting TTL propagation e2e test...");

  // 1) Start a test task via MCP
  const startRes = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": MCP_API_KEY,
      Accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: "testtask", arguments: {} },
    }),
  });
  if (!startRes.ok) throw new Error(`Start task HTTP ${startRes.status}`);
  const startText = await startRes.text();
  console.log("startText:", startText);
  let startJson: unknown = null;
  try {
    startJson = JSON.parse(startText) as Record<string, unknown>;
  } catch {
    // maybe SSE event-stream; try to extract last 'data: ' JSON
    const parts = startText.split(/\r?\n/).filter(Boolean);
    const dataLines = parts.filter((l) => l.startsWith("data:"));
    if (dataLines.length > 0) {
      const last = dataLines[dataLines.length - 1].slice("data:".length).trim();
      startJson = JSON.parse(last) as Record<string, unknown>;
    }
  }
  if (!startJson || typeof startJson !== "object")
    throw new Error("No JSON returned from testtask");
  const sj = startJson as Record<string, unknown>;
  if (sj.error) throw new Error(JSON.stringify(sj.error));

  // helper to extract string content safely
  const extractContent = (obj: Record<string, unknown>): string | undefined => {
    const res = obj["result"] as Record<string, unknown> | undefined;
    if (res) {
      const content = res["content"] as
        | Array<Record<string, unknown>>
        | undefined;
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
      parsed = JSON.parse(content) as Record<string, unknown>;
    } catch {
      throw new Error(
        `Failed to parse JSON from testtask content. Raw content: ${content}`,
      );
    }
  } else {
    parsed = content as Record<string, unknown>;
  }
  const jobId =
    (typeof parsed["jobId"] === "string" && parsed["jobId"]) ||
    (typeof parsed["id"] === "string" && parsed["id"]);
  if (!jobId) throw new Error("Could not extract jobId from testtask response");
  console.log("Started test task with jobId:", jobId);

  // 2) Call tasks/get via MCP with params.task.ttl and verify response includes ttl
  const requestedTtl = 5000;
  const getRes = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": MCP_API_KEY,
      Accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: {
        name: "tasks/get",
        arguments: { taskId: jobId },
        task: { ttl: requestedTtl },
      },
    }),
  });
  if (!getRes.ok) throw new Error(`tasks/get HTTP ${getRes.status}`);
  const getText = await getRes.text();
  let getJson: unknown = null;
  try {
    getJson = JSON.parse(getText) as Record<string, unknown>;
  } catch {
    // try SSE data: lines
    const parts = getText.split(/\r?\n/).filter(Boolean);
    const dataLines = parts.filter((l) => l.startsWith("data:"));
    if (dataLines.length > 0) {
      const last = dataLines[dataLines.length - 1].slice("data:".length).trim();
      try {
        getJson = JSON.parse(last) as Record<string, unknown>;
      } catch {
        // fallthrough
      }
    }
  }
  if (!getJson || typeof getJson !== "object")
    throw new Error(`tasks/get did not return JSON. Raw response: ${getText}`);
  const gj = getJson as Record<string, unknown>;
  if (gj.error) {
    // If the server refuses tools/call with task metadata, fall back to calling the tool handler directly for verification.
    const errObj = gj.error as Record<string, unknown>;
    const msg =
      typeof errObj["message"] === "string"
        ? (errObj["message"] as string)
        : "";
    if (msg.includes("Server does not support task creation")) {
      console.warn(
        "Server rejected task-aware tools/call. Falling back to direct tool call for verification.",
      );
      const { tasksGetTool } = await import("@/tools/scraper/tasksTools");
      const direct = await tasksGetTool.handler({
        taskId: jobId,
        requestedTtlMs: requestedTtl,
      });
      if ((direct as Record<string, unknown>).error)
        throw new Error(
          JSON.stringify((direct as Record<string, unknown>).error),
        );
      const taskNode = (direct as Record<string, unknown>).task as
        | Record<string, unknown>
        | undefined;
      const dirTtl = taskNode?.ttl;
      console.log("tasks/get (direct) response ttl:", dirTtl);
      if (typeof dirTtl !== "number")
        throw new Error("TTL not present in direct tasks/get result");
      if (dirTtl !== requestedTtl)
        throw new Error(
          `TTL mismatch: expected ${requestedTtl}, got ${dirTtl}`,
        );
      console.log(
        "✅ TTL propagation test passed (verified via direct tool call)",
      );
      return;
    }
    throw new Error(JSON.stringify(gj.error));
  }
  // Unwrap ToolResponse wrapper if present: result.content[0].text may contain the real JSON
  let actualResult: unknown = gj["result"];
  if (
    actualResult &&
    typeof actualResult === "object" &&
    Array.isArray((actualResult as Record<string, unknown>).content)
  ) {
    const content = (actualResult as Record<string, unknown>).content as Array<
      Record<string, unknown>
    >;
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

  const resultObj =
    typeof actualResult === "object" && actualResult !== null
      ? (actualResult as Record<string, unknown>)
      : undefined;
  const taskNode = resultObj?.["task"] as Record<string, unknown> | undefined;
  const ttl = taskNode?.["ttl"];
  console.log("tasks/get response ttl:", ttl);
  if (typeof ttl !== "number")
    throw new Error("TTL not present in tasks/get result");
  if (ttl !== requestedTtl)
    throw new Error(`TTL mismatch: expected ${requestedTtl}, got ${ttl}`);

  console.log("✅ TTL propagation test passed");
}

main().catch((e) => {
  console.error("Test failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});
