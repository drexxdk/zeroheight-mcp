import { NextRequest } from "next/server";

async function respondOK() {
  return new Response(JSON.stringify({}), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

export async function GET(_req: NextRequest) {
  return respondOK();
}

export async function POST(_req: NextRequest) {
  return respondOK();
}

export async function OPTIONS(_req: NextRequest) {
  return respondOK();
}

export async function HEAD(_req: NextRequest) {
  return respondOK();
}
