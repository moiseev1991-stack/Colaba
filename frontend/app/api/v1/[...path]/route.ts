import { NextRequest } from 'next/server';
import * as http from 'http';
import * as https from 'https';
import { resolve4 } from 'dns/promises';

export const runtime = 'nodejs';

const BACKEND_ORIGIN = process.env.INTERNAL_BACKEND_ORIGIN || 'http://backend:8000';

// dns.resolve4 uses Node.js c-ares resolver (not libc getaddrinfo).
// libc getaddrinfo fails with EAI_AGAIN in long-running Next.js processes
// due to Docker DNS returning SERVFAIL on AAAA queries or search-domain
// collisions. c-ares queries Docker DNS (127.0.0.11) directly and works.
// Cache result for 60s to avoid repeated lookups.
const ipCache = new Map<string, { ip: string; exp: number }>();

async function resolveToIP(hostname: string): Promise<string> {
  const cached = ipCache.get(hostname);
  // #region agent log
  if (cached && cached.exp > Date.now()) {
    console.error('[DNS-DEBUG] cache hit:', hostname, '->', cached.ip);
    return cached.ip;
  }
  console.error('[DNS-DEBUG] resolve4 start:', hostname);
  // #endregion
  try {
    const ips = await resolve4(hostname);
    // #region agent log
    console.error('[DNS-DEBUG] resolve4 OK:', hostname, '->', ips);
    // #endregion
    const ip = ips[0];
    ipCache.set(hostname, { ip, exp: Date.now() + 60_000 });
    return ip;
  } catch (dnsErr: any) {
    // #region agent log
    console.error('[DNS-DEBUG] resolve4 FAIL:', hostname, 'msg:', dnsErr?.message, 'code:', dnsErr?.code, 'syscall:', dnsErr?.syscall);
    // #endregion
    throw dnsErr;
  }
}

async function httpProxyRequest(
  url: URL,
  method: string,
  headers: Headers,
  body: ArrayBuffer | undefined,
): Promise<{ status: number; headers: Headers; buffer: Buffer }> {
  // Resolve hostname to IPv4 IP using c-ares (bypasses libc EAI_AGAIN issue).
  // If resolution fails, fall back to original hostname (will likely fail too,
  // but at least produces a meaningful error).
  let hostname = url.hostname;
  try {
    hostname = await resolveToIP(url.hostname);
    // #region agent log
    console.error('[PROXY-DNS] resolved to IP:', hostname);
    // #endregion
  } catch (dnsErr: any) {
    // #region agent log
    console.error('[PROXY-DNS] fallback to hostname after resolve4 error:', dnsErr?.message);
    // #endregion
  }

  const port = url.port ? Number(url.port) : url.protocol === 'https:' ? 443 : 80;
  const reqHeaders: Record<string, string> = {};
  headers.forEach((v, k) => { reqHeaders[k] = v; });

  return new Promise((resolve, reject) => {
    const options: http.RequestOptions = {
      hostname,  // IP address or fallback hostname
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
    console.error('[PROXY-ERR] raw error:', err?.message, 'code:', err?.code, 'syscall:', err?.syscall, 'cause:', err?.cause?.message);
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
