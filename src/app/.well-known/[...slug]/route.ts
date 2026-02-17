// no request object needed for well-known responses

async function respondOK() {
  return new Response(JSON.stringify({}), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

export async function GET() {
  return respondOK();
}

export async function POST() {
  return respondOK();
}

export async function OPTIONS() {
  return respondOK();
}

export async function HEAD() {
  return respondOK();
}
