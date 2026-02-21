/// <reference types="vitest/globals" />
import { POST } from "../route";

function makeRequest(body?: Record<string, unknown>): Request {
  const init: RequestInit = {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  };
  return new Request("http://localhost/api/demo", init);
}

describe("/api/demo POST", () => {
  test("responds 200 for valid payload", async () => {
    const req = makeRequest({ message: "hello" });
    const resp = await POST(req);
    expect(resp.status).toBe(200);
    const j = JSON.parse(await resp.text());
    expect(j.ok).toBe(true);
    expect(j.data.message).toBe("hello");
  });

  test("responds 400 for invalid payload", async () => {
    const req = makeRequest({ msg: "oops" });
    const resp = await POST(req);
    expect(resp.status).toBe(400);
    const j = JSON.parse(await resp.text());
    expect(j.error).toBeTruthy();
  });
});
