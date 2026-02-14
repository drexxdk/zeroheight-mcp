const SERVER_BASE =
  process.env.SERVER_API_BASE ||
  process.env.NEXT_PUBLIC_SERVER_API_BASE ||
  "http://localhost:3000";

async function callServer<T = unknown>(
  path: string,
  body?: unknown,
): Promise<T> {
  const url = `${SERVER_BASE}${path}`;
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  const key = process.env.SERVER_API_KEY || process.env.MCP_API_KEY || "";
  if (key) headers["x-server-api-key"] = key;

  const res = await fetch(url, {
    method: body ? "POST" : "GET",
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    console.error(
      `serverApi.callServer error for ${path}: status=${res.status} body=${txt}`,
    );
    throw new Error(txt || `server call failed ${res.status}`);
  }

  if (res.status === 204) return null as unknown as T;

  const json = await res.json().catch(() => ({}));
  return json as T;
}

export async function createJobInDb(payload: Record<string, unknown>) {
  return await callServer<Record<string, unknown>>("/api/jobs", payload);
}

export async function uploadFileToServer(
  bucket: string,
  filename: string,
  base64: string,
  contentType = "application/octet-stream",
) {
  return await callServer<{ path: string }>("/api/jobs/upload", {
    bucket,
    filename,
    base64,
    contentType,
  });
}

export async function markJobCancelled(jobId: string) {
  return await callServer<Record<string, unknown>>(
    `/api/jobs/${jobId}/cancel`,
    {},
  );
}

const serverApi = {
  callServer,
  createJobInDb,
  uploadFileToServer,
  markJobCancelled,
};

export default serverApi;
