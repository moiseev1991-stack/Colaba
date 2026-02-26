import { NextRequest } from 'next/server';

export const runtime = 'nodejs';

let _originCache: string | null = null;

function getBackendOrigin(): string {
  if (_originCache) return _originCache;

  // 1. File written by entrypoint.sh
  try {
    const content = (require('fs') as typeof import('fs'))
      .readFileSync('/tmp/backend-origin', 'utf8').trim();
    if (content.startsWith('http')) { _originCache = content; return content; }
  } catch {}

  // 2. Env var set by deployment platform
  // eslint-disable-next-line dot-notation
  const env = process.env['INTERNAL_BACKEND_ORIGIN'];
  if (env?.startsWith('http')) { _originCache = env; return env; }

  return 'http://backend:8000';
}

const IS_PRIVATE_IP = /^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|127\.)/;
const IS_IP = /^\d+\.\d+\.\d+\.\d+$/;

async function dnsResolve4(hostname: string): Promise<string | null> {
  if (IS_IP.test(hostname)) return hostname;
  try {
    const dns = require('dns') as typeof import('dns');
    const { promisify } = require('util') as typeof import('util');
    const addrs = await promisify(dns.resolve4)(hostname);
    return addrs?.[0] ?? null;
  } catch { return null; }
}

function rawHttpRequest(
  tcpHost: string,
  tcpPort: number,
  hostHeader: string,
  path: string,
  method: string,
  headers: Record<string, string>,
  body?: Buffer,
): Promise<{ status: number; headers: Record<string, string | string[]>; buffer: Buffer }> {
  const http = require('http') as typeof import('http');
  return new Promise((resolve, reject) => {
    const req = http.request(
      { hostname: tcpHost, port: tcpPort, path, method, headers: { ...headers, host: hostHeader } },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
        res.on('end', () =>
          resolve({ status: res.statusCode ?? 502, headers: res.headers as Record<string, string | string[]>, buffer: Buffer.concat(chunks) }),
        );
        res.on('error', reject);
      },
    );
    req.setTimeout(10000, () => req.destroy(new Error('timeout')));
    req.on('error', reject);
    if (body && body.byteLength > 0) req.write(body);
    req.end();
  });
}

async function proxy(req: NextRequest, pathParts: string[]) {
  const origin = getBackendOrigin();
  const upstreamUrl = new URL(`${origin}/api/v1/${pathParts.join('/')}`);
  upstreamUrl.search = req.nextUrl.search;

  const fwdHeaders = new Headers(req.headers);
  ['host', 'connection', 'content-length', 'expect', 'transfer-encoding'].forEach(h => fwdHeaders.delete(h));
  const headersObj: Record<string, string> = {};
  fwdHeaders.forEach((v, k) => { headersObj[k] = v; });

  const method = req.method.toUpperCase();
  const bodyBuf = (method === 'GET' || method === 'HEAD')
    ? undefined
    : Buffer.from(await req.arrayBuffer());

  const hostname = upstreamUrl.hostname;
  const defaultPort = upstreamUrl.port ? Number(upstreamUrl.port) : 80;
  const path = upstreamUrl.pathname + (upstreamUrl.search || '');

  // #region agent log - hairpin NAT bypass
  // If hostname resolves to a public IP (not RFC1918), this is a hairpin NAT scenario:
  // the container cannot reach the host's public IP from inside Docker.
  // Route via coolify-proxy (Traefik) on the internal coolify network instead,
  // keeping the original hostname as the Host header so Traefik routes correctly.
  let tcpHost = hostname;
  let tcpPort = defaultPort;

  const resolvedIp = IS_IP.test(hostname) ? hostname : await dnsResolve4(hostname);
  const isPublicIp = resolvedIp && !IS_PRIVATE_IP.test(resolvedIp) && !IS_IP.test(hostname);

  if (isPublicIp) {
    const proxyIp = await dnsResolve4('coolify-proxy');
    if (proxyIp) {
      tcpHost = 'coolify-proxy';
      tcpPort = 80;
    }
  }
  // #endregion

  try {
    const upstream = await rawHttpRequest(tcpHost, tcpPort, hostname, path, method, headersObj, bodyBuf);
    const resHeaders = new Headers();
    Object.entries(upstream.headers).forEach(([k, v]) => {
      if (v != null) resHeaders.set(k, Array.isArray(v) ? v.join(', ') : v);
    });
    ['content-encoding', 'transfer-encoding', 'connection'].forEach(h => resHeaders.delete(h));
    return new Response(upstream.buffer, { status: upstream.status, headers: resHeaders });
  } catch (err: unknown) {
    const msg = (err as Error)?.message ?? String(err);

    // #region agent log - diagnostics (keep until login confirmed working on prod)
    const diag: Record<string, unknown> = { resolvedIp, tcpHost, tcpPort, hostHeader: hostname };
    try {
      const dns = require('dns') as typeof import('dns');
      const { promisify } = require('util') as typeof import('util');
      const resolve4 = promisify(dns.resolve4);
      for (const h of ['coolify-proxy', 'backend', 'colaba-backend-1']) {
        diag[`dns_${h}`] = await resolve4(h).catch((e: NodeJS.ErrnoException) => `FAIL:${e.code}`);
      }
    } catch (diagErr) { diag.diagException = String(diagErr); }
    // #endregion

    return new Response(
      JSON.stringify({ detail: `Proxy error: ${msg} | url: ${upstreamUrl} | origin: ${origin} | diag: ${JSON.stringify(diag)}` }),
      { status: 502, headers: { 'content-type': 'application/json' } },
    );
  }
}

export async function GET(req: NextRequest, ctx: { params: { path: string[] } }) { return proxy(req, ctx.params.path || []); }
export async function POST(req: NextRequest, ctx: { params: { path: string[] } }) { return proxy(req, ctx.params.path || []); }
export async function PUT(req: NextRequest, ctx: { params: { path: string[] } }) { return proxy(req, ctx.params.path || []); }
export async function PATCH(req: NextRequest, ctx: { params: { path: string[] } }) { return proxy(req, ctx.params.path || []); }
export async function DELETE(req: NextRequest, ctx: { params: { path: string[] } }) { return proxy(req, ctx.params.path || []); }
export async function OPTIONS(req: NextRequest, ctx: { params: { path: string[] } }) { return proxy(req, ctx.params.path || []); }
