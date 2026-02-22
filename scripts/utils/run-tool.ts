#!/usr/bin/env tsx

import { isRecord, getProp } from "@/utils/common/typeGuards";
import type { ZodTypeAny } from "zod";
import type { ToolResponse } from "@/utils/toolResponses";
import { normalizeToToolResponse } from "@/utils/toolResponses";
import type { KnownModule } from "./toolTypes";

export async function runTool(
  modulePath: KnownModule,
  opts?: { exportName?: string; args?: Record<string, unknown> },
): Promise<unknown> {
  const logger = (await import("@/utils/logger")).default;
  const exportName = (opts?.exportName ?? "default") as string;
  const args = opts?.args;
  const mod = await import(modulePath);
  if (!isRecord(mod)) throw new Error(`Invalid module loaded: ${modulePath}`);
  const toolCandidate = mod[exportName as string];
  if (
    !isRecord(toolCandidate) ||
    typeof getProp(toolCandidate, "handler") !== "function"
  ) {
    throw new Error(`Tool ${exportName} not found in module ${modulePath}`);
  }
  const handler = getProp(toolCandidate, "handler") as (
    a?: unknown,
  ) => Promise<unknown>;
  // Redact sensitive fields (e.g., password) before logging invocation args
  const safeArgs: Record<string, unknown> | undefined = args
    ? { ...args }
    : undefined;
  if (safeArgs && Object.prototype.hasOwnProperty.call(safeArgs, "password")) {
    try {
      safeArgs["password"] = "******";
    } catch {
      // ignore; logging must not throw
    }
  }
  logger.log(
    `Invoking tool ${exportName} from ${modulePath} with args:`,
    safeArgs,
  );
  const raw = await handler(args ?? {});
  // If the tool provides an outputSchema, validate and print structured
  // output. Otherwise fall back to the legacy ToolResponse normalization.
  const outputSchema = getProp(toolCandidate, "outputSchema") as
    | ZodTypeAny
    | undefined;
  if (outputSchema && typeof outputSchema.safeParse === "function") {
    const parsed = outputSchema.safeParse(raw);
    if (!parsed.success) {
      logger.error("Tool output failed validation:", parsed.error.format());
      const res = normalizeToToolResponse(raw);
      logger.log("Normalized ToolResponse:", JSON.stringify(res, null, 2));
      return res;
    }
    logger.log("Structured result:", JSON.stringify(parsed.data, null, 2));
    return parsed.data;
  }

  const res: ToolResponse = normalizeToToolResponse(raw);
  logger.log("Tool response:", JSON.stringify(res, null, 2));
  return res;
}

export default runTool;
