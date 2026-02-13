#!/usr/bin/env tsx
// lightweight safe MCP caller; no readline needed

async function promptHidden(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    const stdout = process.stdout;
    stdout.write(prompt);
    stdin.setRawMode?.(true);
    let value = "";
    function onData(chunk: Buffer) {
      const ch = chunk.toString("utf8");
      if (ch === "\r" || ch === "\n" || ch === "\u0004") {
        stdin.off("data", onData);
        stdin.setRawMode?.(false);
        stdout.write("\n");
        resolve(value);
        return;
      }
      if (ch === "\u0003") {
        process.exit(1);
      }
      value += ch;
    }
    stdin.on("data", onData);
  });
}

async function run() {
  const [, , toolName, rawArgs] = process.argv;
  if (!toolName) {
    console.error(
      "Usage: tsx scripts/mcp-call-safe.ts <tool-name> [json-args]",
    );
    process.exit(1);
  }

  const envKey = process.env.MCP_API_KEY;
  const key =
    envKey || (await promptHidden("Enter MCP API key (input hidden): "));

  let args: Record<string, unknown> = {};
  if (rawArgs) {
    try {
      args = JSON.parse(rawArgs) as Record<string, unknown>;
    } catch (e) {
      console.error("Invalid JSON for args:", e);
      process.exit(1);
    }
  }

  let body: Record<string, unknown>;
  if (toolName === "list" || toolName === "tools/list") {
    body = { jsonrpc: "2.0", id: Date.now(), method: "tools/list", params: {} };
  } else {
    body = {
      jsonrpc: "2.0",
      id: Date.now(),
      method: "tools/call",
      params: { name: toolName, arguments: args },
    };
  }

  try {
    const res = await fetch("http://localhost:3000/api/mcp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        Authorization: "Bearer " + key,
      },
      body: JSON.stringify(body),
    });

    const text = await res.text();
    console.log(text);
  } catch (e) {
    console.error("Request failed", e);
    process.exit(1);
  }
}

run();
