const SERVER_BASE =
  process.env.SERVER_API_BASE ||
  process.env.NEXT_PUBLIC_SERVER_API_BASE ||
  "http://localhost:3000";
const SERVER_API_KEY =
  process.env.SERVER_API_KEY || process.env.MCP_API_KEY || "";

async function callServer<T = unknown>(
  path: string,
  body?: unknown,
): Promise<T> {
  const url = `${SERVER_BASE}${path}`;
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (SERVER_API_KEY) headers["x-server-api-key"] = SERVER_API_KEY;

  const res = await fetch(url, {
    method: body ? "POST" : "GET",
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(txt || `server call failed ${res.status}`);
  }

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
