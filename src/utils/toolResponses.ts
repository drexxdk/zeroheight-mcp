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
