/**
 * OTP Contact Us email relay — POST /contact-email on the secure bridge.
 *
 * The hosted contact-enquiry edge function cannot open SMTP connections, so it
 * hands the composed notice to this route, which submits it to the configured
 * SMTP server with Nodemailer.
 *
 * Security invariants:
 * 1. Authenticated only by X-Contact-Relay-Secret (CONTACT_EMAIL_RELAY_SECRET),
 *    compared in constant time. The WAHA X-Api-Key is never accepted here.
 * 2. Fail closed: no secret, a short secret, a secret equal to WAHA_API_KEY, or
 *    incomplete SMTP settings disable the route.
 * 3. The recipient is fixed. The body may carry only subject, text and replyTo;
 *    any other field (to, cc, bcc, from, headers, attachments, ...) is refused.
 * 4. Bounded streaming read: the body is never buffered beyond the cap.
 * 5. Logs carry event codes only — never credentials, addresses or content.
 * 6. Success means "accepted by SMTP" for the fixed recipient, not delivered.
 */

const crypto = require('crypto');

const CONTACT_EMAIL_PATH = '/contact-email';
const CONTACT_EMAIL_RECIPIENT = 'bvnbasu+otp.demo.otp.support@gmail.com';
const RELAY_SECRET_HEADER = 'x-contact-relay-secret';
const MIN_SECRET_LENGTH = 32;
const MAX_BODY_BYTES = 32 * 1024;
const MAX_SUBJECT_LENGTH = 200;
const MAX_TEXT_LENGTH = 8000;
const MAX_REPLY_TO_LENGTH = 254;
const SMTP_TIMEOUTS = Object.freeze({ connectionTimeout: 5000, greetingTimeout: 5000, socketTimeout: 10000 });
const SEND_DEADLINE_MS = 12000;
const ALLOWED_FIELDS = ['replyTo', 'subject', 'text'];

// Same address rule the edge function applies before composing Reply-To.
const EMAIL = /^[^\s@<>()[\]",;:\\]+@[^\s@<>()[\]",;:\\]+\.[^\s@<>()[\]",;:\\]{2,}$/;
// eslint-disable-next-line no-control-regex
const HEADER_UNSAFE = /[\u0000-\u001f\u007f\u2028\u2029]/;
// eslint-disable-next-line no-control-regex
const TEXT_UNSAFE = /[\u0000-\u0008\u000b-\u001f\u007f]/;

function digest(value) {
  return crypto.createHash('sha256').update(String(value), 'utf8').digest();
}

function secretMatches(provided, expected) {
  if (typeof provided !== 'string' || provided.length === 0) return false;
  if (typeof expected !== 'string' || expected.length === 0) return false;
  return crypto.timingSafeEqual(digest(provided), digest(expected));
}

/**
 * Resolves the relay settings. Returns { enabled: false, reason } with a code
 * only — never a value — when anything required is missing.
 */
function resolveContactEmailConfig(read, wahaApiKey) {
  const secret = (read('CONTACT_EMAIL_RELAY_SECRET') || '').trim();
  if (!secret) return { enabled: false, reason: 'RELAY_SECRET_MISSING' };
  if (secret.length < MIN_SECRET_LENGTH) return { enabled: false, reason: 'RELAY_SECRET_TOO_SHORT' };
  if (wahaApiKey && secret === String(wahaApiKey).trim()) {
    return { enabled: false, reason: 'RELAY_SECRET_REUSES_WAHA_KEY' };
  }

  const host = (read('SMTP_HOST') || '').trim();
  const portRaw = (read('SMTP_PORT') || '').trim();
  const user = (read('SMTP_USER') || '').trim();
  const pass = read('SMTP_PASS') || '';
  if (!host || !portRaw || !user || !pass) return { enabled: false, reason: 'SMTP_NOT_CONFIGURED' };
  const port = Number(portRaw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return { enabled: false, reason: 'SMTP_PORT_INVALID' };
  if (!EMAIL.test(user)) return { enabled: false, reason: 'SMTP_USER_INVALID' };

  const senderName = (read('SMTP_SENDER_NAME') || '').trim() || 'OTP Platform';
  const secure = (read('SMTP_SECURE') || '').trim().toLowerCase() === 'true' || port === 465;
  return {
    enabled: true,
    secret,
    smtp: { host, port, secure, user, pass, senderName: senderName.replace(new RegExp(HEADER_UNSAFE.source, 'g'), ' ') },
  };
}

function isLoopbackHost(host) {
  return host === '127.0.0.1' || host === 'localhost' || host === '::1';
}

/** Nodemailer is loaded only when a real transport is built, so tests never need SMTP. */
function createSmtpTransport(smtp, nodemailer = require('nodemailer')) {
  return nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    // STARTTLS is mandatory off-box so credentials never cross the network in clear text.
    requireTLS: !smtp.secure && !isLoopbackHost(smtp.host),
    auth: { user: smtp.user, pass: smtp.pass },
    ...SMTP_TIMEOUTS,
    disableFileAccess: true,
    disableUrlAccess: true,
    logger: false,
    debug: false,
  });
}

