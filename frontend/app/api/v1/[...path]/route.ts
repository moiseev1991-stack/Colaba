import { NextRequest } from 'next/server';

export const runtime = 'nodejs';

const IS_IP = /^\d{1,3}(\.\d{1,3}){3}$/;

// Try multiple methods in order to find the backend IP.
// Returns { ip, method } on success or { ip: null, method, error } on failure.
function tryResolveBackendIP(): { ip: string | null; method: string; error?: string } {
  const exec = (require('child_process') as typeof import('child_process')).execSync;

  // M1: grep /etc/hosts directly (written by entrypoint.sh if it succeeded)
  try {
    const ip = exec("grep -w backend /etc/hosts | awk '{print $1}' | head -1",
      { encoding: 'utf8', timeout: 1000 }).trim();
    if (IS_IP.test(ip)) return { ip, method: 'hosts-grep' };
  } catch {}

  // M2: getent hosts (uses nsswitch: files then dns; no Node overhead)
  try {
    const out = exec('getent hosts backend', { encoding: 'utf8', timeout: 3000 }).trim();
    const ip = out.split(/\s+/)[0] ?? '';
    if (IS_IP.test(ip)) return { ip, method: 'getent' };
  } catch {}

  // M3: Node subprocess with clean env (strip any NODE_OPTIONS that might interfere)
  const nodeBin = process.execPath;
  try {
    const ip = exec(
      `${nodeBin} -e "require('dns/promises').resolve4('backend').then(([ip])=>process.stdout.write(ip)).catch(e=>{process.stderr.write(e.code+':'+e.message.slice(0,60));process.exit(1)})"`,
      { encoding: 'utf8', timeout: 5000, env: { HOME: '/', PATH: '/usr/local/bin:/usr/bin:/bin' } },
    ).trim();
    if (IS_IP.test(ip)) return { ip, method: 'node-dns-clean-env' };
    return { ip: null, method: 'node-dns-clean-env', error: `bad_ip:${ip}` };
  } catch (e) {
    return { ip: null, method: 'node-dns-clean-env', error: (e as Error).message?.substring(0, 150) };
  }
}

// Cache after first successful resolution so we only spawn one subprocess total.
let _ipCache: string | null = null;

function getBackendOrigin(): string {
  // 1. Cached IP (resolved on first request)
  if (_ipCache) return `http://${_ipCache}:8000`;

  // 2. Read pre-resolved IP written by entrypoint.sh (when it succeeds)
  try {
    const content = (require('fs') as typeof import('fs'))
      .readFileSync('/tmp/backend-origin', 'utf8').trim();
    const m = content.match(/^http:\/\/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}):\d+$/);
    if (m) { _ipCache = m[1]; return content; }
  } catch {}

  // 3. Resolve via subprocess using multiple methods
  const resolved = tryResolveBackendIP();
  if (resolved.ip) { _ipCache = resolved.ip; return `http://${resolved.ip}:8000`; }

  return 'http://backend:8000';
}

// #region agent log - diagnostics (keep until login confirmed working)
function collectDiag(): Record<string, unknown> {
  const d: Record<string, unknown> = {};
  try {
    d.fileRaw = (require('fs') as typeof import('fs'))
      .readFileSync('/tmp/backend-origin', 'utf8').trim();
  } catch { d.fileRaw = null; }
  d.ipCache = _ipCache;
  d.nodeBin = process.execPath;
  d.nodeOptions = process.env.NODE_OPTIONS;
  d.resolveAttempt = tryResolveBackendIP();
  try {
    const { execSync } = require('child_process') as typeof import('child_process');
    d.procEnvHasKey = execSync('cat /proc/self/environ', { encoding: 'utf8' })
      .includes('INTERNAL_BACKEND_ORIGIN');
  } catch (e) {
    d.procEnvErr = (e as Error).message?.substring(0, 80);
  }
  return d;
}
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

  return new Promise((resolve, reject) => {
    const http  = require('http')  as typeof import('http');
    const https = require('https') as typeof import('https');

    const options: import('http').RequestOptions = {
      hostname: url.hostname,
      port,
      path: url.pathname + (url.search || ''),
      method,
      headers: reqHeaders,
    };

    const client = url.protocol === 'https:' ? https : http;
    const req = client.request(options, (res: import('http').IncomingMessage) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) =>
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)),
      );
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
  const origin = getBackendOrigin();
  const upstreamUrl = new URL(`${origin}/api/v1/${pathParts.join('/')}`);
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
    return new Response(upstream.buffer, { status: upstream.status, headers: upstream.headers });
  } catch (err: unknown) {
    // #region agent log - diagnostics
    const diag = collectDiag();
    const detail = `Proxy error: ${(err as Error)?.message} | url: ${upstreamUrl.toString()} | origin: ${origin} | diag: ${JSON.stringify(diag)}`;
    // #endregion
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
