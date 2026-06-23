const https  = require('https');
const crypto = require('crypto');

// API keys come from Vercel environment variables — never in the browser
const ETORO_HOST = 'public-api.etoro.com';
const GROQ_HOST  = 'api.groq.com';

module.exports = async function handler(req, res) {
  const url = req.url; // e.g. /api/groq/... or /api/v1/...

  if (url.startsWith('/api/groq/')) {
    const groqPath = url.replace('/api/groq', '');
    await proxyTo(req, res, GROQ_HOST, groqPath, {
      'content-type':  'application/json',
      'authorization': `Bearer ${process.env.GROQ_KEY}`,
    });
  } else {
    const etoroPath = url.replace('/api', '');
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
