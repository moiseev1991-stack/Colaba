import { NextRequest } from 'next/server';
import * as http from 'http';
import * as https from 'https';
import { lookup as dnsLookup } from 'dns';

export const runtime = 'nodejs';

const BACKEND_ORIGIN = process.env.INTERNAL_BACKEND_ORIGIN || 'http://backend:8000';

// Force IPv4-only DNS lookup to avoid EAI_AGAIN from Docker DNS.
// Node.js/undici (global fetch) sends concurrent A+AAAA queries; Docker's
// embedded DNS returns SERVFAIL for AAAA on container names, causing
// EAI_AGAIN. Using http.request with a custom lookup + family:4 avoids this.
function lookupIPv4(hostname: string, options: any, callback: any) {
  dnsLookup(hostname, { ...options, family: 4 }, callback);
}

async function httpRequest(
  url: URL,
  method: string,
  headers: Headers,
  body: ArrayBuffer | undefined,
): Promise<{ status: number; headers: Headers; buffer: Buffer }> {
  return new Promise((resolve, reject) => {
    const port = url.port ? Number(url.port) : url.protocol === 'https:' ? 443 : 80;
    const reqHeaders: Record<string, string> = {};
    headers.forEach((v, k) => { reqHeaders[k] = v; });

    const options: http.RequestOptions = {
      hostname: url.hostname,
      port,
      path: url.pathname + (url.search || ''),
      method,
      headers: reqHeaders,
      lookup: lookupIPv4,
    };

    const client = url.protocol === 'https:' ? https : http;
    const req = client.request(options, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
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
    const upstream = await httpRequest(upstreamUrl, method, headers, body);
    upstream.headers.delete('content-encoding');
    upstream.headers.delete('transfer-encoding');
    upstream.headers.delete('connection');
    return new Response(upstream.buffer, { status: upstream.status, headers: upstream.headers });
  } catch (err: any) {
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
