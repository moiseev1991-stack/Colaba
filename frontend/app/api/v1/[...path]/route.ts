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

  // Fail fast: if backend unreachable, return 502 within 10s instead of hanging forever
  const abort = AbortSignal.timeout(10000);

  try {
    const response = await fetch(upstreamUrl.toString(), {
      method,
      headers: fwdHeaders,
      body: body && body.byteLength > 0 ? body : undefined,
      signal: abort,
    });

    const resHeaders = new Headers(response.headers);
    ['content-encoding', 'transfer-encoding', 'connection'].forEach(h => resHeaders.delete(h));

    return new Response(await response.arrayBuffer(), {
      status: response.status,
      headers: resHeaders,
    });
  } catch (err: unknown) {
    const msg = (err as Error)?.message ?? String(err);

    // #region agent log - DNS diagnostics (runs after fetch failure to identify root cause)
    const diag: Record<string, unknown> = {};
    try {
      const dns = require('dns') as typeof import('dns');
      const { promisify } = require('util') as typeof import('util');
      const resolve4 = promisify(dns.resolve4);

      const originHostname = new URL(origin).hostname;
      diag.originHostname = originHostname;

      // H-A/H-B: does the sslip.io hostname resolve via DNS from inside the container?
      diag.dnsResolve = await resolve4(originHostname).catch((e: NodeJS.ErrnoException) => `FAIL:${e.code}`);

      // H-D: does the first segment (Coolify UUID) resolve as an internal hostname?
      const internalHost = originHostname.split('.')[0];
      diag.internalHost = internalHost;
      diag.internalDnsResolve = await resolve4(internalHost).catch((e: NodeJS.ErrnoException) => `FAIL:${e.code}`);
    } catch (diagErr) {
      diag.diagException = String(diagErr);
    }
    // #endregion

    const hint = origin === 'http://backend:8000'
      ? ' | HINT: set INTERNAL_BACKEND_ORIGIN in Coolify env vars'
      : '';
    return new Response(
      JSON.stringify({ detail: `Proxy error: ${msg} | url: ${upstreamUrl} | origin: ${origin}${hint} | diag: ${JSON.stringify(diag)}` }),
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
