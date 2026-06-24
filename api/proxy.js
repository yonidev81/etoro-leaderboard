const https  = require('https');
const crypto = require('crypto');

const ETORO_HOST = 'public-api.etoro.com';
const GROQ_HOST  = 'api.groq.com';

module.exports = async function handler(req, res) {
  // vercel.json routes: /api/(.*) → /api/proxy?path=$1
  // req.query.path is the full sub-path, e.g. "groq/openai/v1/chat/completions"
  const rawPath  = (req.query.path || '').split('?')[0];
  const segments = rawPath.split('/').filter(Boolean);

  // Rebuild query string from req.url, stripping the injected `path` param
  const urlObj = new URL(req.url, 'http://localhost');
  urlObj.searchParams.delete('path');
  const queryString = urlObj.search; // e.g. "?period=OneYearAgo&page=1"

  if (segments[0] === 'groq') {
    const groqPath = '/' + segments.slice(1).join('/') + queryString;
    await proxyTo(req, res, GROQ_HOST, groqPath, {
      'content-type':  'application/json',
      'authorization': `Bearer ${process.env.GROQ_KEY}`,
    });
  } else {
    const etoroPath = '/' + segments.join('/') + queryString;
    await proxyTo(req, res, ETORO_HOST, etoroPath, {
      'x-api-key':    process.env.ETORO_KEY,
      'x-user-key':   process.env.ETORO_UKEY,
      'x-request-id': crypto.randomUUID(),
      'accept':       'application/json',
    });
  }
};

function proxyTo(req, res, hostname, path, headers) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      const proxyReq = https.request(
        { hostname, port: 443, path, method: req.method, headers },
        (proxyRes) => {
          const h = { ...proxyRes.headers };
          delete h['transfer-encoding'];
          res.writeHead(proxyRes.statusCode, h);
          proxyRes.pipe(res);
          proxyRes.on('end', resolve);
        }
      );
      proxyReq.on('error', (err) => {
        if (!res.headersSent) res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
        resolve();
      });
      if (body) proxyReq.write(body);
      proxyReq.end();
    });
  });
}
