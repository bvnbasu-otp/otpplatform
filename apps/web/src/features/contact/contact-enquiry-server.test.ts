import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  CONTACT_ENQUIRY_CATEGORIES,
  CONTACT_FIELD_LIMITS,
  CONTACT_MAX_REQUEST_BYTES,
  CONTACT_NOTIFICATION_RECIPIENT,
  composeContactNotification,
  handleContactEnquiry,
  validateContactEnquiry,
  type ContactEnquiryDeps,
  type ContactNotificationEmail,
} from '../../../../../supabase/functions/_shared/contact/enquiry.ts';
import {
  issueContactClientIdentity,
  resolveContactClientIdentity,
} from '../../../../../supabase/functions/_shared/contact/client-identity.ts';
import {
  CONTACT_EMAIL_RELAY_PATH,
  CONTACT_EMAIL_RELAY_SECRET_HEADER,
  contactEmailRelayOrigin,
  createContactEmailRelayTransport,
} from '../../../../../supabase/functions/_shared/contact/email-relay.ts';
import {
  handleContactHttpRequest,
  type ContactHttpDeps,
  type ContactRateLimitResult,
} from '../../../../../supabase/functions/_shared/contact/http-handler.ts';
import { CONTACT_CATEGORIES, CONTACT_EMAIL, CONTACT_LIMITS } from './contact-details';

const ROOT = resolve(__dirname, '../../../../..');
const SUBMISSION_ID = '3f0e6a52-6d1b-4c7a-9a55-1f2b3c4d5e6f';

function body(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    submissionId: SUBMISSION_ID,
    name: 'Asha Rao',
    email: 'Asha@Example.com',
    phone: '+91 98450 12345',
    category: 'BUYER',
    organisation: 'Lakeview RWA',
    subject: 'Painting quotes for two blocks',
    message: 'We would like to understand how to request quotes for repainting.',
    website: '',
    ...overrides,
  };
}

function deps(overrides: Partial<ContactEnquiryDeps> = {}) {
  const sent: ContactNotificationEmail[] = [];
  const marks: Array<[string, string]> = [];
  const d: ContactEnquiryDeps = {
    recordEnquiry: vi.fn(async () => ({ id: 'row-1', reference: 'ENQ-ABC123', created: true, notificationStatus: 'PENDING' as const })),
    markNotification: vi.fn(async (id: string, status: string) => {
      marks.push([id, status]);
    }),
    transport: {
      send: vi.fn(async (email: ContactNotificationEmail) => {
        sent.push(email);
        return { ok: true };
      }),
    },
    ...overrides,
  };
  return { d, sent, marks };
}

