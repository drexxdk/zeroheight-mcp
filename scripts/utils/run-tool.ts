#!/usr/bin/env tsx

import { isRecord, getProp } from "@/utils/common/typeGuards";
import type { ZodTypeAny } from "zod";
import type { ToolResponse } from "@/utils/toolResponses";
import { normalizeToToolResponse } from "@/utils/toolResponses";
import type { KnownModule } from "./toolTypes";
import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";

export async function runTool(
  modulePath: KnownModule,
  opts?: { exportName?: string; args?: Record<string, unknown> },
): Promise<unknown> {
  const logger = (await import("@/utils/logger")).default;
  const exportName = (opts?.exportName ?? "default") as string;
  const args = opts?.args;
  let mod: unknown;
  // Support project-local alias imports like "@/tools/xyz" when running
  // scripts outside of the Next/tsconfig resolver by resolving to the
  // local `src/` files. Try common extensions (.ts, .tsx, .js).
  if (typeof modulePath === "string" && modulePath.startsWith("@/")) {
    const rel = modulePath.slice(2); // e.g. "tools/api-scraper/api-scraper"
    const base = path.join(process.cwd(), "src", rel);
    const candidates = [
      `${base}.ts`,
      `${base}.tsx`,
      `${base}.js`,
      path.join(base, "index.ts"),
      path.join(base, "index.tsx"),
      path.join(base, "index.js"),
    ];
    // Also try variant where final path segment dashes are replaced with dots
    // to support files named like `api-scraper.tsx`.
    try {
      const parts = rel.split("/");
      const last = parts.pop() ?? "";
      const altLast = last.replace(/-/g, ".");
      if (altLast && altLast !== last) {
        const altRel = parts.concat(altLast).join("/");
        const altBase = path.join(process.cwd(), "src", altRel);
        candidates.push(`${altBase}.ts`, `${altBase}.tsx`, `${altBase}.js`);
        candidates.push(
          path.join(altBase, "index.ts"),
          path.join(altBase, "index.tsx"),
          path.join(altBase, "index.js"),
        );
      }
    } catch {
      // ignore any errors constructing alt candidates
    }
    let found: string | null = null;
    for (const c of candidates) {
      try {
        if (fs.existsSync(c)) {
          found = c;
          break;
        }
      } catch {
        // ignore
      }
    }
    if (!found) {
      throw new Error(`Cannot resolve module path ${modulePath} to src/ file`);
    }
    mod = await import(pathToFileURL(found).href);
  } else {
    mod = await import(modulePath as string);
  }
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
