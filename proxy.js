const http   = require('http');
const https  = require('https');
const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');
const { exec } = require('child_process');

// Load .env for local development (ignored by git, not needed on Vercel)
try {
  const raw = fs.readFileSync(path.join(__dirname, '.env'), 'utf8');
  for (const line of raw.split('\n')) {
    const eq = line.indexOf('=');
    if (eq > 0) process.env[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
  }
} catch (_) {}

const HTML_FILE  = path.join(__dirname, 'leaderboard.html');
const PORT       = 8080;
const ETORO_HOST = 'public-api.etoro.com';
const GROQ_HOST  = 'api.groq.com';

const server = http.createServer((req, res) => {
  const parsed = new URL(req.url, `http://localhost:${PORT}`);
  const { pathname, search } = parsed;

  // ── Serve the HTML app ─────────────────────────────────────────────────
  if (pathname === '/' || pathname === '/leaderboard.html') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(fs.readFileSync(HTML_FILE));
    return;
  }

  // ── Proxy Groq AI (check before /api/ to avoid wrong match) ────────────
  if (pathname.startsWith('/api/groq/')) {
    const groqPath = pathname.replace('/api/groq', '') + (search || '');
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      const proxyReq = https.request(
        {
          hostname: GROQ_HOST, port: 443, path: groqPath, method: req.method,
          headers: { 'content-type': 'application/json', 'authorization': `Bearer ${process.env.GROQ_KEY}` },
        },
        (proxyRes) => {
          const h = { ...proxyRes.headers };
          delete h['transfer-encoding'];
          res.writeHead(proxyRes.statusCode, h);
          proxyRes.pipe(res);
        }
      );
      proxyReq.on('error', (err) => {
        if (!res.headersSent) res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      });
      if (body) proxyReq.write(body);
      proxyReq.end();
    });
    return;
  }

  // ── Proxy eToro API — auth headers injected server-side ────────────────
  if (pathname.startsWith('/api/')) {
    const proxyReq = https.request(
      {
        hostname: ETORO_HOST, port: 443,
        path: pathname + (search || ''), method: req.method,
        headers: {
          'x-api-key':    process.env.ETORO_KEY,
          'x-user-key':   process.env.ETORO_UKEY,
          'x-request-id': crypto.randomUUID(),
          'accept':       'application/json',
        },
      },
      (proxyRes) => {
        const h = { ...proxyRes.headers };
        delete h['transfer-encoding'];
        res.writeHead(proxyRes.statusCode, h);
        proxyRes.pipe(res);
      }
    );
    proxyReq.on('error', (err) => {
      if (!res.headersSent) res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    });
    req.pipe(proxyReq);
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, '127.0.0.1', () => {
  const url = `http://localhost:${PORT}`;
  console.log(`\n✅  Proxy démarré → ${url}`);
  console.log('   (Ctrl+C pour arrêter)\n');
  exec(`open "${url}"`);
});
