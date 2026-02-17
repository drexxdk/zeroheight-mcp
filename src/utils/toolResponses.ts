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

export function normalizeToToolResponse(result: unknown): ToolResponse {
  if (!result) return createSuccessResponse({ data: result });

  // If it's already a ToolResponse, return as-is
  if (
    typeof result === "object" &&
    result !== null &&
    Array.isArray((result as Record<string, unknown>).content)
  ) {
    return result as ToolResponse;
  }

  // If it looks like an error object, convert to an error response
  if (
    typeof result === "object" &&
    result !== null &&
    "error" in (result as Record<string, unknown>)
  ) {
    const err = (result as Record<string, unknown>).error as unknown;
    const msg =
      typeof err === "string"
        ? err
        : err &&
            typeof err === "object" &&
            "message" in (err as Record<string, unknown>)
          ? String((err as Record<string, unknown>).message)
          : JSON.stringify(err);
    return createErrorResponse({ message: msg });
  }

  // Default: wrap the value as a success response
  return createSuccessResponse({ data: result });
}
