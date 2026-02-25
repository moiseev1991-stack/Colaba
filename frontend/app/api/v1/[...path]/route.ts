import { NextRequest } from 'next/server';
import * as http from 'node:http';
import * as https from 'node:https';
import * as dns from 'node:dns';
import { resolve4 } from 'node:dns/promises';

export const runtime = 'nodejs';

const BACKEND_ORIGIN = process.env.INTERNAL_BACKEND_ORIGIN || 'http://backend:8000';
const BACKEND_HOSTNAME = new URL(BACKEND_ORIGIN).hostname;

const ipCache = new Map<string, { ip: string; exp: number }>();

// Try c-ares (resolve4) first, fall back to libc (dns.lookup) on failure.
// c-ares can return ESERVFAIL in long-running processes due to Docker DNS quirks.
// libc can return EAI_AGAIN transiently. Using both maximises success rate.
async function dnsResolveIPv4(hostname: string): Promise<string> {
  try {
    const ips = await resolve4(hostname);
    // #region agent log
    console.error('[DNS] resolve4 OK:', hostname, '->', ips[0]);
    // #endregion
    return ips[0];
  } catch (caresErr: any) {
    // #region agent log
    console.error('[DNS] resolve4 failed:', caresErr?.code, caresErr?.message, '- falling back to dns.lookup');
    // #endregion
    return new Promise<string>((resolve, reject) => {
      dns.lookup(hostname, { family: 4 }, (err, address) => {
        if (err) {
          // #region agent log
          console.error('[DNS] dns.lookup failed:', err?.code, err?.message);
          // #endregion
          reject(err);
        } else {
          // #region agent log
          console.error('[DNS] dns.lookup OK:', hostname, '->', address);
          // #endregion
          resolve(address);
        }
      });
    });
  }
}

async function resolveToIP(hostname: string): Promise<string> {
  const cached = ipCache.get(hostname);
  if (cached && cached.exp > Date.now()) {
    // #region agent log
    console.error('[DNS-DEBUG] cache hit:', hostname, '->', cached.ip);
    // #endregion
    return cached.ip;
  }

  // #region agent log
  console.error('[DNS-DEBUG] resolving:', hostname);
  // #endregion

  let lastErr: any;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const ip = await dnsResolveIPv4(hostname);
      ipCache.set(hostname, { ip, exp: Date.now() + 300_000 });
      return ip;
    } catch (err: any) {
      lastErr = err;
      // #region agent log
      console.error('[DNS-DEBUG] attempt', attempt + 1, 'failed:', err?.code, err?.message);
      // #endregion
      if (attempt < 4) await new Promise(r => setTimeout(r, 200 * (attempt + 1)));
    }
  }
  throw lastErr;
}

// Pre-warm DNS cache when module loads so first real request hits the cache
void (async () => {
  for (let i = 0; i < 5; i++) {
    try {
      await resolveToIP(BACKEND_HOSTNAME);
      console.error('[DNS-WARMUP] pre-warmed DNS for', BACKEND_HOSTNAME);
      break;
    } catch (e: any) {
      console.error('[DNS-WARMUP] attempt', i + 1, 'failed:', e?.message, '- retry in 3s');
      await new Promise(r => setTimeout(r, 3000));
    }
  }
})();

async function httpProxyRequest(
  url: URL,
  method: string,
  headers: Headers,
  body: ArrayBuffer | undefined,
): Promise<{ status: number; headers: Headers; buffer: Buffer }> {
  let hostname: string;
  try {
    hostname = await resolveToIP(url.hostname);
    // #region agent log
    console.error('[PROXY] using IP:', hostname, 'for', url.hostname);
    // #endregion
  } catch (dnsErr: any) {
    // #region agent log
    console.error('[PROXY] DNS failed after all retries:', dnsErr?.code, dnsErr?.message);
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
    console.error('[PROXY-ERR]', err?.code, err?.message);
    // #endregion
    const detail = `Proxy upstream error: ${err?.message} | url: ${upstreamUrl.toString()} | origin: ${BACKEND_ORIGIN}`;
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
