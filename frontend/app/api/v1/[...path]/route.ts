import { NextRequest } from 'next/server';

export const runtime = 'nodejs';

// webpack replaces process.env.VARIABLE and stubs some node built-ins at build time.
// These helpers use patterns that webpack cannot statically analyze or replace.
function readEnv(key: string): string | undefined {
  return (process.env as Record<string, string | undefined>)[key];
}

function readFileSafe(path: string): string | null {
  try {
    return (require('fs') as typeof import('fs')).readFileSync(path, 'utf8').trim();
  } catch {
    return null;
  }
}

// child_process.execSync launches a real OS subprocess - webpack cannot stub or
// intercept it. Used as the most reliable fallback to read /tmp/backend-origin.
function readFileViaShell(path: string): string | null {
  try {
    const { execSync } = require('child_process') as typeof import('child_process');
    return execSync(`cat ${path}`, { encoding: 'utf8', timeout: 2000 }).trim();
  } catch {
    return null;
  }
}

// Cache after first successful resolution.
let _originCache: string | null = null;

function getBackendOrigin(): string {
  if (_originCache) return _originCache;

  // Try each method in order, skip values containing 'backend' (hostname, not IP).

  // 1. Direct fs read (fast, works if fs is not stubbed)
  const fromFile = readFileSafe('/tmp/backend-origin');
  if (fromFile && fromFile.startsWith('http://') && !fromFile.includes('backend')) {
    _originCache = fromFile;
    return fromFile;
  }

  // 2. child_process fallback — guaranteed to use real OS, bypasses all webpack stubbing
  const fromShell = readFileViaShell('/tmp/backend-origin');
  if (fromShell && fromShell.startsWith('http://') && !fromShell.includes('backend')) {
    _originCache = fromShell;
    return fromShell;
  }

  // 3. Runtime env var (works if process.env is the real object, not webpack snapshot)
  const fromEnv = readEnv('INTERNAL_BACKEND_ORIGIN');
  if (fromEnv && fromEnv.startsWith('http://') && !fromEnv.includes('backend')) {
    _originCache = fromEnv;
    return fromEnv;
  }

  return 'http://backend:8000';
}

// #region agent log - diagnostics (keep until login confirmed working)
function collectDiag(): Record<string, unknown> {
  const d: Record<string, unknown> = {};
  d.fileRaw = readFileSafe('/tmp/backend-origin');
  d.shellResult = readFileViaShell('/tmp/backend-origin');
  d.envVal = readEnv('INTERNAL_BACKEND_ORIGIN');
  d.envCount = Object.keys(process.env).length;
  d.cache = _originCache;
  try {
    const { execSync } = require('child_process') as typeof import('child_process');
    d.procEnvHasKey = execSync('cat /proc/self/environ', { encoding: 'utf8' })
      .includes('INTERNAL_BACKEND_ORIGIN');
  } catch (e) {
    d.procEnvErr = (e as Error).message?.substring(0, 80);
  }
  return d;
}
// #endregion

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
    const http  = require('http')  as typeof import('http');
    const https = require('https') as typeof import('https');

    const options: import('http').RequestOptions = {
      hostname: url.hostname,
      port,
      path: url.pathname + (url.search || ''),
      method,
      headers: reqHeaders,
    };

    const client = url.protocol === 'https:' ? https : http;
    const req = client.request(options, (res: import('http').IncomingMessage) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) =>
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)),
      );
      res.on('end', () => {
        const resHeaders = new Headers();
        Object.entries(res.headers).forEach(([k, v]) => {
          if (v != null) resHeaders.set(k, Array.isArray(v) ? v.join(', ') : v);
        });
        resolve({ status: res.statusCode ?? 502, headers: resHeaders, buffer: Buffer.concat(chunks) });
      });
      res.on('error', reject);
    });
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
    return new Response(upstream.buffer, { status: upstream.status, headers: upstream.headers });
  } catch (err: unknown) {
    // #region agent log - diagnostics
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
