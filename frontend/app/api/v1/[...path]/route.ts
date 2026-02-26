import { NextRequest } from 'next/server';

export const runtime = 'nodejs';

let _originCache: string | null = null;

function getBackendOrigin(): string {
  if (_originCache) return _originCache;

  // 1. File written by entrypoint.sh (IP-based URL resolved at startup,
  //    or pre-configured external URL for Coolify-style deployments)
  try {
    const content = (require('fs') as typeof import('fs'))
      .readFileSync('/tmp/backend-origin', 'utf8').trim();
    if (content.startsWith('http')) {
      _originCache = content;
      return content;
    }
  } catch {}

  // 2. Env var set directly by deployment platform (Coolify, k8s, etc.)
  // eslint-disable-next-line dot-notation
  const env = process.env['INTERNAL_BACKEND_ORIGIN'];
  if (env?.startsWith('http')) {
    _originCache = env;
    return env;
  }

  return 'http://backend:8000';
}

async function proxy(req: NextRequest, pathParts: string[]) {
  const origin = getBackendOrigin();
  const upstreamUrl = new URL(`${origin}/api/v1/${pathParts.join('/')}`);
  upstreamUrl.search = req.nextUrl.search;

  const fwdHeaders = new Headers(req.headers);
  ['host', 'connection', 'content-length', 'expect', 'transfer-encoding'].forEach(h =>
    fwdHeaders.delete(h),
  );

  const method = req.method.toUpperCase();
  const body = method === 'GET' || method === 'HEAD' ? undefined : await req.arrayBuffer();

  try {
    const response = await fetch(upstreamUrl.toString(), {
      method,
      headers: fwdHeaders,
      body: body && body.byteLength > 0 ? body : undefined,
    });

    const resHeaders = new Headers(response.headers);
    ['content-encoding', 'transfer-encoding', 'connection'].forEach(h => resHeaders.delete(h));

    return new Response(await response.arrayBuffer(), {
      status: response.status,
      headers: resHeaders,
    });
  } catch (err: unknown) {
    return new Response(
      JSON.stringify({
        detail: `Proxy error: ${(err as Error)?.message} | url: ${upstreamUrl} | origin: ${origin}`,
      }),
      { status: 502, headers: { 'content-type': 'application/json' } },
    );
  }
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
