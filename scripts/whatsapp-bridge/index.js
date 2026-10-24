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
 * 4. POST /contact-email is the separate Contact Us email relay (contact-email.js).
 *    It is authenticated only by X-Contact-Relay-Secret, never by X-Api-Key, and
 *    the relay secret is never accepted on, or forwarded to, the WAHA routes.
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const {
  CONTACT_EMAIL_PATH,
  RELAY_SECRET_HEADER,
  createContactEmailHandler,
  resolveContactEmailConfig,
  secretMatches,
} = require('./contact-email');

const ENV_FILE = path.resolve(__dirname, '../../.env.otp.production.local');

// Read API key from env or .env.otp.production.local
function getApiKey(env = process.env, envFile = ENV_FILE) {
  if (env.WAHA_API_KEY) {
    return env.WAHA_API_KEY.trim();
  }
  if (fs.existsSync(envFile)) {
    const content = fs.readFileSync(envFile, 'utf8');
    const match = content.match(/^WAHA_API_KEY=(.+)$/m);
    if (match && match[1]) {
      return match[1].trim();
    }
  }
  return null;
}

/** Reads NAME from env, else from the local env file. Values are returned, never printed. */
function createSettingReader(env = process.env, envFile = ENV_FILE) {
  let fileContent = null;
  return (name) => {
    if (env[name]) return env[name];
    if (fileContent === null) {
      fileContent = fs.existsSync(envFile) ? fs.readFileSync(envFile, 'utf8') : '';
    }
    const match = fileContent.match(new RegExp(`^${name}=(.*)$`, 'm'));
    if (!match) return undefined;
    const value = match[1].trim();
    return /^(["']).*\1$/.test(value) ? value.slice(1, -1) : value;
  };
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

/**
 * Builds the bridge request handler.
 *
 * options.apiKey        WAHA X-Api-Key
 * options.targetBaseUrl WAHA origin
 * options.contactEmail  /contact-email handler (createContactEmailHandler)
 * options.request       upstream request function, defaults to http/https.request
 */
function createBridgeHandler(options) {
  const API_KEY = options.apiKey;
  const TARGET_BASE_URL = options.targetBaseUrl;
  const contactEmail = options.contactEmail || createContactEmailHandler({ config: { enabled: false, reason: 'RELAY_SECRET_MISSING' } });
  const upstreamRequest = options.request
    || ((url, opts, cb) => (url.protocol === 'https:' ? https : http).request(url, opts, cb));

  return (req, res) => {
    const reqUrl = new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`);
    const pathname = reqUrl.pathname;
    const method = req.method.toUpperCase();

    // Allow unauthenticated health check for local probe
    if (pathname === '/health' && method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, bridge: 'ACTIVE', target: TARGET_BASE_URL }));
      return;
    }

    if (pathname === CONTACT_EMAIL_PATH) {
      contactEmail(req, res).catch(() => {
        if (!res.headersSent) {
          res.writeHead(502, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'FAILED' }));
        }
      });
      return;
    }

    // 1. Authenticate via X-Api-Key
    const providedKey = req.headers['x-api-key'];
    if (!secretMatches(providedKey, API_KEY)) {
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

    const proxyHeaders = { ...req.headers };
    delete proxyHeaders.host;
    delete proxyHeaders[RELAY_SECRET_HEADER];
    // Preserve ngrok headers if present
    if (req.headers['ngrok-skip-browser-warning']) {
      proxyHeaders['ngrok-skip-browser-warning'] = req.headers['ngrok-skip-browser-warning'];
    }

    const proxyReq = upstreamRequest(
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
  };
}

/** Startup banner. Reports whether the relay is enabled and why not — never a value. */
function startupLines({ host, port, targetBaseUrl, contactEmailConfig }) {
  return [
    `[BRIDGE] Secure WAHA Bridge listening on http://${host}:${port}`,
    `[BRIDGE] Forwarding allowed endpoints to ${targetBaseUrl}`,
    `[BRIDGE] Authentication: REQUIRED (X-Api-Key enforced)`,
    contactEmailConfig.enabled
      ? `[BRIDGE] Contact email relay: ENABLED at POST ${CONTACT_EMAIL_PATH} (X-Contact-Relay-Secret enforced)`
      : `[BRIDGE] Contact email relay: DISABLED (${contactEmailConfig.reason})`,
  ];
}

function main() {
  const TARGET_BASE_URL = process.env.WAHA_TARGET_URL || 'http://127.0.0.1:3008';
  const BRIDGE_PORT = parseInt(process.env.BRIDGE_PORT || '3009', 10);
  const BRIDGE_HOST = process.env.BRIDGE_HOST || '127.0.0.1';

  const API_KEY = getApiKey();
  if (!API_KEY) {
    console.error('[BRIDGE] FATAL: WAHA_API_KEY is not defined in environment or .env.otp.production.local');
    process.exit(1);
  }

  const contactEmailConfig = resolveContactEmailConfig(createSettingReader(), API_KEY);
  const server = http.createServer(createBridgeHandler({
    apiKey: API_KEY,
    targetBaseUrl: TARGET_BASE_URL,
    contactEmail: createContactEmailHandler({ config: contactEmailConfig }),
  }));

  server.listen(BRIDGE_PORT, BRIDGE_HOST, () => {
    for (const line of startupLines({ host: BRIDGE_HOST, port: BRIDGE_PORT, targetBaseUrl: TARGET_BASE_URL, contactEmailConfig })) {
      console.log(line);
    }
  });
}

if (require.main === module) {
  main();
}

module.exports = { createBridgeHandler, createSettingReader, getApiKey, isPathAllowed, startupLines };
