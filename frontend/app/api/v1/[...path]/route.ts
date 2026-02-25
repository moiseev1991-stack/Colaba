import { NextRequest } from 'next/server';
import { resolve4 } from 'dns/promises';

export const runtime = 'nodejs';

const BACKEND_ORIGIN = process.env.INTERNAL_BACKEND_ORIGIN || 'http://backend:8000';

// Cache IPv4 resolutions to avoid repeated DNS lookups.
// Node.js/undici sends both A and AAAA queries; Docker DNS returns SERVFAIL
// for AAAA on container names, causing EAI_AGAIN. resolve4() forces IPv4-only.
const dnsCache = new Map<string, { ip: string; expiresAt: number }>();

async function resolveToIPv4(hostname: string): Promise<string> {
  const cached = dnsCache.get(hostname);
  if (cached && cached.expiresAt > Date.now()) return cached.ip;
  const ips = await resolve4(hostname);
  const ip = ips[0];
  dnsCache.set(hostname, { ip, expiresAt: Date.now() + 30_000 });
  return ip;
}

async function proxy(req: NextRequest, pathParts: string[]) {
  const upstreamUrl = new URL(`${BACKEND_ORIGIN}/api/v1/${pathParts.join('/')}`);
  upstreamUrl.search = req.nextUrl.search;

  // Resolve hostname to IPv4 to bypass EAI_AGAIN from Docker DNS on AAAA queries.
  try {
    const ip = await resolveToIPv4(upstreamUrl.hostname);
    upstreamUrl.hostname = ip;
  } catch {
    // If pre-resolution fails, proceed with original hostname.
  }

  const headers = new Headers(req.headers);
  // Avoid leaking hop-by-hop / invalid headers to upstream
  headers.delete('host');
  headers.delete('connection');
  headers.delete('content-length');
  // undici does not support Expect: 100-continue; drop it so the header
  // validation does not throw before the request reaches the backend.
  headers.delete('expect');

  const method = req.method.toUpperCase();
  const body =
    method === 'GET' || method === 'HEAD' ? undefined : await req.arrayBuffer();

  // #region agent log - DNS diagnostics
  let dnsInfo = 'not-attempted';
  try {
    const ip = await resolveToIPv4(upstreamUrl.hostname);
    dnsInfo = `ok:${ip}`;
    upstreamUrl.hostname = ip;
  } catch (dnsErr: any) {
    dnsInfo = `fail:${dnsErr?.message}`;
  }
  // #endregion

  let upstreamRes: Response;
  try {
    upstreamRes = await fetch(upstreamUrl, {
      method,
      headers,
      body,
      redirect: 'manual',
    });
  } catch (fetchErr: any) {
    const cause = fetchErr?.cause;
    const detail = `Proxy upstream error: ${fetchErr?.message} | cause: ${cause?.message ?? cause} | url: ${upstreamUrl.toString()} | dns: ${dnsInfo} | origin: ${BACKEND_ORIGIN}`;
    console.error('[PROXY-ERR]', detail);
    return new Response(JSON.stringify({ detail }), {
      status: 502,
      headers: { 'content-type': 'application/json' },
    });
  }

  const resHeaders = new Headers(upstreamRes.headers);
  resHeaders.delete('content-encoding');
  resHeaders.delete('content-length');
  resHeaders.delete('transfer-encoding');
  resHeaders.delete('connection');

  return new Response(await upstreamRes.arrayBuffer(), {
    status: upstreamRes.status,
    headers: resHeaders,
  });
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
