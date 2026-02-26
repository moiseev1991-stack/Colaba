import { NextRequest } from 'next/server';

export const runtime = 'nodejs';

const IS_IP = /^\d{1,3}(\.\d{1,3}){3}$/;

// Try multiple methods in order to find the backend IP.
// Returns { ip, method } on success or { ip: null, method, error } on failure.
function tryResolveBackendIP(): { ip: string | null; method: string; error?: string } {
  const exec = (require('child_process') as typeof import('child_process')).execSync;
  // Explicit PATH so shell commands (grep, awk, getent) are always found.
  const shellEnv = { PATH: '/usr/local/bin:/usr/bin:/bin', HOME: '/' } as unknown as NodeJS.ProcessEnv;
  const nodeBin = process.execPath;

  // M1: grep /etc/hosts directly (written by entrypoint.sh on success)
  try {
    const ip = exec("/bin/grep -w backend /etc/hosts | /usr/bin/awk '{print $1}' | /usr/bin/head -1",
      { encoding: 'utf8', timeout: 1000, env: shellEnv }).trim();
    if (IS_IP.test(ip)) return { ip, method: 'hosts-grep' };
  } catch {}

  // M2: getent hosts (nsswitch: files first, then dns — works even without /etc/hosts entry)
  try {
    const out = exec('/usr/bin/getent hosts backend', { encoding: 'utf8', timeout: 3000, env: shellEnv }).trim();
    const ip = out.split(/\s+/)[0] ?? '';
    if (IS_IP.test(ip)) return { ip, method: 'getent' };
  } catch {}

  // M3: dns.resolve4 in subprocess (uses c-ares — queries Docker DNS 127.0.0.11 via UDP,
  // confirmed working via `docker exec node -e "require('dns').resolve4(...)"` while
  // dns.lookup/getaddrinfo fails with EAI_AGAIN in the same container).
  try {
    const ip = exec(
      `${nodeBin} -e "require('dns').resolve4('backend',function(e,a){if(e){process.stderr.write(e.code+':'+e.message.slice(0,50));process.exit(1);}process.stdout.write(a[0]);})"`,
      { encoding: 'utf8', timeout: 5000 },
    ).trim();
    if (IS_IP.test(ip)) return { ip, method: 'resolve4-subprocess' };
    return { ip: null, method: 'resolve4-subprocess', error: `bad_ip:${ip}` };
  } catch (e) {
    return { ip: null, method: 'resolve4-subprocess', error: (e as Error).message?.substring(0, 150) };
  }
}

// Cache after first successful resolution so we only spawn one subprocess total.
let _ipCache: string | null = null;

function getBackendOrigin(): string {
  // 1. Cached IP (resolved on first request)
  if (_ipCache) return `http://${_ipCache}:8000`;

  // 2. Env var set by entrypoint.sh via export (use bracket notation to bypass
  //    Next.js/webpack build-time static substitution of process.env.VAR)
  // eslint-disable-next-line dot-notation
  const envOrigin = process.env['INTERNAL_BACKEND_ORIGIN'];
  if (envOrigin) {
    const m = envOrigin.match(/^https?:\/\/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}):\d+/);
    if (m) { _ipCache = m[1]; return envOrigin; }
    // Has a value but it's hostname-based (e.g. http://backend:8000) — fall through to resolve it
  }

  // 3. Read pre-resolved IP written by entrypoint.sh (when it succeeds)
  try {
    const content = (require('fs') as typeof import('fs'))
      .readFileSync('/tmp/backend-origin', 'utf8').trim();
    const m = content.match(/^http:\/\/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}):\d+$/);
    if (m) { _ipCache = m[1]; return content; }
  } catch {}

  // 4. Resolve via subprocess using multiple methods
  const resolved = tryResolveBackendIP();
  if (resolved.ip) { _ipCache = resolved.ip; return `http://${resolved.ip}:8000`; }

  // Determine hostname to use (from env var or default)
  // eslint-disable-next-line dot-notation
  const hostnameOrigin = process.env['INTERNAL_BACKEND_ORIGIN'] ?? 'http://backend:8000';
  return hostnameOrigin.startsWith('http') ? hostnameOrigin : 'http://backend:8000';
}

// Async DNS resolve using c-ares (dns.resolve4) — queries Docker DNS directly,
// works when getaddrinfo-based methods (dns.lookup, subprocesses) fail with EAI_AGAIN.
async function resolveHostnameAsync(hostname: string): Promise<string | null> {
  if (IS_IP.test(hostname)) return hostname;
  const dns = require('dns') as typeof import('dns');
  const { promisify } = require('util') as typeof import('util');
  try {
    const addresses = await promisify(dns.resolve4)(hostname);
    const ip = addresses?.[0];
    if (ip && IS_IP.test(ip)) return ip;
  } catch {}
  return null;
}

// #region agent log - diagnostics (keep until login confirmed working)
function collectDiag(): Record<string, unknown> {
  const d: Record<string, unknown> = {};
  try {
    d.fileRaw = (require('fs') as typeof import('fs'))
      .readFileSync('/tmp/backend-origin', 'utf8').trim();
  } catch (e) { d.fileRaw = null; d.fileErr = (e as NodeJS.ErrnoException).code; }
  d.ipCache = _ipCache;
  d.nodeBin = process.execPath;
  d.nodeOptions = process.env.NODE_OPTIONS;
  // #region agent log H-A: dot-notation vs bracket-notation env access
  d.envOrigin = process.env.INTERNAL_BACKEND_ORIGIN ?? '(undefined)';
  // eslint-disable-next-line dot-notation
  d.envOriginBracket = process.env['INTERNAL_BACKEND_ORIGIN'] ?? '(undefined)';
  // #endregion
  // #region agent log H-B: can Node.js read /etc/hosts directly?
  try {
    const hosts = (require('fs') as typeof import('fs')).readFileSync('/etc/hosts', 'utf8');
    const backendLine = hosts.split('\n').find(l => /\bbackend\b/.test(l) && !/^#/.test(l.trim()));
    d.hostsBackendLine = backendLine ?? '(not found)';
  } catch (e) { d.hostsBackendLine = `ERR:${(e as Error).message?.slice(0,60)}`; }
  // #endregion
  // #region agent log H-C: M1 detailed error
  try {
    const { execSync } = require('child_process') as typeof import('child_process');
    const shellEnv2 = { PATH: '/usr/local/bin:/usr/bin:/bin', HOME: '/' } as unknown as NodeJS.ProcessEnv;
    d.m1Result = execSync("/bin/grep -w backend /etc/hosts | /usr/bin/awk '{print $1}' | /usr/bin/head -1",
      { encoding: 'utf8', timeout: 1000, env: shellEnv2 }).trim();
  } catch (e) { d.m1Err = (e as Error).message?.slice(0, 120); }
  // #endregion
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
  let origin = getBackendOrigin();

  // If sync methods returned a hostname-based URL, try async dns.resolve4 (c-ares).
  // This queries Docker DNS (127.0.0.11) directly via UDP and often works when
  // getaddrinfo-based methods fail with EAI_AGAIN in long-running processes.
  if (!IS_IP.test(new URL(origin).hostname)) {
    const ip = await resolveHostnameAsync(new URL(origin).hostname);
    if (ip) { _ipCache = ip; origin = `http://${ip}:8000`; }
  }

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
