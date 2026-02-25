import { NextRequest } from 'next/server';
import * as http from 'http';
import * as https from 'https';
import { resolve4 } from 'dns/promises';

export const runtime = 'nodejs';

const BACKEND_ORIGIN = process.env.INTERNAL_BACKEND_ORIGIN || 'http://backend:8000';
const BACKEND_HOSTNAME = new URL(BACKEND_ORIGIN).hostname;

// Cache resolved IPs for 5 min to avoid repeated DNS lookups
const ipCache = new Map<string, { ip: string; exp: number }>();

// dns.resolve4 (c-ares) sometimes gets EAI_AGAIN from Docker's embedded DNS
// under load. Retry up to 3 times with short delays before giving up.
async function resolveToIP(hostname: string): Promise<string> {
  const cached = ipCache.get(hostname);
  // #region agent log
  if (cached && cached.exp > Date.now()) {
    console.error('[DNS-DEBUG] cache hit:', hostname, '->', cached.ip);
    return cached.ip;
  }
  console.error('[DNS-DEBUG] resolve4 start:', hostname);
  // #endregion

  let lastErr: any;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const ips = await resolve4(hostname);
      const ip = ips[0];
      // #region agent log
      console.error('[DNS-DEBUG] resolve4 OK attempt', attempt + 1, hostname, '->', ip);
      // #endregion
      ipCache.set(hostname, { ip, exp: Date.now() + 300_000 });
      return ip;
    } catch (err: any) {
      lastErr = err;
      // #region agent log
      console.error('[DNS-DEBUG] resolve4 FAIL attempt', attempt + 1, hostname, err?.message, err?.code);
      // #endregion
      if (attempt < 2) await new Promise(r => setTimeout(r, 100 * (attempt + 1)));
    }
  }
  throw lastErr;
}

// Pre-warm DNS cache at module load so the first real request hits the cache
void (async () => {
  for (let i = 0; i < 5; i++) {
    try {
      await resolveToIP(BACKEND_HOSTNAME);
      console.error('[DNS-WARMUP] pre-warmed DNS for', BACKEND_HOSTNAME);
      break;
    } catch (e: any) {
      console.error('[DNS-WARMUP] attempt', i + 1, 'failed:', e?.message, '- retry in 2s');
      await new Promise(r => setTimeout(r, 2000));
    }
  }
})();

async function httpProxyRequest(
  url: URL,
  method: string,
  headers: Headers,
  body: ArrayBuffer | undefined,
): Promise<{ status: number; headers: Headers; buffer: Buffer }> {
  // Resolve to IPv4 IP so http.request never calls libc getaddrinfo
  let hostname: string;
  try {
    hostname = await resolveToIP(url.hostname);
    // #region agent log
    console.error('[PROXY-DNS] using resolved IP:', hostname);
    // #endregion
  } catch (dnsErr: any) {
    // #region agent log
    console.error('[PROXY-DNS] DNS failed after retries:', dnsErr?.message, dnsErr?.code);
    // #endregion
    throw dnsErr;
  }

  const port = url.port ? Number(url.port) : url.protocol === 'https:' ? 443 : 80;
  const reqHeaders: Record<string, string> = {};
  headers.forEach((v, k) => { reqHeaders[k] = v; });

  return new Promise((resolve, reject) => {
    const options: http.RequestOptions = {
      hostname,
      port,
      path: url.pathname + (url.search || ''),
      method,
      headers: reqHeaders,
    };

    const client = url.protocol === 'https:' ? https : http;
    const req = client.request(options, (res) => {
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
    });
    req.on('error', reject);
    if (body && body.byteLength > 0) req.write(Buffer.from(body));
    req.end();
  });
}

async function proxy(req: NextRequest, pathParts: string[]) {
  const upstreamUrl = new URL(`${BACKEND_ORIGIN}/api/v1/${pathParts.join('/')}`);
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
  } catch (err: any) {
    // #region agent log
    console.error('[PROXY-ERR] raw error:', err?.message, 'code:', err?.code, 'syscall:', err?.syscall);
    // #endregion
    const detail = `Proxy upstream error: ${err?.message} | url: ${upstreamUrl.toString()} | origin: ${BACKEND_ORIGIN}`;
    console.error('[PROXY-ERR]', detail);
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
