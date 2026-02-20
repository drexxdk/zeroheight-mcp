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

export function normalizeToToolResponse(result: unknown): ToolResponse {
  if (!result) return createSuccessResponse({ data: result });

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
          return { type: "text", text: JSON.stringify(it) };
        },
      );
      return { content: normalized };
    }
  }

  // If it looks like an error object, convert to an error response
  if (isRecord(result) && "error" in result) {
    const err = result.error;
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