describe('server validation and normalisation', () => {
  it('accepts a complete enquiry and normalises it', () => {
    const r = validateContactEnquiry(body());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toEqual({
      submissionId: SUBMISSION_ID,
      category: 'BUYER',
      name: 'Asha Rao',
      email: 'asha@example.com',
      phone: '+919845012345',
      organisation: 'Lakeview RWA',
      subject: 'Painting quotes for two blocks',
      message: 'We would like to understand how to request quotes for repainting.',
    });
  });

  it('treats phone and organisation as optional', () => {
    const r = validateContactEnquiry(body({ phone: '', organisation: '' }));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.phone).toBeNull();
      expect(r.value.organisation).toBeNull();
    }
  });

  it('requires name, email, enquiry type, subject and message', () => {
    const r = validateContactEnquiry(body({ name: ' ', email: '', category: '', subject: '', message: '' }));
    expect(r).toMatchObject({
      ok: false,
      code: 'INVALID',
      fieldErrors: { name: 'REQUIRED', email: 'REQUIRED', category: 'REQUIRED', subject: 'REQUIRED', message: 'REQUIRED' },
    });
  });

  it('rejects an enquiry type outside the allowlist', () => {
    for (const category of ['ENTERPRISE', 'buyer', 'Buyer enquiry — Individual, RWA or MSME', 7, ['BUYER']]) {
      expect(validateContactEnquiry(body({ category }))).toMatchObject({ ok: false, fieldErrors: { category: 'INVALID' } });
    }
  });

  it('rejects malformed email and phone', () => {
    for (const email of ['not-an-email', 'a@b', 'a b@example.com', 'a@example.com>', '<a@example.com>']) {
      expect(validateContactEnquiry(body({ email }))).toMatchObject({ ok: false, fieldErrors: { email: 'INVALID' } });
    }
    for (const phone of ['12345', 'call me', '+91 98450 12345 ext 9', '1'.repeat(16)]) {
      expect(validateContactEnquiry(body({ phone })).ok).toBe(false);
    }
  });

  it('rejects oversized fields and an undersized message', () => {
    const L = CONTACT_FIELD_LIMITS;
    expect(validateContactEnquiry(body({ name: 'a'.repeat(L.name + 1) }))).toMatchObject({ fieldErrors: { name: 'TOO_LONG' } });
    expect(validateContactEnquiry(body({ subject: 's'.repeat(L.subject + 1) }))).toMatchObject({ fieldErrors: { subject: 'TOO_LONG' } });
    expect(validateContactEnquiry(body({ organisation: 'o'.repeat(L.organisation + 1) }))).toMatchObject({ fieldErrors: { organisation: 'TOO_LONG' } });
    expect(validateContactEnquiry(body({ message: 'm'.repeat(L.message + 1) }))).toMatchObject({ fieldErrors: { message: 'TOO_LONG' } });
    expect(validateContactEnquiry(body({ message: 'short' }))).toMatchObject({ fieldErrors: { message: 'TOO_SHORT' } });
    expect(CONTACT_MAX_REQUEST_BYTES).toBeLessThanOrEqual(16 * 1024);
  });

  it('rejects a missing or malformed submission id and non-object bodies', () => {
    expect(validateContactEnquiry(body({ submissionId: 'retry-1' })).ok).toBe(false);
    expect(validateContactEnquiry(body({ submissionId: undefined })).ok).toBe(false);
    for (const b of [null, 'text', 42, []]) expect(validateContactEnquiry(b).ok).toBe(false);
  });

  it('rejects a filled honeypot', () => {
    expect(validateContactEnquiry(body({ website: 'https://spam.example' }))).toMatchObject({ ok: false, code: 'INVALID' });
  });

  it('strips CR/LF and control characters from single-line fields', () => {
    const r = validateContactEnquiry(body({
      name: 'Asha\r\nBcc: victim@example.com',
      subject: 'Hello\nTo: someone@example.com\u0000',
      organisation: 'Org\r\nX-Injected: 1',
    }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    for (const v of [r.value.name, r.value.subject, r.value.organisation ?? '']) {
      expect(v).not.toMatch(/[\r\n\u0000]/);
    }
    expect(r.value.name).toBe('Asha Bcc: victim@example.com');
  });

  it('refuses an email address carrying an injected header', () => {
    expect(validateContactEnquiry(body({ email: 'asha@example.com\r\nBcc: victim@example.com' })).ok).toBe(false);
  });

  it('ignores any recipient or rate-limit bucket a caller tries to supply', () => {
    const r = validateContactEnquiry(body({
      to: 'attacker@example.com',
      recipient: 'attacker@example.com',
      cc: 'x@example.com',
      clientKey: 'victim',
      bucketId: 'victim',
      p_client_key: 'victim',
    }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(JSON.stringify(r.value)).not.toContain('attacker@example.com');
    expect(JSON.stringify(r.value)).not.toContain('victim');
    expect(composeContactNotification(r.value, 'ENQ-1').to).toBe('bvnbasu+otp.demo.otp.support@gmail.com');
  });
});

describe('server-issued contact client identity', () => {
  const secret = 'contact-rate-limit-secret-at-least-32-bytes';
  const nonceA = new Uint8Array(24).fill(0x11);
  const nonceB = new Uint8Array(24).fill(0x22);

  it('gives separate server-derived identities separate opaque bucket keys', async () => {
    const first = await issueContactClientIdentity(secret, nonceA);
    const second = await issueContactClientIdentity(secret, nonceB);
    expect(first.bucketKey).toMatch(/^[0-9a-f]{64}$/);
    expect(second.bucketKey).toMatch(/^[0-9a-f]{64}$/);
    expect(first.bucketKey).not.toBe(second.bucketKey);
  });

  it('reuses a valid signed identity and replaces a caller-forged token', async () => {
    const issued = await issueContactClientIdentity(secret, nonceA);
    expect(await resolveContactClientIdentity(issued.token, secret, nonceB)).toEqual({
      ...issued,
      issued: false,
    });

    const forged = `${issued.token.slice(0, -1)}${issued.token.endsWith('0') ? '1' : '0'}`;
    const replaced = await resolveContactClientIdentity(forged, secret, nonceB);
    expect(replaced.issued).toBe(true);
    expect(replaced.token).not.toBe(forged);
    expect(replaced.bucketKey).not.toBe(issued.bucketKey);
  });

  it('fails closed when the server secret is missing or too short', async () => {
    await expect(issueContactClientIdentity('', nonceA)).rejects.toThrow(/not configured/);
    await expect(resolveContactClientIdentity('caller-selected', 'short', nonceA)).rejects.toThrow(/not configured/);
  });
});

describe('notification to the support inbox', () => {
  it('always goes to the fixed recipient, with header values on one line', () => {
    const r = validateContactEnquiry(body({ subject: 'Quote\r\nBcc: victim@example.com' }));
    if (!r.ok) throw new Error('expected valid');
    const email = composeContactNotification(r.value, 'ENQ-ABC123');
    expect(CONTACT_NOTIFICATION_RECIPIENT).toBe('bvnbasu+otp.demo.otp.support@gmail.com');
    expect(email.to).toBe('bvnbasu+otp.demo.otp.support@gmail.com');
    expect(email.replyTo).toBe('asha@example.com');
    expect(email.subject).not.toMatch(/[\r\n]/);
    expect(email.subject).toContain('ENQ-ABC123');
    expect(email.subject).toContain('Buyer enquiry — Individual, RWA or MSME');
    expect(email.subject.length).toBeLessThanOrEqual(200);
    expect(email.text).toContain('Phone: +919845012345');
  });
});

describe('request flow', () => {
  it('records, notifies once and reports SENT', async () => {
    const { d, sent, marks } = deps();
    const r = await handleContactEnquiry(body(), d);
    expect(r).toEqual({ httpStatus: 200, body: { ok: true, reference: 'ENQ-ABC123', duplicate: false, notification: 'SENT' } });
    expect(sent).toHaveLength(1);
    expect(sent[0]!.to).toBe('bvnbasu+otp.demo.otp.support@gmail.com');
    expect(marks).toEqual([['row-1', 'SENT']]);
  });

  it('keeps the record and reports FAILED truthfully when the email send fails', async () => {
    const { d, marks } = deps({ transport: { send: vi.fn(async () => ({ ok: false })) } });
    const r = await handleContactEnquiry(body(), d);
    expect(r.httpStatus).toBe(200);
    expect(r.body).toMatchObject({ ok: true, reference: 'ENQ-ABC123', notification: 'FAILED' });
    expect(marks).toEqual([['row-1', 'FAILED']]);
  });

  it('treats a throwing transport as a failed send, not a crash', async () => {
    const { d } = deps({ transport: { send: vi.fn(async () => { throw new Error('smtp down'); }) } });
    expect((await handleContactEnquiry(body(), d)).body).toMatchObject({ ok: true, notification: 'FAILED' });
  });

  it('reports NOT_CONFIGURED when no email transport exists', async () => {
    const { d, marks } = deps({ transport: null });
    const r = await handleContactEnquiry(body(), d);
    expect(r.body).toMatchObject({ ok: true, notification: 'NOT_CONFIGURED' });
    expect(marks).toEqual([['row-1', 'NOT_CONFIGURED']]);
  });

  it('fails closed when the enquiry cannot be recorded, and sends nothing', async () => {
    const { d, sent } = deps({ recordEnquiry: vi.fn(async () => null) });
    expect(await handleContactEnquiry(body(), d)).toEqual({ httpStatus: 503, body: { ok: false, code: 'NOT_RECORDED' } });
    expect(sent).toHaveLength(0);

    const thrown = deps({ recordEnquiry: vi.fn(async () => { throw new Error('relation does not exist'); }) });
    expect((await handleContactEnquiry(body(), thrown.d)).body).toEqual({ ok: false, code: 'NOT_RECORDED' });
  });

  it('a retried submission returns the first outcome without a second notification', async () => {
    const { d, sent } = deps({
      recordEnquiry: vi.fn(async () => ({ id: 'row-1', reference: 'ENQ-ABC123', created: false, notificationStatus: 'SENT' as const })),
    });
    const r = await handleContactEnquiry(body(), d);
    expect(r.body).toEqual({ ok: true, reference: 'ENQ-ABC123', duplicate: true, notification: 'SENT' });
    expect(sent).toHaveLength(0);
    expect(d.markNotification).not.toHaveBeenCalled();
  });

  it('refuses a reused submission id with a different payload as a 409 conflict, without notifying', async () => {
    const { d, sent } = deps({ recordEnquiry: vi.fn(async () => ({ conflict: true as const })) });
    const r = await handleContactEnquiry(body({ message: 'A different message under the same submission id.' }), d);
    expect(r).toEqual({ httpStatus: 409, body: { ok: false, code: 'SUBMISSION_CONFLICT' } });
    expect(r.body).not.toHaveProperty('reference');
    expect(r.body).not.toHaveProperty('duplicate');
    expect(sent).toHaveLength(0);
    expect(d.markNotification).not.toHaveBeenCalled();
  });

  it('keeps a recorded enquiry recorded when the send or mark throws synchronously', async () => {
    const { d } = deps({
      transport: { send: vi.fn(() => { throw new Error('sync send failure'); }) },
      markNotification: vi.fn(() => { throw new Error('sync mark failure'); }),
    });
    expect(await handleContactEnquiry(body(), d)).toEqual({
      httpStatus: 200,
      body: { ok: true, reference: 'ENQ-ABC123', duplicate: false, notification: 'FAILED' },
    });
  });

  it('does not persist or notify for invalid input', async () => {
    const { d, sent } = deps();
    const r = await handleContactEnquiry(body({ email: 'nope' }), d);
    expect(r.httpStatus).toBe(400);
    expect(r.body).toMatchObject({ ok: false, code: 'INVALID', fieldErrors: { email: 'INVALID' } });
    expect(d.recordEnquiry).not.toHaveBeenCalled();
    expect(d.markNotification).not.toHaveBeenCalled();
    expect(sent).toHaveLength(0);
  });
});

describe('HTTP request order (fake request, injected limiter)', () => {
  const SECRET = 'contact-rate-limit-secret-at-least-32-bytes';
  const ALLOWED = { data: { allowed: true }, error: null };

  /** A request whose every body access is recorded in `log` as `body`. */
  function fakeRequest(log: string[], method = 'POST', payload: string | Uint8Array = JSON.stringify(body()), headers: Record<string, string> = {}) {
    const bytes = typeof payload === 'string' ? new TextEncoder().encode(payload) : payload;
    const touch = () => {
      log.push('body');
      throw new Error('only the bounded stream reader may read the body');
    };
    return {
      method,
      url: 'https://functions.example.test/contact-enquiry',
      headers: new Headers({ Origin: 'http://localhost:5173', ...headers }),
      get body() {
        return {
          getReader() {
            log.push('body');
            let done = false;
            return {
              async read() {
                if (done) return { done: true, value: undefined };
                done = true;
                return { done: false, value: bytes };
              },
              async cancel() {},
            };
          },
        };
      },
      text: touch,
      json: touch,
      arrayBuffer: touch,
      formData: touch,
      blob: touch,
    } as unknown as Request;
  }

  async function harness(options: {
    limiter?: () => Promise<ContactRateLimitResult>;
    created?: boolean;
    conflict?: boolean;
    secret?: string;
  } = {}) {
    const log: string[] = [];
    const identity = await issueContactClientIdentity(SECRET, new Uint8Array(24).fill(0x33));
    const { d, sent } = deps({
      recordEnquiry: vi.fn(async () => {
        log.push('record');
        if (options.conflict) return { conflict: true as const };
        return { id: 'row-1', reference: 'ENQ-ABC123', created: options.created ?? true, notificationStatus: 'SENT' as const };
      }),
      markNotification: vi.fn(async (_id: string, status: string) => {
        log.push(`mark:${status}`);
      }),
      transport: {
        send: vi.fn(async (email: ContactNotificationEmail) => {
          log.push('email');
          sent.push(email);
          return { ok: true };
        }),
      },
    });
    const limiter = options.limiter ?? (async () => ALLOWED);
    const h: ContactHttpDeps = {
      rateLimitSecret: () => options.secret ?? SECRET,
      resolveIdentity: vi.fn(async () => {
        log.push('identity');
        return identity;
      }),
      checkRateLimit: vi.fn(async (bucketKey: string) => {
        log.push('limit');
        expect(bucketKey).toBe(identity.bucketKey);
        return limiter();
      }),
      enquiry: d,
    };
    return { h, d, log, sent, token: identity.token };
  }

  async function send(req: Request, h: ContactHttpDeps) {
    const res = await handleContactHttpRequest(req, h);
    return { status: res.status, json: await res.json().catch(() => null) as Record<string, unknown> | null };
  }

  it('answers OPTIONS and non-POST methods without identity, limiter, body, store or email', async () => {
    for (const method of ['OPTIONS', 'GET', 'PUT', 'DELETE']) {
      const { h, log, sent } = await harness();
      const res = await handleContactHttpRequest(fakeRequest(log, method), h);
      expect(res.status, method).toBe(method === 'OPTIONS' ? 200 : 405);
      expect(log, method).toEqual([]);
      expect(sent).toHaveLength(0);
    }
  });

  it('consumes the limit before the body is read, then persists before notifying', async () => {
    const { h, log, sent, token } = await harness();
    const r = await send(fakeRequest(log), h);
    expect(r).toEqual({
      status: 200,
      json: { ok: true, reference: 'ENQ-ABC123', duplicate: false, notification: 'SENT', clientToken: token },
    });
    expect(log).toEqual(['identity', 'limit', 'body', 'record', 'email', 'mark:SENT']);
    expect(sent).toHaveLength(1);
  });

  it('a duplicate submission is charged but sends no second notification', async () => {
    const { h, log, sent, token } = await harness({ created: false });
    const r = await send(fakeRequest(log), h);
    expect(r.json).toEqual({ ok: true, reference: 'ENQ-ABC123', duplicate: true, notification: 'SENT', clientToken: token });
    expect(log).toEqual(['identity', 'limit', 'body', 'record']);
    expect(sent).toHaveLength(0);
  });

  it('a reused submission id with a different payload is charged, refused with 409 and sends nothing', async () => {
    const { h, d, log, sent, token } = await harness({ conflict: true });
    const r = await send(fakeRequest(log), h);
    expect(r).toEqual({ status: 409, json: { ok: false, code: 'SUBMISSION_CONFLICT', clientToken: token } });
    expect(log).toEqual(['identity', 'limit', 'body', 'record']);
    expect(sent).toHaveLength(0);
    expect(d.markNotification).not.toHaveBeenCalled();
  });

  it('keeps the client token on the 503 when the flow throws after identity resolution', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const { h, log, sent, token } = await harness();
      const throwing = Object.defineProperty({ ...h }, 'enquiry', {
        get() {
          log.push('enquiry');
          throw new Error('unexpected');
        },
      }) as ContactHttpDeps;
      const r = await send(fakeRequest(log), throwing);
      expect(r).toEqual({ status: 503, json: { ok: false, code: 'NOT_RECORDED', clientToken: token } });
      expect(log).toEqual(['identity', 'limit', 'body', 'enquiry']);
      expect(sent).toHaveLength(0);
      expect(errors.mock.calls.flat().join(' ')).not.toMatch(/Asha|repainting|example\.com/);
    } finally {
      errors.mockRestore();
    }
  });

  const refused: Array<[string, string | Uint8Array, Record<string, string>, number]> = [
    ['malformed JSON', '{"name":', {}, 400],
    ['invalid fields', JSON.stringify(body({ email: 'nope' })), {}, 400],
    ['an oversized streamed body', 'x'.repeat(CONTACT_MAX_REQUEST_BYTES + 1), {}, 413],
    ['an oversized declared body', '{}', { 'content-length': String(CONTACT_MAX_REQUEST_BYTES + 1) }, 413],
    ['invalid UTF-8', new Uint8Array([0x7b, 0xff, 0x7d]), {}, 413],
  ];

  it.each(refused)('charges %s against the quota before refusing it', async (_label, payload, headers, status) => {
    const { h, d, log, sent, token } = await harness();
    const r = await send(fakeRequest(log, 'POST', payload, headers), h);
    expect(r.status).toBe(status);
    expect(r.json).toMatchObject({ ok: false, code: 'INVALID', clientToken: token });
    expect(log.slice(0, 2)).toEqual(['identity', 'limit']);
    expect(log).not.toContain('record');
    expect(d.recordEnquiry).not.toHaveBeenCalled();
    expect(sent).toHaveLength(0);
  });

  it('refuses a limited POST with 429 without reading the body, persisting or emailing', async () => {
    const { h, d, log, sent, token } = await harness({ limiter: async () => ({ data: { allowed: false, scope: 'CLIENT' }, error: null }) });
    const r = await send(fakeRequest(log), h);
    expect(r).toEqual({ status: 429, json: { ok: false, code: 'RATE_LIMITED', clientToken: token } });
    expect(log).toEqual(['identity', 'limit']);
    expect(d.recordEnquiry).not.toHaveBeenCalled();
    expect(sent).toHaveLength(0);
  });

  it.each([
    ['throws', async (): Promise<ContactRateLimitResult> => { throw new Error('rpc down'); }],
    ['returns an error', async () => ({ data: null, error: { message: 'function does not exist' } })],
    ['returns no data', async () => ({ data: null, error: null })],
    ['returns data without a boolean allowed', async () => ({ data: { allowed: 'yes' }, error: null })],
    ['returns non-object data', async () => ({ data: true, error: null })],
    ['returns an array', async () => ({ data: [{ allowed: true }], error: null })],
  ] as const)('fails closed with 503 when the limiter %s', async (_label, limiter) => {
    const { h, d, log, sent, token } = await harness({ limiter });
    const r = await send(fakeRequest(log), h);
    expect(r).toEqual({ status: 503, json: { ok: false, code: 'NOT_RECORDED', clientToken: token } });
    expect(log).toEqual(['identity', 'limit']);
    expect(d.recordEnquiry).not.toHaveBeenCalled();
    expect(sent).toHaveLength(0);
  });

  it('refuses every POST with 503 before identity or the limiter when the secret is missing or short', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      for (const secret of ['', 'short', ' '.repeat(40)]) {
        const { h, log } = await harness({ secret });
        const r = await send(fakeRequest(log), h);
        expect(r).toEqual({ status: 503, json: { ok: false, code: 'NOT_RECORDED' } });
        expect(log).toEqual([]);
      }
      expect(errors.mock.calls.flat().join(' ')).not.toMatch(/Asha|repainting|example\.com/);
    } finally {
      errors.mockRestore();
    }
  });
});

