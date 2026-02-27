import { NextRequest } from 'next/server';

export const runtime = 'nodejs';

const ACCESS_COOKIE = 'access_token';
const REFRESH_COOKIE = 'refresh_token';

// Auth endpoints whose responses contain tokens that must be set as httpOnly cookies
const AUTH_TOKEN_PATHS = ['auth/login', 'auth/register', 'auth/refresh'];
// Auth endpoints that use refresh_token from cookie as request body
const REFRESH_PATH = 'auth/refresh';

let _originCache: string | null = null;

function getBackendOrigin(): string {
  if (_originCache) return _originCache;
  try {
    const content = (require('fs') as typeof import('fs'))
      .readFileSync('/tmp/backend-origin', 'utf8').trim();
    if (content.startsWith('http')) { _originCache = content; return content; }
  } catch {}
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
    req.setTimeout(30000, () => req.destroy(new Error('timeout')));
    req.on('error', reject);
    if (body && body.byteLength > 0) req.write(body);
    req.end();
  });
}

function cookieOptions(days: number): string {
  const maxAge = days * 24 * 60 * 60;
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

async function proxy(req: NextRequest, pathParts: string[]): Promise<Response> {
  const origin = getBackendOrigin();
  const apiPath = pathParts.join('/');
  const upstreamUrl = new URL(`${origin}/api/v1/${apiPath}`);
  upstreamUrl.search = req.nextUrl.search;

  const fwdHeaders = new Headers(req.headers);
  ['host', 'connection', 'content-length', 'expect', 'transfer-encoding'].forEach(h => fwdHeaders.delete(h));

  // Inject Authorization header from httpOnly cookie (server-side — JS never touches the token)
  const isAuthTokenEndpoint = AUTH_TOKEN_PATHS.some(p => apiPath.startsWith(p));
  if (!isAuthTokenEndpoint) {
    const accessToken = req.cookies.get(ACCESS_COOKIE)?.value;
    if (accessToken) {
      fwdHeaders.set('authorization', `Bearer ${accessToken}`);
    }
  }

  const headersObj: Record<string, string> = {};
  fwdHeaders.forEach((v, k) => { headersObj[k] = v; });

  const method = req.method.toUpperCase();
  let bodyBuf = (method === 'GET' || method === 'HEAD')
    ? undefined
    : Buffer.from(await req.arrayBuffer());

  // For refresh endpoint: inject refresh_token from httpOnly cookie into request body
  if (apiPath.startsWith(REFRESH_PATH) && method === 'POST') {
    const refreshToken = req.cookies.get(REFRESH_COOKIE)?.value;
    if (refreshToken) {
      const payload = JSON.stringify({ refresh_token: refreshToken });
      bodyBuf = Buffer.from(payload);
      headersObj['content-type'] = 'application/json';
      headersObj['content-length'] = String(bodyBuf.length);
    }
  }

  const hostname = upstreamUrl.hostname;
  const defaultPort = upstreamUrl.port ? Number(upstreamUrl.port) : 80;
  const path = upstreamUrl.pathname + (upstreamUrl.search || '');

  // Hairpin NAT bypass for Coolify: route through coolify-proxy if public IP
  let tcpHost = hostname;
  let tcpPort = defaultPort;
  const resolvedIp = IS_IP.test(hostname) ? hostname : await dnsResolve4(hostname);
  const isPublicIp = resolvedIp && !IS_PRIVATE_IP.test(resolvedIp) && !IS_IP.test(hostname);
  if (isPublicIp) {
    const proxyIp = await dnsResolve4('coolify-proxy');
    if (proxyIp) { tcpHost = 'coolify-proxy'; tcpPort = 80; }
  }

  try {
    const upstream = await rawHttpRequest(tcpHost, tcpPort, hostname, path, method, headersObj, bodyBuf);
    const resHeaders = new Headers();
    Object.entries(upstream.headers).forEach(([k, v]) => {
      if (v != null) resHeaders.set(k, Array.isArray(v) ? v.join(', ') : v);
    });
    ['content-encoding', 'transfer-encoding', 'connection'].forEach(h => resHeaders.delete(h));

    // For auth token endpoints: if backend returns tokens, set httpOnly cookies server-side
    if (isAuthTokenEndpoint && upstream.status >= 200 && upstream.status < 300) {
      try {
        const body = JSON.parse(upstream.buffer.toString('utf8'));
        if (body?.access_token) {
          resHeaders.append('Set-Cookie', `${ACCESS_COOKIE}=${body.access_token}; ${cookieOptions(30)}`);
        }
        if (body?.refresh_token) {
          resHeaders.append('Set-Cookie', `${REFRESH_COOKIE}=${body.refresh_token}; ${cookieOptions(30)}`);
        }
      } catch { /* response is not JSON — ignore */ }
    }

    return new Response(upstream.buffer, { status: upstream.status, headers: resHeaders });
  } catch (err: unknown) {
    const msg = (err as Error)?.message ?? String(err);
    return new Response(
      JSON.stringify({ detail: `Proxy error: ${msg}` }),
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
