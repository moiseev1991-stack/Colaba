/**
 * Wrapper that fixes Next.js HTML output missing DOCTYPE/opening tags.
 * Proxies to Next.js and prepends shell if needed.
 */
const http = require('http');
const zlib = require('zlib');

const NEXT_PORT = 3001;
const PROXY_PORT = 3000;
const HTML_SHELL = '<!DOCTYPE html><html lang="ru"><head>';

function proxy(req, res) {
  const opts = {
    hostname: '127.0.0.1',
    port: NEXT_PORT,
    path: req.url,
    method: req.method,
    headers: { ...req.headers, host: `localhost:${NEXT_PORT}` },
  };

  const proxyReq = http.request(opts, (proxyRes) => {
    const chunks = [];
    proxyRes.on('data', (c) => chunks.push(c));
    proxyRes.on('end', () => {
      let rawBody = Buffer.concat(chunks);
      const encoding = (proxyRes.headers['content-encoding'] || '').toLowerCase();
      const ct = (proxyRes.headers['content-type'] || '').toLowerCase();

      function done(body) {
        if (ct.includes('text/html') && body && !body.trimStart().startsWith('<!DOCTYPE') && !body.trimStart().startsWith('<html')) {
          body = HTML_SHELL + body;
        }
        const out = Buffer.from(body, 'utf8');
        const headers = { ...proxyRes.headers };
        delete headers['content-encoding'];
        delete headers['content-length'];
        headers['content-length'] = String(out.length);
        res.writeHead(proxyRes.statusCode, headers);
        res.end(out);
      }

      if (encoding === 'gzip') {
        zlib.gunzip(rawBody, (err, buf) => {
          done(err ? rawBody.toString('utf8') : buf.toString('utf8'));
        });
      } else if (encoding === 'br') {
        zlib.brotliDecompress(rawBody, (err, buf) => {
          done(err ? rawBody.toString('utf8') : buf.toString('utf8'));
        });
      } else if (encoding === 'deflate') {
        zlib.inflate(rawBody, (err, buf) => {
          done(err ? rawBody.toString('utf8') : buf.toString('utf8'));
        });
      } else {
        done(rawBody.toString('utf8'));
      }
    });
  });

  proxyReq.on('error', (e) => {
    res.writeHead(502);
    res.end('Bad Gateway');
  });

  req.pipe(proxyReq);
}

const next = require('child_process').spawn('npx', ['next', 'start', '-p', String(NEXT_PORT)], {
  env: { ...process.env, NODE_ENV: 'production' },
  stdio: 'inherit',
  cwd: __dirname,
});

next.on('error', () => process.exit(1));

setTimeout(() => {
  http.createServer(proxy).listen(PROXY_PORT, '0.0.0.0', () => {
    console.log(`Proxy listening on ${PROXY_PORT}, Next.js on ${NEXT_PORT}`);
  });
}, 8000);