function sendJson(res, status, body, extraHeaders) {
  if (res.headersSent) return;
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...(extraHeaders || {}) });
  res.end(JSON.stringify(body));
}

function isJsonContentType(value) {
  if (typeof value !== 'string') return false;
  const [type, ...params] = value.split(';').map((p) => p.trim().toLowerCase());
  if (type !== 'application/json') return false;
  return params.every((p) => !p.startsWith('charset=') || p === 'charset=utf-8' || p === 'charset="utf-8"');
}

/** Resolves to the body string, or null once the cap is crossed (the rest is never read). */
function readBoundedBody(req, maxBytes) {
  return new Promise((resolve, reject) => {
    const declared = Number(req.headers['content-length']);
    if (Number.isFinite(declared) && declared > maxBytes) {
      resolve(null);
      return;
    }
    const chunks = [];
    let received = 0;
    let settled = false;
    const finish = (value, error) => {
      if (settled) return;
      settled = true;
      req.removeListener('data', onData);
      req.removeListener('end', onEnd);
      req.removeListener('error', onError);
      if (error) reject(error);
      else resolve(value);
    };
    const onData = (chunk) => {
      received += chunk.length;
      if (received > maxBytes) {
        req.pause();
        finish(null);
        return;
      }
      chunks.push(chunk);
    };
    const onEnd = () => {
      try {
        finish(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)));
      } catch (error) {
        finish(undefined, error);
      }
    };
    const onError = (error) => finish(undefined, error);
    req.on('data', onData);
    req.on('end', onEnd);
    req.on('error', onError);
  });
}

/** Returns the validated { subject, text, replyTo } or null. */
function validateContactEmail(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  if (Object.getPrototypeOf(payload) !== Object.prototype) return null;
  const keys = Object.keys(payload).sort();
  if (keys.length !== ALLOWED_FIELDS.length || keys.some((k, i) => k !== ALLOWED_FIELDS[i])) return null;

  const { subject, text, replyTo } = payload;
  if (typeof subject !== 'string' || typeof text !== 'string' || typeof replyTo !== 'string') return null;

  if (!subject.trim() || subject.length > MAX_SUBJECT_LENGTH || HEADER_UNSAFE.test(subject)) return null;
  if (!text.trim() || text.length > MAX_TEXT_LENGTH || TEXT_UNSAFE.test(text)) return null;
  if (replyTo.length > MAX_REPLY_TO_LENGTH || HEADER_UNSAFE.test(replyTo) || !EMAIL.test(replyTo)) return null;

  return { subject, text, replyTo };
}

function acceptedByRecipient(info) {
  if (!info || typeof info !== 'object') return false;
  const accepted = Array.isArray(info.accepted) ? info.accepted : [];
  const rejected = Array.isArray(info.rejected) ? info.rejected : [];
  const rejectedErrors = Array.isArray(info.rejectedErrors) ? info.rejectedErrors : [];
  if (rejected.length > 0 || rejectedErrors.length > 0) return false;
  const addresses = accepted.map((a) => String(a && typeof a === 'object' ? a.address : a).trim().toLowerCase());
  return addresses.length === 1 && addresses[0] === CONTACT_EMAIL_RECIPIENT;
}

