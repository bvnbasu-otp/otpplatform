/**
 * scripts/whatsapp-bridge: the Contact Us email relay and the WAHA proxy rules.
 *
 * Fully in-process: requests and responses are fake streams, SMTP is a fake
 * transport, and the WAHA upstream is a fake request function. No socket is
 * opened, no SMTP server is contacted and no message is sent.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Readable, Writable } from 'node:stream';
import { afterEach, describe, expect, it, vi } from 'vitest';

const BRIDGE_DIR = resolve(__dirname, '../../scripts/whatsapp-bridge');
const bridgeRequire = createRequire(join(BRIDGE_DIR, 'index.js'));
const bridge = bridgeRequire('./index.js');
const relay = bridgeRequire('./contact-email.js');

const RECIPIENT = 'bvnbasu+otp.demo.otp.support@gmail.com';
const RELAY_SECRET = 'relay-secret-SENTINEL-0123456789abcdef0123456789';
const WAHA_KEY = 'waha-key-SENTINEL-abcdef0123456789abcdef01234567';
const SMTP_PASS = 'smtp-pass-SENTINEL-app-password';
const SMTP_USER = 'otp.sender@example.com';
const ENQUIRY_TEXT = 'Message body SENTINEL with private details +919845012345';
const REPLY_TO = 'visitor.sentinel@example.com';

const SMTP_ENV: Record<string, string> = {
  CONTACT_EMAIL_RELAY_SECRET: RELAY_SECRET,
  SMTP_HOST: 'smtp.example.com',
  SMTP_PORT: '587',
  SMTP_USER,
  SMTP_PASS,
  SMTP_SECURE: 'false',
  SMTP_SENDER_NAME: 'OTP Platform',
};

function config(overrides: Record<string, string | undefined> = {}, wahaKey = WAHA_KEY) {
  const env = { ...SMTP_ENV, ...overrides };
  return relay.resolveContactEmailConfig((name: string) => env[name], wahaKey);
}

function validPayload(overrides: Record<string, unknown> = {}) {
  return {
    subject: '[OTP Contact ENQ-ABC123] Buyer enquiry — Individual, RWA or MSME: Painting quotes',
    text: `Reference: ENQ-ABC123\nEmail: ${REPLY_TO}\n\n${ENQUIRY_TEXT}`,
    replyTo: REPLY_TO,
    ...overrides,
  };
}

interface FakeRes extends Writable {
  statusCode: number;
  headers: Record<string, unknown>;
  headersSent: boolean;
  body: string;
  done: Promise<void>;
  json(): any;
}

function fakeRes(): FakeRes {
  const chunks: Buffer[] = [];
  const res = new Writable({
    write(chunk, _enc, cb) {
      chunks.push(Buffer.from(chunk));
      cb();
    },
  }) as FakeRes;
  res.statusCode = 0;
  res.headers = {};
  res.headersSent = false;
  (res as any).writeHead = (status: number, headers: Record<string, unknown> = {}) => {
    res.statusCode = status;
    res.headers = headers;
    res.headersSent = true;
    return res;
  };
  res.done = new Promise((r) => res.on('finish', () => r()));
  Object.defineProperty(res, 'body', { get: () => Buffer.concat(chunks).toString('utf8') });
  res.json = () => JSON.parse(res.body);
  return res;
}

interface FakeReq extends Readable {
  method: string;
  url: string;
  headers: Record<string, string | string[]>;
  generatedBytes: number;
}

function fakeReq(opts: { method?: string; url?: string; headers?: Record<string, string | string[]>; body?: string | Buffer; streamBytes?: number }): FakeReq {
  const body = opts.body === undefined ? Buffer.alloc(0) : Buffer.from(opts.body);
  let offset = 0;
  const chunk = 4096;
  const total = opts.streamBytes ?? body.length;
  const req = new Readable({
    highWaterMark: chunk,
    read() {
      if (offset >= total) {
        this.push(null);
        return;
      }
      const size = Math.min(chunk, total - offset);
      const piece = opts.streamBytes !== undefined ? Buffer.alloc(size, 0x61) : body.subarray(offset, offset + size);
      offset += size;
      req.generatedBytes = offset;
      this.push(piece);
    },
  }) as FakeReq;
  req.generatedBytes = 0;
  req.method = opts.method ?? 'POST';
  req.url = opts.url ?? '/contact-email';
  req.headers = { host: '127.0.0.1:3009', ...(opts.headers ?? {}) };
  return req;
}

function emailRequest(payload: unknown, headers: Record<string, string> = {}, raw?: string) {
  const body = raw ?? JSON.stringify(payload);
  return fakeReq({
    body,
    headers: {
      'content-type': 'application/json',
      'content-length': String(Buffer.byteLength(body)),
      'x-contact-relay-secret': RELAY_SECRET,
      ...headers,
    },
  });
}

function acceptingTransport(info: Record<string, unknown> = { accepted: [RECIPIENT], rejected: [] }) {
  return { sendMail: vi.fn(async () => info) };
}

async function callRelay(req: FakeReq, opts: { cfg?: unknown; transport?: unknown; sendDeadlineMs?: number } = {}) {
  const codes: string[] = [];
  const handler = relay.createContactEmailHandler({
    config: opts.cfg ?? config(),
    transport: opts.transport ?? acceptingTransport(),
    log: (code: string) => codes.push(code),
    sendDeadlineMs: opts.sendDeadlineMs,
  });
  const res = fakeRes();
  await handler(req, res);
  await res.done;
  return { res, codes };
}

function fakeUpstream(status = 201, responseBody = '{"id":"true_1@c.us_ABC"}') {
  const calls: Array<{ url: URL; opts: any; body: string }> = [];
  const request = vi.fn((url: URL, opts: any, cb: (r: Readable & { statusCode: number; headers: object }) => void) => {
    const chunks: Buffer[] = [];
    const proxyReq = new Writable({
      write(c, _e, done) {
        chunks.push(Buffer.from(c));
        done();
      },
      final(done) {
        calls.push({ url, opts, body: Buffer.concat(chunks).toString('utf8') });
        const proxyRes = Readable.from([Buffer.from(responseBody)]) as Readable & { statusCode: number; headers: object };
        proxyRes.statusCode = status;
        proxyRes.headers = { 'content-type': 'application/json' };
        cb(proxyRes);
        done();
      },
    });
    return proxyReq;
  });
  return { request, calls };
}

function bridgeHandler(opts: { apiKey?: unknown; transport?: unknown; request?: unknown } = {}) {
  return bridge.createBridgeHandler({
    apiKey: Object.prototype.hasOwnProperty.call(opts, 'apiKey') ? opts.apiKey : WAHA_KEY,
    targetBaseUrl: 'http://127.0.0.1:3008',
    contactEmail: relay.createContactEmailHandler({
      config: config(),
      transport: opts.transport ?? acceptingTransport(),
      log: () => undefined,
    }),
    request: opts.request ?? fakeUpstream().request,
  });
}

async function callBridge(handler: (req: FakeReq, res: FakeRes) => void, req: FakeReq) {
  const res = fakeRes();
  handler(req, res);
  await res.done;
  return res;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('relay configuration fails closed', () => {
  it('is enabled only with a long relay secret and complete SMTP settings', () => {
    expect(config()).toMatchObject({ enabled: true, smtp: { host: 'smtp.example.com', port: 587, secure: false, user: SMTP_USER } });
    expect(config({ CONTACT_EMAIL_RELAY_SECRET: undefined })).toEqual({ enabled: false, reason: 'RELAY_SECRET_MISSING' });
    expect(config({ CONTACT_EMAIL_RELAY_SECRET: '   ' })).toEqual({ enabled: false, reason: 'RELAY_SECRET_MISSING' });
    expect(config({ CONTACT_EMAIL_RELAY_SECRET: 'short-secret' })).toEqual({ enabled: false, reason: 'RELAY_SECRET_TOO_SHORT' });
    expect(config({ CONTACT_EMAIL_RELAY_SECRET: WAHA_KEY })).toEqual({ enabled: false, reason: 'RELAY_SECRET_REUSES_WAHA_KEY' });
    for (const name of ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS']) {
      expect(config({ [name]: undefined })).toEqual({ enabled: false, reason: 'SMTP_NOT_CONFIGURED' });
    }
    expect(config({ SMTP_PORT: '99999' })).toEqual({ enabled: false, reason: 'SMTP_PORT_INVALID' });
    expect(config({ SMTP_USER: 'not an address' })).toEqual({ enabled: false, reason: 'SMTP_USER_INVALID' });
  });

  it('treats SMTP_SECURE=true or port 465 as implicit TLS', () => {
    expect(config({ SMTP_SECURE: 'true' }).smtp.secure).toBe(true);
    expect(config({ SMTP_PORT: '465', SMTP_SECURE: undefined }).smtp.secure).toBe(true);
  });

  it('a disabled relay answers 503 and never touches SMTP', async () => {
    const transport = acceptingTransport();
    const { res, codes } = await callRelay(emailRequest(validPayload()), { cfg: config({ CONTACT_EMAIL_RELAY_SECRET: undefined }), transport });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({ status: 'NOT_CONFIGURED' });
    expect(transport.sendMail).not.toHaveBeenCalled();
    expect(codes).toEqual(['RELAY_DISABLED']);
  });
});

describe('relay authentication', () => {
  it.each([
    ['missing', {}],
    ['incorrect', { 'x-contact-relay-secret': `X${RELAY_SECRET.slice(1)}` }],
    ['unequal-length', { 'x-contact-relay-secret': `${RELAY_SECRET}x` }],
    ['empty', { 'x-contact-relay-secret': '' }],
    ['array-valued', { 'x-contact-relay-secret': [RELAY_SECRET] }],
    ['the WAHA key in the relay header', { 'x-contact-relay-secret': WAHA_KEY }],
  ])('rejects a %s relay secret with a generic 401', async (_label, headers) => {
    const transport = acceptingTransport();
    const req = emailRequest(validPayload());
    delete req.headers['x-contact-relay-secret'];
    Object.assign(req.headers, headers);
    const { res } = await callRelay(req, { transport });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ status: 'UNAUTHORIZED' });
    expect(transport.sendMail).not.toHaveBeenCalled();
  });

  it('accepts the valid relay secret', async () => {
    const transport = acceptingTransport();
    const { res } = await callRelay(emailRequest(validPayload()), { transport });
    expect(res.statusCode).toBe(200);
    expect(transport.sendMail).toHaveBeenCalledTimes(1);
  });

  it('does not accept the WAHA X-Api-Key on the email route', async () => {
    const transport = acceptingTransport();
    const req = emailRequest(validPayload(), { 'x-api-key': WAHA_KEY });
    delete req.headers['x-contact-relay-secret'];
    const res = await callBridge(bridgeHandler({ transport }), req);
    expect(res.statusCode).toBe(401);
    expect(transport.sendMail).not.toHaveBeenCalled();
  });

  it('compares the secret in constant time over equal-length digests', () => {
    const relaySrc = readFileSync(join(BRIDGE_DIR, 'contact-email.js'), 'utf8');
    const bridgeSrc = readFileSync(join(BRIDGE_DIR, 'index.js'), 'utf8');
    expect(relaySrc).toContain('crypto.timingSafeEqual(digest(provided), digest(expected))');
    expect(relaySrc).toContain("createHash('sha256')");
    expect(bridgeSrc).toContain('secretMatches(providedKey, API_KEY)');
  });
});

describe('relay request validation', () => {
  it('only POST is accepted once authenticated', async () => {
    const req = emailRequest(validPayload());
    req.method = 'GET';
    const { res } = await callRelay(req);
    expect(res.statusCode).toBe(405);
  });

  it.each(['text/plain', 'application/x-www-form-urlencoded', 'application/json; charset=latin1', ''])(
    'rejects content type %j',
    async (contentType) => {
      const { res } = await callRelay(emailRequest(validPayload(), { 'content-type': contentType }));
      expect(res.statusCode).toBe(415);
    },
  );

  it('accepts application/json with a UTF-8 charset', async () => {
    const { res } = await callRelay(emailRequest(validPayload(), { 'content-type': 'application/json; charset=utf-8' }));
    expect(res.statusCode).toBe(200);
  });

  it.each(['{', 'not json', '{"subject":', '\u0000'])('rejects malformed JSON %j', async (raw) => {
    const { res, codes } = await callRelay(emailRequest(null, {}, raw));
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ status: 'INVALID' });
    expect(codes).toEqual(['INVALID_JSON']);
  });

  it.each([[[]], ['text'], [42], [null]])('rejects a non-object body %j', async (payload) => {
    const { res } = await callRelay(emailRequest(payload));
    expect(res.statusCode).toBe(400);
  });

  it.each(['to', 'cc', 'bcc', 'from', 'sender', 'headers', 'attachments', 'html', 'envelope', 'extra'])(
    'rejects an unexpected %s field and never sends',
    async (field) => {
      const transport = acceptingTransport();
      const { res } = await callRelay(emailRequest(validPayload({ [field]: 'attacker@example.com' })), { transport });
      expect(res.statusCode).toBe(400);
      expect(transport.sendMail).not.toHaveBeenCalled();
    },
  );

  it('rejects missing fields and wrong types', async () => {
    for (const payload of [
      { subject: 's', text: 't' },
      { subject: 'Subject', replyTo: REPLY_TO },
      validPayload({ subject: 42 }),
      validPayload({ text: ['line'] }),
      validPayload({ replyTo: { address: REPLY_TO } }),
      validPayload({ subject: '' }),
      validPayload({ text: '   ' }),
    ]) {
      const { res } = await callRelay(emailRequest(payload));
      expect(res.statusCode, JSON.stringify(payload)).toBe(400);
    }
  });

  it('bounds subject and text lengths', async () => {
    expect((await callRelay(emailRequest(validPayload({ subject: 's'.repeat(relay.MAX_SUBJECT_LENGTH) })))).res.statusCode).toBe(200);
    expect((await callRelay(emailRequest(validPayload({ subject: 's'.repeat(relay.MAX_SUBJECT_LENGTH + 1) })))).res.statusCode).toBe(400);
    expect((await callRelay(emailRequest(validPayload({ text: 't'.repeat(relay.MAX_TEXT_LENGTH + 1) })))).res.statusCode).toBe(400);
  });

  it.each([
    'not-an-email',
    'a@b',
    'visitor@example.com\r\nBcc: victim@example.com',
    'visitor@example.com\nBcc: victim@example.com',
    'visitor@example.com, victim@example.com',
    '<visitor@example.com>',
    'Visitor <visitor@example.com>',
    '',
    `${'a'.repeat(250)}@example.com`,
  ])('rejects an invalid replyTo %j', async (replyTo) => {
    const transport = acceptingTransport();
    const { res } = await callRelay(emailRequest(validPayload({ replyTo })), { transport });
    expect(res.statusCode).toBe(400);
    expect(transport.sendMail).not.toHaveBeenCalled();
  });

  it.each([
    'Quote\r\nBcc: victim@example.com',
    'Quote\nTo: victim@example.com',
    'Quote\rX-Injected: 1',
    'Quote\u0000',
    'Quote\u2028Bcc: victim@example.com',
    'Quote\tTabbed',
  ])('rejects header-injection characters in the subject %j', async (subject) => {
    const transport = acceptingTransport();
    const { res } = await callRelay(emailRequest(validPayload({ subject })), { transport });
    expect(res.statusCode).toBe(400);
    expect(transport.sendMail).not.toHaveBeenCalled();
  });

  it('allows newlines in the body text but not CR or other control characters', async () => {
    expect((await callRelay(emailRequest(validPayload({ text: 'line one\nline two\ttabbed' })))).res.statusCode).toBe(200);
    expect((await callRelay(emailRequest(validPayload({ text: 'line one\r\nline two' })))).res.statusCode).toBe(400);
    expect((await callRelay(emailRequest(validPayload({ text: 'bell\u0007' })))).res.statusCode).toBe(400);
  });

  it('refuses an oversized declared body without reading it', async () => {
    const transport = acceptingTransport();
    const req = fakeReq({
      streamBytes: relay.MAX_BODY_BYTES * 4,
      headers: {
        'content-type': 'application/json',
        'content-length': String(relay.MAX_BODY_BYTES + 1),
        'x-contact-relay-secret': RELAY_SECRET,
      },
    });
    const { res, codes } = await callRelay(req, { transport });
    expect(res.statusCode).toBe(413);
    expect(codes).toEqual(['PAYLOAD_TOO_LARGE']);
    expect(req.generatedBytes).toBe(0);
    expect(req.destroyed).toBe(true);
    expect(transport.sendMail).not.toHaveBeenCalled();
  });

  it('stops reading a streamed body once it crosses the cap', async () => {
    const transport = acceptingTransport();
    const req = fakeReq({
      streamBytes: relay.MAX_BODY_BYTES * 16,
      headers: { 'content-type': 'application/json', 'x-contact-relay-secret': RELAY_SECRET },
    });
    const { res } = await callRelay(req, { transport });
    expect(res.statusCode).toBe(413);
    expect(res.headers).toMatchObject({ Connection: 'close' });
    expect(req.generatedBytes).toBeLessThan(relay.MAX_BODY_BYTES * 3);
    expect(req.destroyed).toBe(true);
    expect(transport.sendMail).not.toHaveBeenCalled();
  });
});

describe('SMTP submission', () => {
  it('sends only to the fixed recipient and reports accepted by SMTP', async () => {
    const transport = acceptingTransport();
    const { res, codes } = await callRelay(emailRequest(validPayload()), { transport });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ACCEPTED' });
    expect(codes).toEqual(['SMTP_ACCEPTED']);
    expect(transport.sendMail).toHaveBeenCalledTimes(1);
    const mail = transport.sendMail.mock.calls[0]![0] as Record<string, unknown>;
    expect(mail).toMatchObject({
      to: RECIPIENT,
      envelope: { from: SMTP_USER, to: [RECIPIENT] },
      from: { name: 'OTP Platform', address: SMTP_USER },
      replyTo: REPLY_TO,
      subject: validPayload().subject,
      text: validPayload().text,
      disableFileAccess: true,
      disableUrlAccess: true,
    });
    expect(Object.keys(mail).sort()).toEqual(
      ['disableFileAccess', 'disableUrlAccess', 'envelope', 'from', 'replyTo', 'subject', 'text', 'to'],
    );
  });

  it.each([
    ['a rejected recipient', { accepted: [], rejected: [RECIPIENT] }],
    ['a partial rejection', { accepted: [RECIPIENT], rejected: ['other@example.com'] }],
    ['rejected errors', { accepted: [RECIPIENT], rejected: [], rejectedErrors: [{ code: 'EENVELOPE' }] }],
    ['a different accepted address', { accepted: ['someone@example.com'], rejected: [] }],
    ['nothing accepted', { accepted: [], rejected: [] }],
    ['no info', null],
  ])('treats %s as FAILED', async (_label, info) => {
    const { res, codes } = await callRelay(emailRequest(validPayload()), { transport: acceptingTransport(info as never) });
    expect(res.statusCode).toBe(502);
    expect(res.json()).toEqual({ status: 'FAILED' });
    expect(codes).toEqual(['SMTP_REJECTED']);
  });

  it('times out a hung SMTP submission', async () => {
    const transport = { sendMail: vi.fn(() => new Promise(() => undefined)) };
    const { res, codes } = await callRelay(emailRequest(validPayload()), { transport, sendDeadlineMs: 20 });
    expect(res.statusCode).toBe(502);
    expect(res.json()).toEqual({ status: 'FAILED' });
    expect(codes).toEqual(['SMTP_TIMEOUT']);
  });

  it('maps a Nodemailer ETIMEDOUT error to SMTP_TIMEOUT', async () => {
    const err = Object.assign(new Error('Greeting never received'), { code: 'ETIMEDOUT' });
    const { codes } = await callRelay(emailRequest(validPayload()), { transport: { sendMail: vi.fn(async () => { throw err; }) } });
    expect(codes).toEqual(['SMTP_TIMEOUT']);
  });

  it('returns a generic FAILED for any SMTP exception', async () => {
    const err = Object.assign(new Error(`Invalid login for ${SMTP_USER} ${SMTP_PASS}`), { code: 'EAUTH' });
    const { res, codes } = await callRelay(emailRequest(validPayload()), { transport: { sendMail: vi.fn(async () => { throw err; }) } });
    expect(res.statusCode).toBe(502);
    expect(res.body).toBe('{"status":"FAILED"}');
    expect(codes).toEqual(['SMTP_ERROR']);
  });

  it('builds the Nodemailer transport with timeouts, mandatory STARTTLS and no file or URL access, without connecting', () => {
    const nodemailer = bridgeRequire('nodemailer');
    const seen: Array<Record<string, unknown>> = [];
    const wrapper = {
      createTransport: (opts: Record<string, unknown>) => {
        seen.push(opts);
        return nodemailer.createTransport(opts);
      },
    };
    const transport = relay.createSmtpTransport(config().smtp, wrapper);
    expect(seen[0]).toMatchObject({
      host: 'smtp.example.com',
      port: 587,
      secure: false,
      requireTLS: true,
      connectionTimeout: 5000,
      greetingTimeout: 5000,
      socketTimeout: 10000,
      disableFileAccess: true,
      disableUrlAccess: true,
      logger: false,
      debug: false,
    });
    expect(typeof transport.sendMail).toBe('function');
    const local = relay.createSmtpTransport({ ...config().smtp, host: '127.0.0.1', port: 1025 }, wrapper);
    expect(seen[1]).toMatchObject({ requireTLS: false });
    transport.close();
    local.close();
  });
});

describe('logging never exposes secrets or enquiry content', () => {
  it('logs only event codes across every outcome', async () => {
    const lines: string[] = [];
    const capture = (...args: unknown[]) => {
      lines.push(args.map(String).join(' '));
    };
    vi.spyOn(console, 'log').mockImplementation(capture);
    vi.spyOn(console, 'error').mockImplementation(capture);
    vi.spyOn(console, 'warn').mockImplementation(capture);
    vi.spyOn(console, 'info').mockImplementation(capture);

    const throwing = { sendMail: vi.fn(async () => { throw new Error(`${SMTP_PASS} ${ENQUIRY_TEXT} ${REPLY_TO}`); }) };
    const scenarios: Array<[FakeReq, unknown]> = [
      [emailRequest(validPayload()), acceptingTransport()],
      [emailRequest(validPayload()), acceptingTransport({ accepted: [], rejected: [RECIPIENT] })],
      [emailRequest(validPayload()), throwing],
      [emailRequest(validPayload({ to: REPLY_TO })), acceptingTransport()],
      [emailRequest(null, {}, `{"text":"${ENQUIRY_TEXT}"`), acceptingTransport()],
      [emailRequest(validPayload(), { 'x-contact-relay-secret': `${RELAY_SECRET}-wrong` }), acceptingTransport()],
    ];
    for (const [req, transport] of scenarios) {
      const handler = relay.createContactEmailHandler({ config: config(), transport });
      const res = fakeRes();
      await handler(req, res);
      await res.done;
    }
    const disabled = relay.createContactEmailHandler({ config: config({ CONTACT_EMAIL_RELAY_SECRET: undefined }) });
    const res = fakeRes();
    await disabled(emailRequest(validPayload()), res);
    await res.done;

    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      expect(line).toMatch(/^\[BRIDGE\] contact-email: [A-Z_]+$/);
      for (const secret of [RELAY_SECRET, WAHA_KEY, SMTP_PASS, SMTP_USER, ENQUIRY_TEXT, REPLY_TO, 'SENTINEL', '9845012345']) {
        expect(line).not.toContain(secret);
      }
    }
  });

  it('contact-email.js has no console call that could carry a value', () => {
    const src = readFileSync(join(BRIDGE_DIR, 'contact-email.js'), 'utf8');
    const calls = src.match(/console\.\w+\(`[^`]*`\)/g) ?? [];
    expect(src.match(/console\.\w+\(/g)).toHaveLength(1);
    expect(calls).toEqual(['console.log(`[BRIDGE] contact-email: ${code}`)']);
  });
});

describe('WAHA proxy behaviour is unchanged', () => {
  it('keeps the exact allowlist', () => {
    const allowed: Array<[string, string]> = [
      ['GET', '/api/sessions/default'],
      ['GET', '/api/sessions/otp_pilot-1'],
      ['GET', '/api/contacts/check-exists'],
      ['GET', '/health'],
      ['POST', '/api/sendText'],
    ];
    const refused: Array<[string, string]> = [
      ['POST', '/api/sessions/default'],
      ['GET', '/api/sessions/default/me'],
      ['POST', '/api/sessions/default/start'],
      ['POST', '/api/sessions/start'],
      ['GET', '/api/default/auth/qr'],
      ['GET', '/api/screenshot'],
      ['GET', '/api/sendText'],
      ['POST', '/api/sendImage'],
      ['DELETE', '/api/sessions/default'],
      ['POST', '/contact-email'],
      ['GET', '/api/sessions/../server/stop'],
    ];
    for (const [m, p] of allowed) expect(bridge.isPathAllowed(m, p), `${m} ${p}`).toBe(true);
    for (const [m, p] of refused) expect(bridge.isPathAllowed(m, p), `${m} ${p}`).toBe(false);
  });

  it.each([
    ['no key', {}],
    ['an empty key', { 'x-api-key': '' }],
    ['an incorrect key', { 'x-api-key': `X${WAHA_KEY.slice(1)}` }],
    ['an unequal-length key', { 'x-api-key': `${WAHA_KEY}x` }],
    ['an array-valued key', { 'x-api-key': [WAHA_KEY] }],
    ['the relay secret as X-Api-Key', { 'x-api-key': RELAY_SECRET }],
    ['the relay secret in its own header only', { 'x-contact-relay-secret': RELAY_SECRET }],
  ])('rejects %s on WAHA routes before proxying', async (_label, headers) => {
    const upstream = fakeUpstream();
    const res = await callBridge(
      bridgeHandler({ request: upstream.request }),
      fakeReq({ method: 'POST', url: '/api/sendText', headers, body: '{}' }),
    );
    expect(res.statusCode).toBe(401);
    expect(upstream.request).not.toHaveBeenCalled();
  });

  it('fails closed when the configured WAHA key is missing', async () => {
    const upstream = fakeUpstream();
    const res = await callBridge(
      bridgeHandler({ apiKey: undefined, request: upstream.request }),
      fakeReq({ method: 'POST', url: '/api/sendText', headers: { 'x-api-key': WAHA_KEY }, body: '{}' }),
    );
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: 'Unauthorized: invalid or missing X-Api-Key' });
    expect(upstream.request).not.toHaveBeenCalled();
  });

  it('refuses non-allowlisted paths even with a valid key', async () => {
    for (const [method, url] of [['POST', '/api/sessions/default/start'], ['GET', '/api/default/auth/qr'], ['GET', '/api/screenshot?session=default']]) {
      const upstream = fakeUpstream();
      const res = await callBridge(
        bridgeHandler({ request: upstream.request }),
        fakeReq({ method, url, headers: { 'x-api-key': WAHA_KEY } }),
      );
      expect(res.statusCode, `${method} ${url}`).toBe(403);
      expect(upstream.request).not.toHaveBeenCalled();
    }
  });

  it.each([
    ['GET', '/api/sessions/default', ''],
    ['GET', '/api/contacts/check-exists?session=default&phone=919845012345', ''],
    ['POST', '/api/sendText', '{"session":"default","chatId":"919845012345@c.us","text":"hi"}'],
  ])('still proxies %s %s to WAHA', async (method, url, body) => {
    const upstream = fakeUpstream(201, '{"ok":true}');
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const res = await callBridge(
      bridgeHandler({ request: upstream.request }),
      fakeReq({
        method,
        url,
        body,
        headers: { 'x-api-key': WAHA_KEY, 'x-contact-relay-secret': RELAY_SECRET, 'content-type': 'application/json' },
      }),
    );
    expect(res.statusCode).toBe(201);
    expect(res.body).toBe('{"ok":true}');
    expect(upstream.calls).toHaveLength(1);
    const call = upstream.calls[0]!;
    expect(call.url.toString()).toBe(`http://127.0.0.1:3008${url}`);
    expect(call.opts.method).toBe(method);
    expect(call.opts.headers['x-api-key']).toBe(WAHA_KEY);
    expect(call.opts.headers.host).toBeUndefined();
    expect(call.opts.headers['x-contact-relay-secret']).toBeUndefined();
    expect(call.body).toBe(body);
  });

  it('routes /contact-email to the relay without requiring X-Api-Key', async () => {
    const transport = acceptingTransport();
    const upstream = fakeUpstream();
    const res = await callBridge(bridgeHandler({ transport, request: upstream.request }), emailRequest(validPayload()));
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ACCEPTED' });
    expect(upstream.request).not.toHaveBeenCalled();
  });

  it('keeps the unauthenticated health probe', async () => {
    const res = await callBridge(bridgeHandler(), fakeReq({ method: 'GET', url: '/health' }));
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ok: true, bridge: 'ACTIVE' });
  });
});

describe('startup configuration', () => {
  it('reads settings from the environment first, then the local env file, stripping quotes', () => {
    const dir = mkdtempSync(join(tmpdir(), 'otp-bridge-test-'));
    try {
      const file = join(dir, '.env.test');
      writeFileSync(file, `SMTP_HOST=smtp.example.com\nSMTP_SENDER_NAME="OTP Platform"\nSMTP_PASS=${SMTP_PASS}\n`);
      const read = bridge.createSettingReader({ SMTP_HOST: 'env.example.com' }, file);
      expect(read('SMTP_HOST')).toBe('env.example.com');
      expect(read('SMTP_SENDER_NAME')).toBe('OTP Platform');
      expect(read('SMTP_PASS')).toBe(SMTP_PASS);
      expect(read('CONTACT_EMAIL_RELAY_SECRET')).toBeUndefined();
      expect(bridge.createSettingReader({}, join(dir, 'missing'))('SMTP_HOST')).toBeUndefined();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('the startup banner reports the relay state without any value', () => {
    const enabled = bridge.startupLines({ host: '127.0.0.1', port: 3009, targetBaseUrl: 'http://127.0.0.1:3008', contactEmailConfig: config() });
    const disabled = bridge.startupLines({ host: '127.0.0.1', port: 3009, targetBaseUrl: 'http://127.0.0.1:3008', contactEmailConfig: config({ SMTP_PASS: undefined }) });
    expect(enabled.at(-1)).toBe('[BRIDGE] Contact email relay: ENABLED at POST /contact-email (X-Contact-Relay-Secret enforced)');
    expect(disabled.at(-1)).toBe('[BRIDGE] Contact email relay: DISABLED (SMTP_NOT_CONFIGURED)');
    for (const line of [...enabled, ...disabled]) {
      for (const secret of [RELAY_SECRET, WAHA_KEY, SMTP_PASS, SMTP_USER, 'smtp.example.com']) expect(line).not.toContain(secret);
    }
  });

  it('stays on localhost by default, generates no secrets and touches no tunnel or hosted config', () => {
    const index = readFileSync(join(BRIDGE_DIR, 'index.js'), 'utf8');
    const contact = readFileSync(join(BRIDGE_DIR, 'contact-email.js'), 'utf8');
    expect(index).toContain("const BRIDGE_HOST = process.env.BRIDGE_HOST || '127.0.0.1';");
    expect(index).toContain('if (require.main === module)');
    for (const src of [index, contact]) {
      expect(src).not.toMatch(/child_process|\bspawn\(|\bexec(File|Sync)?\(|randomBytes|randomUUID|generateKey/);
      expect(src).not.toMatch(/supabase secrets|ngrok http|4040\/api|writeFile|appendFile/);
    }
    expect(index).not.toMatch(/console\.\w+\([^;]*\$\{[^}]*(API_KEY|apiKey|secret|pass|smtp)/i);
  });

  it('loading the module starts nothing', () => {
    expect(typeof bridge.createBridgeHandler).toBe('function');
    expect(bridge.getApiKey({ WAHA_API_KEY: ' key ' }, '/nonexistent')).toBe('key');
    expect(bridge.getApiKey({}, '/nonexistent')).toBeNull();
  });
});
