import { NextRequest } from 'next/server';
import * as http from 'node:http';
import * as https from 'node:https';
import * as dns from 'node:dns';
import { appendFileSync } from 'node:fs';

export const runtime = 'nodejs';

const BACKEND_ORIGIN = process.env.INTERNAL_BACKEND_ORIGIN || 'http://backend:8000';
const BACKEND_HOSTNAME = new URL(BACKEND_ORIGIN).hostname;

// File-based debug logging - bypasses any Next.js console interception
const DEBUG_LOG = '/tmp/proxy-debug.log';
function dbg(msg: string) {
  try { appendFileSync(DEBUG_LOG, `${new Date().toISOString()} ${msg}\n`); } catch {}
}

const ipCache = new Map<string, { ip: string; exp: number }>();

// Dedicated Resolver with its own c-ares channel + explicit Docker DNS server.
// Avoids shared c-ares state corruption in long-running Next.js process.
const dnsResolver = new dns.promises.Resolver({ timeout: 2500, tries: 3 });
dnsResolver.setServers(['127.0.0.11:53']);

async function resolveToIP(hostname: string): Promise<string> {
  const cached = ipCache.get(hostname);
  if (cached && cached.exp > Date.now()) {
    dbg(`cache hit: ${hostname} -> ${cached.ip}`);
    return cached.ip;
  }

  dbg(`resolving: ${hostname}`);
  let lastErr: any;

  for (let attempt = 0; attempt < 5; attempt++) {
    // Try 1: dedicated Resolver (own c-ares channel, explicit 127.0.0.11)
    try {
      const ips = await dnsResolver.resolve4(hostname);
      const ip = ips[0];
      dbg(`Resolver.resolve4 OK attempt ${attempt + 1}: ${hostname} -> ${ip}`);
      ipCache.set(hostname, { ip, exp: Date.now() + 300_000 });
      return ip;
    } catch (e1: any) {
      dbg(`Resolver.resolve4 FAIL attempt ${attempt + 1}: ${e1?.code} ${e1?.message}`);
    }

    // Try 2: libc dns.lookup (uses getaddrinfo, checks /etc/hosts first)
    try {
      const ip = await new Promise<string>((resolve, reject) => {
        dns.lookup(hostname, { family: 4 }, (err, address) => {
          if (err) reject(err); else resolve(address);
        });
      });
      dbg(`dns.lookup OK attempt ${attempt + 1}: ${hostname} -> ${ip}`);
      ipCache.set(hostname, { ip, exp: Date.now() + 300_000 });
      return ip;
    } catch (e2: any) {
      lastErr = e2;
      dbg(`dns.lookup FAIL attempt ${attempt + 1}: ${e2?.code} ${e2?.message}`);
    }

    if (attempt < 4) await new Promise(r => setTimeout(r, 200 * (attempt + 1)));
  }
  throw lastErr;
}

// Pre-warm DNS cache at module load
void (async () => {
  dbg(`[INIT] module loaded, BACKEND_ORIGIN=${BACKEND_ORIGIN}, hostname=${BACKEND_HOSTNAME}`);
  for (let i = 0; i < 5; i++) {
    try {
      await resolveToIP(BACKEND_HOSTNAME);
      dbg(`[WARMUP] pre-warmed DNS for ${BACKEND_HOSTNAME}`);
      break;
    } catch (e: any) {
      dbg(`[WARMUP] attempt ${i + 1} failed: ${e?.message} - retry in 3s`);
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
    dbg(`[PROXY] using IP: ${hostname} for ${url.hostname}`);
  } catch (dnsErr: any) {
    dbg(`[PROXY] DNS failed after all retries: ${dnsErr?.code} ${dnsErr?.message}`);
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
    req.on('error', (err: any) => {
      dbg(`[HTTP-ERR] ${err?.code} ${err?.message} hostname=${hostname}`);
      reject(err);
    });
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
    dbg(`[PROXY-ERR] ${err?.code} ${err?.message}`);
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
