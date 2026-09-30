import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const publicRoot = path.join(root, 'public');
const port = Number(process.env.PORT || 4173);

// Local development may reuse the key already stored in Hermes without copying it into this project.
function loadHermesKey() {
  if (process.env.TINYFISH_API_KEY || process.env.MCP_TINYFISH_API_KEY) return;
  try {
    const envFile = fs.readFileSync(path.join(os.homedir(), '.hermes', '.env'), 'utf8');
    const line = envFile.split(/\r?\n/).find((row) => /^\s*(?:MCP_TINYFISH_API_KEY|TINYFISH_API_KEY)=/.test(row));
    if (line) {
      const value = line.slice(line.indexOf('=') + 1).trim().replace(/^['"]|['"]$/g, '');
      if (value) process.env.MCP_TINYFISH_API_KEY = value;
    }
  } catch {
    // Missing local credentials are handled by the API route with a safe error response.
  }
}
loadHermesKey();

const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml' };

function sendJson(res, status, value) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(value));
}

async function routeApi(req, res, pathname) {
  const routePath = pathname === '/api/search' ? '/api/search.js' : pathname === '/api/agent' ? '/api/agent.js' : pathname === '/api/config' ? '/api/config.js' : null;
  if (!routePath) return sendJson(res, 404, { error: 'API route not found.' });
  if (req.method === 'POST') {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    try { req.body = raw ? JSON.parse(raw) : {}; } catch { return sendJson(res, 400, { error: 'Request body must be valid JSON.' }); }
  }
  const mod = await import(`.${routePath}`);
  const response = {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(value) { sendJson(res, this.statusCode, value); },
  };
  await mod.default(req, response);
}

const server = http.createServer(async (req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  if (pathname.startsWith('/api/')) {
    try { await routeApi(req, res, pathname); }
    catch { if (!res.headersSent) sendJson(res, 500, { error: 'The local server could not complete this request.' }); }
    return;
  }
  const relative = pathname === '/' ? 'index.html' : decodeURIComponent(pathname).replace(/^\/+/, '');
  const file = path.resolve(publicRoot, relative);
  if (!file.startsWith(publicRoot + path.sep)) return sendJson(res, 403, { error: 'Invalid path.' });
  fs.readFile(file, (error, data) => {
    if (error) return sendJson(res, 404, { error: 'Page not found.' });
    res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  });
});

server.listen(port, '127.0.0.1', () => console.log(`CareerScout running locally at http://127.0.0.1:${port}`));
