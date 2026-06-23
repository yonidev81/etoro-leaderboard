const https  = require('https');
const crypto = require('crypto');

const ETORO_HOST = 'public-api.etoro.com';
const GROQ_HOST  = 'api.groq.com';

module.exports = async function handler(req, res) {
  // req.query.path is the catch-all array, e.g. ['groq','openai','v1','chat','completions']
  // or ['v1','user-info','people','search']
  const segments    = Array.isArray(req.query.path) ? req.query.path : [req.query.path].filter(Boolean);
  const queryString = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';

  if (segments[0] === 'groq') {
    // /api/groq/openai/v1/... → forward to api.groq.com/openai/v1/...
    const groqPath = '/' + segments.slice(1).join('/');
    await proxyTo(req, res, GROQ_HOST, groqPath, {
      'content-type':  'application/json',
      'authorization': `Bearer ${process.env.GROQ_KEY}`,
    });
  } else {
    // /api/v1/user-info/... → forward to public-api.etoro.com/v1/user-info/...
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