function withDeadline(promise, ms) {
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const error = new Error('send deadline exceeded');
      error.code = 'ETIMEDOUT';
      reject(error);
    }, ms);
  });
  return Promise.race([promise, deadline]).finally(() => clearTimeout(timer));
}

/**
 * Builds the /contact-email handler.
 *
 * options.config     result of resolveContactEmailConfig
 * options.transport  object with sendMail(mail) => Promise<info>; built from config.smtp when omitted
 * options.log        (code) => void; receives event codes only
 * options.sendDeadlineMs  overall cap on one SMTP submission
 */
function createContactEmailHandler(options) {
  const config = options.config || { enabled: false, reason: 'RELAY_SECRET_MISSING' };
  const log = options.log || ((code) => console.log(`[BRIDGE] contact-email: ${code}`));
  const sendDeadlineMs = options.sendDeadlineMs || SEND_DEADLINE_MS;
  let transport = options.transport || null;

  return async function handleContactEmail(req, res) {
    if (!config.enabled) {
      log('RELAY_DISABLED');
      sendJson(res, 503, { status: 'NOT_CONFIGURED' });
      return;
    }

    if (!secretMatches(req.headers[RELAY_SECRET_HEADER], config.secret)) {
      log('UNAUTHORIZED');
      sendJson(res, 401, { status: 'UNAUTHORIZED' });
      return;
    }

    if (String(req.method).toUpperCase() !== 'POST') {
      log('METHOD_NOT_ALLOWED');
      sendJson(res, 405, { status: 'INVALID' }, { Allow: 'POST' });
      return;
    }

    if (!isJsonContentType(req.headers['content-type'])) {
      log('UNSUPPORTED_MEDIA_TYPE');
      sendJson(res, 415, { status: 'INVALID' });
      return;
    }

    let raw;
    try {
      raw = await readBoundedBody(req, MAX_BODY_BYTES);
    } catch {
      log('BAD_BODY');
      sendJson(res, 400, { status: 'INVALID' });
      return;
    }
    if (raw === null) {
      log('PAYLOAD_TOO_LARGE');
      res.on('finish', () => req.destroy());
      sendJson(res, 413, { status: 'INVALID' }, { Connection: 'close' });
      return;
    }

    let payload;
    try {
      payload = JSON.parse(raw);
    } catch {
      log('INVALID_JSON');
      sendJson(res, 400, { status: 'INVALID' });
      return;
    }

    const email = validateContactEmail(payload);
    if (!email) {
      log('INVALID_PAYLOAD');
      sendJson(res, 400, { status: 'INVALID' });
      return;
    }

    try {
      if (!transport) transport = createSmtpTransport(config.smtp);
      const info = await withDeadline(
        transport.sendMail({
          from: { name: config.smtp.senderName, address: config.smtp.user },
          to: CONTACT_EMAIL_RECIPIENT,
          envelope: { from: config.smtp.user, to: [CONTACT_EMAIL_RECIPIENT] },
          replyTo: email.replyTo,
          subject: email.subject,
          text: email.text,
          disableFileAccess: true,
          disableUrlAccess: true,
        }),
        sendDeadlineMs,
      );
      if (!acceptedByRecipient(info)) {
        log('SMTP_REJECTED');
        sendJson(res, 502, { status: 'FAILED' });
        return;
      }
      log('SMTP_ACCEPTED');
      sendJson(res, 200, { status: 'ACCEPTED' });
    } catch (error) {
      const code = error && typeof error === 'object' ? error.code : undefined;
      log(code === 'ETIMEDOUT' ? 'SMTP_TIMEOUT' : 'SMTP_ERROR');
      sendJson(res, 502, { status: 'FAILED' });
    }
  };
}

module.exports = {
  CONTACT_EMAIL_PATH,
  CONTACT_EMAIL_RECIPIENT,
  RELAY_SECRET_HEADER,
  MAX_BODY_BYTES,
  MAX_SUBJECT_LENGTH,
  MAX_TEXT_LENGTH,
  MIN_SECRET_LENGTH,
  SMTP_TIMEOUTS,
  createContactEmailHandler,
  createSmtpTransport,
  resolveContactEmailConfig,
  secretMatches,
  validateContactEmail,
};
