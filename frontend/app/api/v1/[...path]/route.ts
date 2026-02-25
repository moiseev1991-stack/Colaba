import { NextRequest } from 'next/server';

export const runtime = 'nodejs';

// Webpack inlines process.env.VARIABLE at build-time, making runtime env changes
// invisible. It may also stub node built-ins in server bundles.
// __non_webpack_require__ is webpack's official escape hatch: it compiles to the
// native Node.js require(), bypassing all webpack module transformations.
declare const __non_webpack_require__: (id: string) => unknown;
const nreq =
  (typeof __non_webpack_require__ === 'function' ? __non_webpack_require__ : require) as (id: string) => unknown;

const nfs    = nreq('node:fs')    as typeof import('node:fs');
const nhttp  = nreq('node:http')  as typeof import('node:http');
const nhttps = nreq('node:https') as typeof import('node:https');

// Cache after first successful resolution to avoid file I/O on every request.
let _originCache: string | null = null;

// #region agent log - diagnostics
function collectDiag(): Record<string, unknown> {
  const d: Record<string, unknown> = {};
  d.hasNWR = typeof __non_webpack_require__ === 'function';
  d.nfsReadFileSyncType = typeof nfs?.readFileSync;
  try {
    d.fileRaw = nfs.readFileSync('/tmp/backend-origin', 'utf8');
  } catch (e) { d.fileErr = (e as Error).message; }
  // Computed key prevents webpack from inlining at build time
  const k = ['INTERNAL', 'BACKEND', 'ORIGIN'].join('_');
  d.envVal = (process.env as Record<string, string | undefined>)[k];
  d.envValDirect = (process.env as Record<string, string | undefined>)['INTERNAL_BACKEND_ORIGIN'];
  d.cache = _originCache;
  return d;
}
// #endregion

function getBackendOrigin(): string {
  if (_originCache) return _originCache;

  // 1. Read the IP written by entrypoint.sh before Next.js started.
  //    Exclude values containing 'backend' to avoid caching the hostname fallback.
  try {
    const v = nfs.readFileSync('/tmp/backend-origin', 'utf8').trim();
    if (v && v.startsWith('http://') && !v.includes('backend')) {
      _originCache = v;
      return v;
    }
  } catch {}

  // 2. Dynamic key prevents webpack from inlining this at build time.
  //    PID-1 (next start) inherits INTERNAL_BACKEND_ORIGIN=http://<IP>:8000 from entrypoint.sh.
  //    Exclude values containing 'backend' to avoid using the docker-compose hostname value.
  const k = ['INTERNAL', 'BACKEND', 'ORIGIN'].join('_');
  const fromEnv = (process.env as Record<string, string | undefined>)[k];
  if (fromEnv && fromEnv.startsWith('http://') && !fromEnv.includes('backend')) {
    _originCache = fromEnv;
    return fromEnv;
  }

  return 'http://backend:8000';
}

async function httpProxyRequest(
  url: URL,
  method: string,
  headers: Headers,
  body: ArrayBuffer | undefined,
): Promise<{ status: number; headers: Headers; buffer: Buffer }> {
  const port = url.port ? Number(url.port) : url.protocol === 'https:' ? 443 : 80;
  const reqHeaders: Record<string, string> = {};
  headers.forEach((v, k) => { reqHeaders[k] = v; });

  return new Promise((resolve, reject) => {
    const options: import('node:http').RequestOptions = {
      hostname: url.hostname,
      port,
      path: url.pathname + (url.search || ''),
      method,
      headers: reqHeaders,
    };

    const client = url.protocol === 'https:' ? nhttps : nhttp;
    const req = (client as typeof import('node:http')).request(
      options,
      (res: import('node:http').IncomingMessage) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) =>
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)),
        );
        res.on('end', () => {
          const resHeaders = new Headers();
          Object.entries(res.headers).forEach(([k, v]) => {
            if (v != null) resHeaders.set(k, Array.isArray(v) ? v.join(', ') : v);
          });
          resolve({
            status: res.statusCode ?? 502,
            headers: resHeaders,
            buffer: Buffer.concat(chunks),
          });
        });
        res.on('error', reject);
      },
    );
    req.on('error', reject);
    if (body && body.byteLength > 0) req.write(Buffer.from(body));
    req.end();
  });
}

async function proxy(req: NextRequest, pathParts: string[]) {
  const origin = getBackendOrigin();
  const upstreamUrl = new URL(`${origin}/api/v1/${pathParts.join('/')}`);
  upstreamUrl.search = req.nextUrl.search;

  const headers = new Headers(req.headers);
  headers.delete('host');
  headers.delete('connection');
  headers.delete('content-length');
  headers.delete('expect');

  const method = req.method.toUpperCase();
  const body = method === 'GET' || method === 'HEAD' ? undefined : await req.arrayBuffer();

  try {
    const upstream = await httpProxyRequest(upstreamUrl, method, headers, body);
    upstream.headers.delete('content-encoding');
    upstream.headers.delete('transfer-encoding');
    upstream.headers.delete('connection');
    return new Response(upstream.buffer, {
      status: upstream.status,
      headers: upstream.headers,
    });
  } catch (err: unknown) {
    // #region agent log - embed diagnostics in 502 to understand root cause
    const diag = collectDiag();
    const detail = `Proxy error: ${(err as Error)?.message} | url: ${upstreamUrl.toString()} | origin: ${origin} | diag: ${JSON.stringify(diag)}`;
    // #endregion
    return new Response(JSON.stringify({ detail }), {
      status: 502,
      headers: { 'content-type': 'application/json' },
    });
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
