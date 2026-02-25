import { NextRequest } from 'next/server';
import * as http from 'node:http';
import * as https from 'node:https';
import { appendFileSync } from 'node:fs';

export const runtime = 'nodejs';

// File-based debug logging
const DEBUG_LOG = '/tmp/proxy-debug.log';
function dbg(msg: string) {
  try { appendFileSync(DEBUG_LOG, `${new Date().toISOString()} ${msg}\n`); } catch {}
}

// Backend origin: entrypoint.sh writes the resolved IP to /etc/hosts so that
// getaddrinfo('backend') works reliably in all process contexts.
// We simply use the hostname directly - no custom DNS needed.
const BACKEND_ORIGIN = process.env.INTERNAL_BACKEND_ORIGIN || 'http://backend:8000';

dbg(`[INIT] module loaded, BACKEND_ORIGIN=${BACKEND_ORIGIN}`);

// #region agent log
fetch('http://127.0.0.1:7244/ingest/0399435a-c7fd-43d9-8a3b-05cfb4c1e391', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'route.ts:init',message:'module loaded',data:{BACKEND_ORIGIN},timestamp:Date.now(),hypothesisId:'H-hosts'})}).catch(()=>{});
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

  dbg(`[PROXY] ${method} ${url.hostname}:${port}${url.pathname}`);

  return new Promise((resolve, reject) => {
    const options: http.RequestOptions = {
      hostname: url.hostname,
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
        dbg(`[PROXY] response ${res.statusCode}`);
        resolve({
          status: res.statusCode ?? 502,
          headers: resHeaders,
          buffer: Buffer.concat(chunks),
        });
      });
      res.on('error', reject);
    });
    req.on('error', (err: any) => {
      dbg(`[HTTP-ERR] ${err?.code} ${err?.message}`);
      reject(err);
    });
    if (body && body.byteLength > 0) req.write(Buffer.from(body));
    req.end();
  });
}

async function proxy(req: NextRequest, pathParts: string[]) {
  const upstreamUrl = new URL(`${BACKEND_ORIGIN}/api/v1/${pathParts.join('/')}`);
  upstreamUrl.search = req.nextUrl.search;

  dbg(`[PROXY] -> ${upstreamUrl.toString()}`);

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