describe('email relay transport (fake fetch, no network)', () => {
  const RELAY_URL = 'https://relay.example.test';
  const RELAY_SECRET = 'relay-secret-SENTINEL-0123456789abcdef0123456789';

  function relayFetch(respond: (init: RequestInit) => Promise<Response> | Response) {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} });
      return respond(init ?? {});
    }) as unknown as typeof fetch;
    return { fetchImpl, calls };
  }

  const accepted = () => new Response('{"status":"ACCEPTED"}', { status: 200, headers: { 'content-type': 'application/json' } });

  function relayDeps(transport: ContactEnquiryDeps['transport'], overrides: Partial<ContactEnquiryDeps> = {}) {
    return deps({ transport, ...overrides });
  }

  it('is NOT_CONFIGURED without a valid relay URL and secret, and never calls fetch', async () => {
    const { fetchImpl } = relayFetch(accepted);
    for (const config of [
      { url: undefined, secret: RELAY_SECRET },
      { url: '', secret: RELAY_SECRET },
      { url: RELAY_URL, secret: undefined },
      { url: RELAY_URL, secret: 'too-short' },
      { url: 'http://relay.example.test', secret: RELAY_SECRET },
      { url: 'https://user:pw@relay.example.test', secret: RELAY_SECRET },
      { url: 'https://relay.example.test/contact-email', secret: RELAY_SECRET },
      { url: 'https://relay.example.test?x=1', secret: RELAY_SECRET },
      { url: 'ftp://relay.example.test', secret: RELAY_SECRET },
      { url: 'not a url', secret: RELAY_SECRET },
    ]) {
      expect(createContactEmailRelayTransport({ ...config, fetchImpl }), JSON.stringify(config.url)).toBeNull();
    }
    expect(contactEmailRelayOrigin('http://127.0.0.1:3009')).toBe('http://127.0.0.1:3009');
    expect(contactEmailRelayOrigin(' https://relay.example.test/ ')).toBe('https://relay.example.test');

    const { d, marks } = relayDeps(createContactEmailRelayTransport({ url: undefined, secret: RELAY_SECRET, fetchImpl }));
    const r = await handleContactEnquiry(body(), d);
    expect(r.body).toMatchObject({ ok: true, notification: 'NOT_CONFIGURED' });
    expect(marks).toEqual([['row-1', 'NOT_CONFIGURED']]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('records first, then posts only subject, text and replyTo to the relay, and reports SENT on SMTP acceptance', async () => {
    const order: string[] = [];
    const { fetchImpl, calls } = relayFetch(() => {
      order.push('relay');
      return accepted();
    });
    const transport = createContactEmailRelayTransport({ url: RELAY_URL, secret: RELAY_SECRET, fetchImpl });
    const { d, marks } = relayDeps(transport, {
      recordEnquiry: vi.fn(async () => {
        order.push('record');
        return { id: 'row-1', reference: 'ENQ-ABC123', created: true, notificationStatus: 'PENDING' as const };
      }),
      markNotification: vi.fn(async (id: string, status: string) => {
        order.push(`mark:${status}`);
        marks.push([id, status]);
      }),
    });

    const r = await handleContactEnquiry(body(), d);
    expect(r).toEqual({ httpStatus: 200, body: { ok: true, reference: 'ENQ-ABC123', duplicate: false, notification: 'SENT' } });
    expect(order).toEqual(['record', 'relay', 'mark:SENT']);

    expect(calls).toHaveLength(1);
    const { url, init } = calls[0]!;
    expect(url).toBe(`${RELAY_URL}${CONTACT_EMAIL_RELAY_PATH}`);
    expect(init.method).toBe('POST');
    expect(init.redirect).toBe('error');
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect((init.headers as Record<string, string>)[CONTACT_EMAIL_RELAY_SECRET_HEADER]).toBe(RELAY_SECRET);
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json; charset=utf-8');
    const sent = JSON.parse(String(init.body));
    expect(Object.keys(sent).sort()).toEqual(['replyTo', 'subject', 'text']);
    expect(sent.replyTo).toBe('asha@example.com');
    expect(sent.subject).toContain('ENQ-ABC123');

    const visible = JSON.stringify(r.body);
    expect(visible).not.toContain(RELAY_SECRET);
    expect(visible).not.toContain('repainting');
    expect(visible).not.toMatch(/deliver/i);
  });

  it('adds the ngrok interstitial bypass header only for ngrok hosts', async () => {
    const { fetchImpl, calls } = relayFetch(accepted);
    const validated = validateContactEnquiry(body());
    if (!validated.ok) throw new Error('expected valid');
    const notice = composeContactNotification(validated.value, 'ENQ-1');
    await createContactEmailRelayTransport({ url: 'https://bridge.ngrok-free.dev', secret: RELAY_SECRET, fetchImpl })!.send(notice);
    await createContactEmailRelayTransport({ url: RELAY_URL, secret: RELAY_SECRET, fetchImpl })!.send(notice);
    expect((calls[0]!.init.headers as Record<string, string>)['ngrok-skip-browser-warning']).toBe('true');
    expect((calls[1]!.init.headers as Record<string, string>)['ngrok-skip-browser-warning']).toBeUndefined();
  });

  it.each([
    ['a 502 FAILED', () => new Response('{"status":"FAILED"}', { status: 502 })],
    ['a 401', () => new Response('{"status":"UNAUTHORIZED"}', { status: 401 })],
    ['a 503 disabled relay', () => new Response('{"status":"NOT_CONFIGURED"}', { status: 503 })],
    ['a 200 without acceptance', () => new Response('{"status":"FAILED"}', { status: 200 })],
    ['a 200 with a non-JSON body', () => new Response('<html>ngrok</html>', { status: 200 })],
    ['a 200 with an oversized body', () => new Response(JSON.stringify({ status: 'ACCEPTED', pad: 'x'.repeat(2000) }), { status: 200 })],
    ['a redirect', () => new Response(null, { status: 302, headers: { location: 'https://elsewhere.example' } })],
    ['a network error', () => { throw new TypeError('fetch failed'); }],
  ])('keeps the record and reports FAILED on %s', async (_label, respond) => {
    const { fetchImpl } = relayFetch(respond as () => Response);
    const { d, marks } = relayDeps(createContactEmailRelayTransport({ url: RELAY_URL, secret: RELAY_SECRET, fetchImpl }));
    const r = await handleContactEnquiry(body(), d);
    expect(r).toEqual({ httpStatus: 200, body: { ok: true, reference: 'ENQ-ABC123', duplicate: false, notification: 'FAILED' } });
    expect(marks).toEqual([['row-1', 'FAILED']]);
  });

  it('aborts a hung relay call and reports FAILED', async () => {
    let aborted = false;
    const fetchImpl = vi.fn((_url: string, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => {
        aborted = true;
        reject(new DOMException('The operation was aborted.', 'AbortError'));
      });
    })) as unknown as typeof fetch;
    const transport = createContactEmailRelayTransport({ url: RELAY_URL, secret: RELAY_SECRET, fetchImpl, timeoutMs: 20 });
    const { d, marks } = relayDeps(transport);
    const r = await handleContactEnquiry(body(), d);
    expect(aborted).toBe(true);
    expect(r.body).toMatchObject({ ok: true, notification: 'FAILED' });
    expect(marks).toEqual([['row-1', 'FAILED']]);
  });

  it('does not call the relay again for a duplicate submission', async () => {
    const { fetchImpl } = relayFetch(accepted);
    const { d } = relayDeps(createContactEmailRelayTransport({ url: RELAY_URL, secret: RELAY_SECRET, fetchImpl }), {
      recordEnquiry: vi.fn(async () => ({ id: 'row-1', reference: 'ENQ-ABC123', created: false, notificationStatus: 'FAILED' as const })),
    });
    const r = await handleContactEnquiry(body(), d);
    expect(r.body).toEqual({ ok: true, reference: 'ENQ-ABC123', duplicate: true, notification: 'FAILED' });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(d.markNotification).not.toHaveBeenCalled();
  });

  it('never calls the relay when the enquiry was not recorded', async () => {
    const { fetchImpl } = relayFetch(accepted);
    const { d } = relayDeps(createContactEmailRelayTransport({ url: RELAY_URL, secret: RELAY_SECRET, fetchImpl }), {
      recordEnquiry: vi.fn(async () => null),
    });
    expect((await handleContactEnquiry(body(), d)).body).toEqual({ ok: false, code: 'NOT_RECORDED' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('refuses a notice addressed to anyone but the fixed recipient', async () => {
    const { fetchImpl } = relayFetch(accepted);
    const transport = createContactEmailRelayTransport({ url: RELAY_URL, secret: RELAY_SECRET, fetchImpl })!;
    const r = await transport.send({ to: 'attacker@example.com' as never, replyTo: 'a@example.com', subject: 's', text: 't' });
    expect(r).toEqual({ ok: false });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('the relay client never logs', () => {
    const src = readFileSync(resolve(ROOT, 'supabase/functions/_shared/contact/email-relay.ts'), 'utf8');
    expect(src).not.toMatch(/console\./);
  });
});

describe('client and server agree', () => {
  it('on the five categories, the limits and the support address', () => {
    expect(CONTACT_CATEGORIES.map((c) => [c.code, c.label])).toEqual(CONTACT_ENQUIRY_CATEGORIES.map((c) => [c.code, c.label]));
    expect(CONTACT_LIMITS).toEqual(CONTACT_FIELD_LIMITS);
    expect(CONTACT_EMAIL).toBe(CONTACT_NOTIFICATION_RECIPIENT);
  });
});

describe('edge function wiring', () => {
  const fn = readFileSync(resolve(ROOT, 'supabase/functions/contact-enquiry/index.ts'), 'utf8');
  const handler = readFileSync(resolve(ROOT, 'supabase/functions/_shared/contact/http-handler.ts'), 'utf8');

  it('uses the service-role-only RPCs, the dedicated atomic limiter and a size cap', () => {
    expect(fn).toContain("db.rpc('submit_contact_enquiry'");
    expect(fn).toContain("db.rpc('mark_contact_enquiry_notification'");
    expect(fn).toContain("db.rpc('check_contact_enquiry_rate_limit'");
    expect(fn).toContain('handleContactHttpRequest(req, deps)');
    expect(handler).toContain('CONTACT_MAX_REQUEST_BYTES');
  });

  it('maps the RPC SUBMISSION_CONFLICT result to a conflict, not a recorded enquiry', () => {
    expect(fn).toContain("if (!error && data?.result === 'SUBMISSION_CONFLICT') return { conflict: true };");
    expect(fn.indexOf("data?.result === 'SUBMISSION_CONFLICT'")).toBeLessThan(fn.indexOf('created: data.created === true'));
  });

  it('keeps the HTTP flow free of the Supabase client and the server bootstrap', () => {
    expect(handler).not.toMatch(/esm\.sh|npm:|supabase-js|createClient|Deno\.serve|Deno\.env/);
  });

  it('uses only a signed client credential and trusts no network identity header', () => {
    expect(fn).toContain("Deno.env.get('CONTACT_RATE_LIMIT_SECRET')");
    expect(fn).toContain("req.headers.get('x-otp-contact-client-token')");
    expect(fn).toContain('resolveContactClientIdentity');
    expect(fn).not.toMatch(/x-forwarded-for|cf-connecting-ip|x-real-ip/i);
    expect(fn).not.toMatch(/p_client_key:\s*(?:body|req|enquiry)/i);
  });

  it('bounds the streamed UTF-8 body before parsing', () => {
    expect(handler).toContain('req.body?.getReader()');
    expect(handler).toContain('received > CONTACT_MAX_REQUEST_BYTES');
    expect(fn).not.toMatch(/req\.(text|json|arrayBuffer|body)\b/);
    expect(handler).not.toContain('await req.text()');
  });

  it('takes no recipient from the request and wires only the dedicated email relay', () => {
    expect(fn).not.toMatch(/body\.(to|recipient|cc|bcc)/i);
    expect(fn).toContain('transport: createContactEmailRelayTransport({');
    expect(fn).toContain("url: Deno.env.get('CONTACT_EMAIL_RELAY_URL')");
    expect(fn).toContain("secret: Deno.env.get('CONTACT_EMAIL_RELAY_SECRET')");
    expect(fn).not.toMatch(/SMTP_|nodemailer|WAHA_BASE_URL|WAHA_API_KEY/);
  });

  it('never logs message bodies or contact details', () => {
    for (const call of `${fn}\n${handler}`.match(/console\.\w+\([^)]*\)/g) ?? []) {
      expect(call).not.toMatch(/message|email|phone|name|body|enquiry\./i);
    }
  });

  it('does not touch WhatsApp, WAHA or SMS', () => {
    expect(`${fn}\n${handler}`).not.toMatch(/waha|whatsapp|messaging|sms/i);
  });
});
