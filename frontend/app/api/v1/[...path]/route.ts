import { NextRequest } from 'next/server';
import * as http from 'node:http';
import * as https from 'node:https';
import * as dns from 'node:dns';
import { resolve4 } from 'node:dns/promises';
import { appendFileSync, readFileSync } from 'node:fs';

export const runtime = 'nodejs';

// File-based debug logging - bypasses any Next.js console interception
const DEBUG_LOG = '/tmp/proxy-debug.log';
function dbg(msg: string) {
  try { appendFileSync(DEBUG_LOG, `${new Date().toISOString()} ${msg}\n`); } catch {}
}

// Lazy-cached backend origin: resolved at first request time (not module load /
// next build time) to avoid webpack baking in the build-time fallback value.
let _backendOrigin: string | null = null;

function getBackendOrigin(): string {
  if (_backendOrigin !== null) return _backendOrigin;

  // #region agent log
  fetch('http://127.0.0.1:7244/ingest/0399435a-c7fd-43d9-8a3b-05cfb4c1e391', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'route.ts:getBackendOrigin',message:'resolving backend origin',timestamp:Date.now(),hypothesisId:'H1'})}).catch(()=>{});
  // #endregion

  try {
    const v = readFileSync('/tmp/backend-origin', 'utf8').trim();
    dbg(`[ORIGIN] readFileSync ok: "${v}"`);
    // #region agent log
    fetch('http://127.0.0.1:7244/ingest/0399435a-c7fd-43d9-8a3b-05cfb4c1e391', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'route.ts:getBackendOrigin',message:'file read success',data:{fileContent:v},timestamp:Date.now(),hypothesisId:'H1'})}).catch(()=>{});
    // #endregion
    if (v) {
      _backendOrigin = v;
      return v;
    }
  } catch (err: any) {
    dbg(`[ORIGIN] readFileSync failed: ${err?.message}`);
    // #region agent log
    fetch('http://127.0.0.1:7244/ingest/0399435a-c7fd-43d9-8a3b-05cfb4c1e391', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'route.ts:getBackendOrigin',message:'file read failed',data:{error:String(err)},timestamp:Date.now(),hypothesisId:'H2'})}).catch(()=>{});
    // #endregion
  }

  // Use bracket notation to bypass webpack DefinePlugin inlining of process.env
  const envVal = (process.env as Record<string,string|undefined>)['INTERNAL_BACKEND_ORIGIN'];
  dbg(`[ORIGIN] env fallback: "${envVal}"`);
  // #region agent log
  fetch('http://127.0.0.1:7244/ingest/0399435a-c7fd-43d9-8a3b-05cfb4c1e391', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'route.ts:getBackendOrigin',message:'env fallback',data:{envVal},timestamp:Date.now(),hypothesisId:'H2'})}).catch(()=>{});
  // #endregion
  _backendOrigin = envVal || 'http://backend:8000';
  return _backendOrigin;
}

const ipCache = new Map<string, { ip: string; exp: number }>();

function isIPv4(s: string): boolean {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(s);
}

async function resolveToIP(hostname: string): Promise<string> {
  if (isIPv4(hostname)) {
    dbg(`${hostname} is already an IP, skip DNS`);
    return hostname;
  }

  const cached = ipCache.get(hostname);
  if (cached && cached.exp > Date.now()) {
    dbg(`cache hit: ${hostname} -> ${cached.ip}`);
    return cached.ip;
  }

  dbg(`resolving: ${hostname}`);
  let lastErr: any;

  for (let attempt = 0; attempt < 5; attempt++) {
    // Try 1: global resolve4 via resolv.conf (uses Docker iptables DNAT for 127.0.0.11:53)
    try {
      const ips = await resolve4(hostname);
      const ip = ips[0];
      dbg(`resolve4 OK attempt ${attempt + 1}: ${hostname} -> ${ip}`);
      ipCache.set(hostname, { ip, exp: Date.now() + 300_000 });
      return ip;
    } catch (e1: any) {
      dbg(`resolve4 FAIL attempt ${attempt + 1}: ${e1?.code} ${e1?.message}`);
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

// Log module load - BACKEND_ORIGIN is resolved lazily at first request
dbg(`[INIT] module loaded (lazy mode - origin resolved at first request)`);

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
  const BACKEND_ORIGIN = getBackendOrigin();
  dbg(`[PROXY] BACKEND_ORIGIN=${BACKEND_ORIGIN}`);
  // #region agent log
  fetch('http://127.0.0.1:7244/ingest/0399435a-c7fd-43d9-8a3b-05cfb4c1e391', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'route.ts:proxy',message:'proxy called',data:{BACKEND_ORIGIN,path:pathParts.join('/')},timestamp:Date.now(),hypothesisId:'H1'})}).catch(()=>{});
  // #endregion
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
    const detail = `Proxy upstream error: ${err?.message} | url: ${upstreamUrl.toString()} | origin: ${BACKEND_ORIGIN} | file: ${_backendOrigin}`;
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
