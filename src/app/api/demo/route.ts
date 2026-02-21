import { z } from "zod";
import { parseAndValidateJson } from "@/utils/server/apiHelpers";

const DemoSchema = z.object({ message: z.string() });

export async function POST(request: Request): Promise<Response> {
  const res = await parseAndValidateJson(request, DemoSchema);
  if (!res.ok) {
    return new Response(JSON.stringify({ error: res.error }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ ok: true, data: res.data }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
