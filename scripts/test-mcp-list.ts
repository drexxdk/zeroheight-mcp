export {};

async function main() {
  // dynamically import config so env is loaded and TS path aliases resolve
  const cfg = await import("@/utils/config");
  const url: string = cfg.MCP_URL;
  const key: string = cfg.MCP_API_KEY;

  if (!url) throw new Error("MCP_URL is not configured");
  if (!key) throw new Error("MCP_API_KEY is not configured");

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${key}`,
      "X-API-Key": key,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "tools/list",
      params: {},
      id: 1,
    }),
  });

  const text = await res.text();
  console.log("STATUS", res.status);
  console.log("HEADERS", Object.fromEntries(res.headers.entries()));
  console.log(text);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
