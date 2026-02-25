import { NextRequest } from 'next/server';

export const runtime = 'nodejs';

const BACKEND_ORIGIN = process.env.INTERNAL_BACKEND_ORIGIN || 'http://backend:8000';

async function proxy(req: NextRequest, pathParts: string[]) {
  const upstreamUrl = new URL(`${BACKEND_ORIGIN}/api/v1/${pathParts.join('/')}`);
  upstreamUrl.search = req.nextUrl.search;

  // #region agent log
  console.error('[DEBUG-PROXY] INTERNAL_BACKEND_ORIGIN env:', process.env.INTERNAL_BACKEND_ORIGIN, '| resolved BACKEND_ORIGIN:', BACKEND_ORIGIN, '| upstreamUrl:', upstreamUrl.toString(), '| hypothesisId: H-A,H-C');
  // #endregion

  const headers = new Headers(req.headers);
  // Avoid leaking hop-by-hop / invalid headers to upstream
  headers.delete('host');
  headers.delete('connection');
  headers.delete('content-length');

  const method = req.method.toUpperCase();
  const body =
    method === 'GET' || method === 'HEAD' ? undefined : await req.arrayBuffer();

  let upstreamRes: Response;
  try {
    upstreamRes = await fetch(upstreamUrl, {
      method,
      headers,
      body,
      redirect: 'manual',
    });
    // #region agent log
    console.error('[DEBUG-PROXY] fetch success | status:', upstreamRes.status, '| upstreamUrl:', upstreamUrl.toString(), '| hypothesisId: H-C');
    // #endregion
  } catch (fetchErr: any) {
    // #region agent log
    console.error('[DEBUG-PROXY] fetch ERROR | upstreamUrl:', upstreamUrl.toString(), '| error:', fetchErr?.message, fetchErr?.cause, '| hypothesisId: H-A,H-C');
    // #endregion
    return new Response(JSON.stringify({ detail: `Proxy upstream error: ${fetchErr?.message}` }), {
      status: 502,
      headers: { 'content-type': 'application/json', 'x-debug-upstream': upstreamUrl.toString() },
    });
  }

  const resHeaders = new Headers(upstreamRes.headers);
  resHeaders.delete('content-encoding');
  resHeaders.delete('content-length');
  resHeaders.delete('transfer-encoding');
  resHeaders.delete('connection');
  // #region agent log
  resHeaders.set('x-debug-upstream', upstreamUrl.toString());
  // #endregion

  return new Response(await upstreamRes.arrayBuffer(), {
    status: upstreamRes.status,
    headers: resHeaders,
  });
}

export async function GET(req: NextRequest, ctx: { params: { path: string[] } }) {
  return proxy(req, ctx.params.path || []);
}

export async function POST(req: NextRequest, ctx: { params: { path: string[] } }) {
  return proxy(req, ctx.params.path || []);
}

export async function PUT(req: NextRequest, ctx: { params: { path: string[] } }) {
  return proxy(req, ctx.params.path || []);
}

export async function PATCH(req: NextRequest, ctx: { params: { path: string[] } }) {
  return proxy(req, ctx.params.path || []);
}

export async function DELETE(req: NextRequest, ctx: { params: { path: string[] } }) {
  return proxy(req, ctx.params.path || []);
}

export async function OPTIONS(req: NextRequest, ctx: { params: { path: string[] } }) {
  return proxy(req, ctx.params.path || []);
}

