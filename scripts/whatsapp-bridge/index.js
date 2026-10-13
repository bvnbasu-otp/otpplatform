/**
 * OTP Secure WAHA Proxy Bridge
 * 
 * Provides an authenticated, surface-restricted gateway between public tunnels
 * (such as ngrok) and the local paired WAHA container (127.0.0.1:3008).
 * 
 * Security Invariants:
 * 1. Strict API Key Enforcement: Validates X-Api-Key on every request.
 * 2. Minimal Attack Surface: Only allows:
 *    - GET /api/sessions/:session (readiness check)
 *    - GET /api/contacts/check-exists (LID resolution)
 *    - POST /api/sendText (outbound message dispatch)
 *    All other endpoints (pairing, QR, screenshot, session lifecycle) return 403 Forbidden.
 * 3. Local Binding: Binds to 127.0.0.1 only.
 */

const http = require('http');
const https = require('https');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const TARGET_BASE_URL = process.env.WAHA_TARGET_URL || 'http://127.0.0.1:3008';
const BRIDGE_PORT = parseInt(process.env.BRIDGE_PORT || '3009', 10);
const BRIDGE_HOST = process.env.BRIDGE_HOST || '127.0.0.1';

// Read API key from env or .env.otp.production.local
function getApiKey() {
  if (process.env.WAHA_API_KEY) {
    return process.env.WAHA_API_KEY.trim();
  }
  const envPath = path.resolve(__dirname, '../../.env.otp.production.local');
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf8');
    const match = content.match(/^WAHA_API_KEY=(.+)$/m);
    if (match && match[1]) {
      return match[1].trim();
    }
  }
  return null;
}

const API_KEY = getApiKey();
if (!API_KEY) {
  console.error('[BRIDGE] FATAL: WAHA_API_KEY is not defined in environment or .env.otp.production.local');
  process.exit(1);
}

// Strict allowlist of endpoints
function isPathAllowed(method, pathname) {
  if (method === 'GET') {
    // /api/sessions/:session
    if (/^\/api\/sessions\/[A-Za-z0-9_-]+$/.test(pathname)) return true;
    // /api/contacts/check-exists
    if (pathname === '/api/contacts/check-exists') return true;
    // /health
    if (pathname === '/health') return true;
  }
  if (method === 'POST') {
    // /api/sendText
    if (pathname === '/api/sendText') return true;
  }
  return false;
}

const server = http.createServer((req, res) => {
  const reqUrl = new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`);
  const pathname = reqUrl.pathname;
  const method = req.method.toUpperCase();

  // Allow unauthenticated health check for local probe
  if (pathname === '/health' && method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, bridge: 'ACTIVE', target: TARGET_BASE_URL }));
    return;
  }

  // 1. Authenticate via X-Api-Key
  const providedKey = req.headers['x-api-key'];
  if (!providedKey || providedKey !== API_KEY) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Unauthorized: invalid or missing X-Api-Key' }));
    return;
  }

  // 2. Authorize allowed endpoints only
  if (!isPathAllowed(method, pathname)) {
    res.writeHead(403, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Forbidden: endpoint restricted by secure bridge policy' }));
    return;
  }

  // 3. Proxy request to target WAHA gateway
  const startTime = Date.now();
  console.log(`[BRIDGE] [${new Date().toISOString()}] INCOMING: ${method} ${pathname} (authorized)`);
  const targetUrl = new URL(pathname + reqUrl.search, TARGET_BASE_URL);
  const clientModule = targetUrl.protocol === 'https:' ? https : http;

  const proxyHeaders = { ...req.headers };
  delete proxyHeaders.host;
  // Preserve ngrok headers if present
  if (req.headers['ngrok-skip-browser-warning']) {
    proxyHeaders['ngrok-skip-browser-warning'] = req.headers['ngrok-skip-browser-warning'];
  }

  const proxyReq = clientModule.request(
    targetUrl,
    {
      method,
      headers: proxyHeaders,
      timeout: 15000,
    },
    (proxyRes) => {
      const duration = Date.now() - startTime;
      console.log(`[BRIDGE] [${new Date().toISOString()}] PROXIED: ${method} ${pathname} -> HTTP ${proxyRes.statusCode} (${duration}ms)`);
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(res);
    }
  );

  proxyReq.on('error', (err) => {
    console.error(`[BRIDGE] Proxy request failed: ${err.message}`);
    if (!res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Bad Gateway: target WAHA unreachable', details: err.message }));
    }
  });

  proxyReq.on('timeout', () => {
    proxyReq.destroy();
    if (!res.headersSent) {
      res.writeHead(504, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Gateway Timeout' }));
    }
  });

  req.pipe(proxyReq);
});

server.listen(BRIDGE_PORT, BRIDGE_HOST, () => {
  console.log(`[BRIDGE] Secure WAHA Bridge listening on http://${BRIDGE_HOST}:${BRIDGE_PORT}`);
  console.log(`[BRIDGE] Forwarding allowed endpoints to ${TARGET_BASE_URL}`);
  console.log(`[BRIDGE] Authentication: REQUIRED (X-Api-Key enforced)`);
});
