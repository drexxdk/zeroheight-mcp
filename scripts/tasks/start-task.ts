#!/usr/bin/env tsx

import { config } from "dotenv";
import { isRecord, getProp } from "@/utils/common/typeGuards";
import type { ZodTypeAny } from "zod";
import logger from "../../src/utils/logger";
import type { ToolResponse } from "@/utils/toolResponses";
import { normalizeToToolResponse } from "@/utils/toolResponses";
config({ path: ".env.local" });

export async function runTool(
  modulePath: string,
  exportName: string,
  args?: Record<string, unknown> | undefined,
): Promise<unknown> {
  const mod = await import(modulePath);
  if (!isRecord(mod)) throw new Error(`Invalid module loaded: ${modulePath}`);
  const toolCandidate = mod[exportName];
  if (
    !isRecord(toolCandidate) ||
    typeof getProp(toolCandidate, "handler") !== "function"
  ) {
    throw new Error(`Tool ${exportName} not found in module ${modulePath}`);
  }
  const handler = getProp(toolCandidate, "handler") as (
    a?: unknown,
  ) => Promise<unknown>;
  logger.log(`Invoking tool ${exportName} from ${modulePath} with args:`, args);
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
