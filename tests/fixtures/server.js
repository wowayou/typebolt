'use strict';
// Tiny static server for E2E fixtures (random port). Files starting with "csp-" get a strict CSP header.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
const STRICT_CSP = "default-src 'self'; style-src 'self'; script-src 'self'";

function startServer() {
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/+/, '') || 'editors.html';
    const name = path.basename(rel);
    const file = path.join(__dirname, rel);
    // Only flat fixture files and the built editor bundles under dist/ are served.
    const allowed = path.dirname(rel) === '.' || path.dirname(rel) === 'dist';
    if (!allowed || !fs.existsSync(file) || name === 'server.js') {
      res.writeHead(404); res.end('not found'); return;
    }
    const headers = { 'Content-Type': TYPES[path.extname(name)] || 'application/octet-stream' };
    if (name.startsWith('csp-')) headers['Content-Security-Policy'] = STRICT_CSP;
    res.writeHead(200, headers);
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      resolve({ port, close: () => new Promise((r) => { server.close(r); server.closeAllConnections(); }) });
    });
  });
}

module.exports = { startServer, STRICT_CSP };
