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

export function createSuccessResponse({
  data,
}: {
  data: unknown;
}): ToolResponse {
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
    return result as ToolResponse;
  }

  // If it looks like an error object, convert to an error response
  if (isRecord(result) && "error" in result) {
    const err = result.error as unknown;
    const msg =
      typeof err === "string"
        ? err
        : isRecord(err) && "message" in err
          ? String(err.message)
          : JSON.stringify(err);
    return createErrorResponse({ message: msg });
  }

  // Default: wrap the value as a success response
  return createSuccessResponse({ data: result });
}
