// `isRecord` is imported below from the local path; avoid duplicate imports

export type ToolTextContent = { type: "text"; text: string };

export type ToolResponse = {
  content: ToolTextContent[];
};

export function createErrorResponse({
  message,
}: {
  message: string;
}): ToolResponse {
  return { content: [{ type: "text", text: message }] };
}

export function createSuccessResponse<T>({ data }: { data: T }): ToolResponse {
  try {
    const text = JSON.stringify(data, null, 2);
    return { content: [{ type: "text", text }] };
  } catch {
    return { content: [{ type: "text", text: String(data) }] };
  }
}

import { isRecord } from "./common/typeGuards";
import logger from "./logger";

export function normalizeToToolResponse(result: unknown): ToolResponse {
  // Debug: log the raw result we receive from tools to help diagnose why
  // callers sometimes receive a literal "null" text response.
  try {
    logger.debug("normalizeToToolResponse called with", {
      type: typeof result,
      short:
        typeof result === "object" ? JSON.stringify(result) : String(result),
    });
  } catch {
    /* ignore logging errors */
  }

  // Treat explicit `null` or `undefined` results as an error — returning
  // a bare JSON `null` in the tool response is confusing for callers.
  if (result === null || typeof result === "undefined")
    return createErrorResponse({ message: "Tool returned null or undefined" });

  // If it's already a ToolResponse, return as-is
  if (isRecord(result) && Array.isArray(result.content)) {
    const contentCandidate = result.content;
    if (Array.isArray(contentCandidate)) {
      const normalized: ToolTextContent[] = contentCandidate.map(
        (it): ToolTextContent => {
          if (
            isRecord(it) &&
            it.type === "text" &&
            typeof it.text === "string"
          ) {
            return { type: "text", text: it.text };
          }
          return { type: "text", text: JSON.stringify(it, null, 2) };
        },
      );
      return { content: normalized };
    }
  }

  // If it looks like an error object and the `error` field is present and
  // non-null/undefined, convert to an error response. Ignore `error: null`
  // which is commonly used on task records to indicate no error.
  if (isRecord(result) && "error" in result && result.error != null) {
    const err = result.error as unknown;
    let msg: string;
    if (typeof err === "string") msg = err;
    else if (isRecord(err) && typeof err.message === "string")
      msg = err.message;
    else msg = JSON.stringify(err);
    return createErrorResponse({ message: msg });
  }

  // Default: wrap the value as a success response
  return createSuccessResponse({ data: result });
}
