/**
 * Contact Us HTTP flow — Deno runtime coverage with injected fakes. Nothing
 * here opens a network connection, touches a database or sends email.
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { issueContactClientIdentity } from './client-identity.ts';
import { CONTACT_MAX_REQUEST_BYTES, type ContactEnquiryDeps } from './enquiry.ts';
import { type ContactHttpDeps, type ContactRateLimitResult, handleContactHttpRequest } from './http-handler.ts';

const SECRET = 'contact-rate-limit-secret-at-least-32-bytes';
const BODY = {
  submissionId: '3f0e6a52-6d1b-4c7a-9a55-1f2b3c4d5e6f',
  name: 'Asha Rao',
  email: 'asha@example.com',
  phone: '',
  category: 'BUYER',
  organisation: '',
  subject: 'Painting quotes',
  message: 'We would like to understand how to request quotes.',
  website: '',
};

/** A request whose body accesses are all recorded in `log` as `body`. */
function fakeRequest(
  log: string[],
  method = 'POST',
  payload: string | Uint8Array = JSON.stringify(BODY),
  headers: Record<string, string> = {},
): Request {
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
            read() {
              if (done) return Promise.resolve({ done: true, value: undefined });
              done = true;
              return Promise.resolve({ done: false, value: bytes });
            },
            cancel: () => Promise.resolve(),
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
  record?: ContactEnquiryDeps['recordEnquiry'];
} = {}) {
  const log: string[] = [];
  const identity = await issueContactClientIdentity(SECRET, new Uint8Array(24).fill(0x44));
  const enquiry: ContactEnquiryDeps = {
    recordEnquiry: (value) => {
      log.push('record');
      if (options.record) return options.record(value);
      return Promise.resolve({
        id: 'row-1',
        reference: 'ENQ-1',
        created: options.created ?? true,
        notificationStatus: 'SENT',
      });
    },
    markNotification: (_id, status) => {
      log.push(`mark:${status}`);
      return Promise.resolve();
    },
    transport: {
      send: () => {
        log.push('email');
        return Promise.resolve({ ok: true });
      },
    },
  };
  const limiter = options.limiter ?? (() => Promise.resolve({ data: { allowed: true }, error: null }));
  const deps: ContactHttpDeps = {
    rateLimitSecret: () => SECRET,
    resolveIdentity: () => {
      log.push('identity');
      return Promise.resolve(identity);
    },
    checkRateLimit: (bucketKey) => {
      log.push('limit');
      assertEquals(bucketKey, identity.bucketKey);
      return limiter();
    },
    enquiry,
  };
  return { deps, log, token: identity.token };
}

async function send(req: Request, deps: ContactHttpDeps) {
  const res = await handleContactHttpRequest(req, deps);
  return { status: res.status, json: await res.json().catch(() => null) };
}

Deno.test('OPTIONS and GET never reach identity, the limiter, the body, the store or email', async () => {
  for (const [method, status] of [['OPTIONS', 200], ['GET', 405]] as const) {
    const { deps, log } = await harness();
    const res = await handleContactHttpRequest(fakeRequest(log, method), deps);
    await res.body?.cancel();
    assertEquals(res.status, status);
    assertEquals(log, []);
  }
});

Deno.test('a valid POST is charged before its body is read, and is stored before email', async () => {
  const { deps, log, token } = await harness();
  const r = await send(fakeRequest(log), deps);
  assertEquals(r, {
    status: 200,
    json: { ok: true, reference: 'ENQ-1', duplicate: false, notification: 'SENT', clientToken: token },
  });
  assertEquals(log, ['identity', 'limit', 'body', 'record', 'email', 'mark:SENT']);
});

Deno.test('a real Request with a JSON body completes the same flow', async () => {
  const { deps, log, token } = await harness();
  const req = new Request('https://functions.example.test/contact-enquiry', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(BODY),
  });
  const r = await send(req, deps);
  assertEquals(r.status, 200);
  assertEquals((r.json as { clientToken?: string }).clientToken, token);
  assertEquals(log, ['identity', 'limit', 'record', 'email', 'mark:SENT']);
});

Deno.test('a duplicate submission sends no second notification', async () => {
  const { deps, log, token } = await harness({ created: false });
  const r = await send(fakeRequest(log), deps);
  assertEquals(r.json, { ok: true, reference: 'ENQ-1', duplicate: true, notification: 'SENT', clientToken: token });
  assertEquals(log, ['identity', 'limit', 'body', 'record']);
});

Deno.test('a reused submission id with a different payload is a 409 conflict, never success, and sends nothing', async () => {
  const { deps, log, token } = await harness({ record: () => Promise.resolve({ conflict: true as const }) });
  const r = await send(fakeRequest(log), deps);
  assertEquals(r, { status: 409, json: { ok: false, code: 'SUBMISSION_CONFLICT', clientToken: token } });
  assertEquals(log, ['identity', 'limit', 'body', 'record']);
});

Deno.test('an unexpected failure after identity resolution keeps the client token on the 503', async () => {
  const { deps, log, token } = await harness();
  const throwing: ContactHttpDeps = {
    ...deps,
    get enquiry(): ContactEnquiryDeps {
      log.push('enquiry');
      throw new Error('unexpected');
    },
  };
  const original = console.error;
  console.error = () => undefined;
  try {
    const r = await send(fakeRequest(log), throwing);
    assertEquals(r, { status: 503, json: { ok: false, code: 'NOT_RECORDED', clientToken: token } });
    assertEquals(log, ['identity', 'limit', 'body', 'enquiry']);
  } finally {
    console.error = original;
  }
});

Deno.test('a synchronously throwing store is NOT_RECORDED; a throwing send after recording stays recorded', async () => {
  const store = await harness({
    record: () => {
      throw new Error('sync store failure');
    },
  });
  const notRecorded = await send(fakeRequest(store.log), store.deps);
  assertEquals(notRecorded, { status: 503, json: { ok: false, code: 'NOT_RECORDED', clientToken: store.token } });
  assertEquals(store.log.includes('email'), false);

  const mail = await harness();
  mail.deps.enquiry.transport = {
    send: () => {
      mail.log.push('email');
      throw new Error('sync send failure');
    },
  };
  const recorded = await send(fakeRequest(mail.log), mail.deps);
  assertEquals(recorded, {
    status: 200,
    json: { ok: true, reference: 'ENQ-1', duplicate: false, notification: 'FAILED', clientToken: mail.token },
  });
  assertEquals(mail.log, ['identity', 'limit', 'body', 'record', 'email', 'mark:FAILED']);
});

Deno.test('malformed, invalid and oversized bodies consume quota before 400/413', async () => {
  const cases: Array<[string | Uint8Array, Record<string, string>, number]> = [
    ['{"name":', {}, 400],
    [JSON.stringify({ ...BODY, email: 'nope' }), {}, 400],
    ['x'.repeat(CONTACT_MAX_REQUEST_BYTES + 1), {}, 413],
    ['{}', { 'content-length': String(CONTACT_MAX_REQUEST_BYTES + 1) }, 413],
    [new Uint8Array([0x7b, 0xff, 0x7d]), {}, 413],
  ];
  for (const [payload, headers, status] of cases) {
    const { deps, log, token } = await harness();
    const r = await send(fakeRequest(log, 'POST', payload, headers), deps);
    assertEquals(r.status, status);
    assertEquals((r.json as { code?: string }).code, 'INVALID');
    assertEquals((r.json as { clientToken?: string }).clientToken, token);
    assertEquals(log.slice(0, 2), ['identity', 'limit']);
    assertEquals(log.includes('record') || log.includes('email'), false);
  }
});

Deno.test('a limited POST gets 429 without a body read, a record or email', async () => {
  const { deps, log, token } = await harness({
    limiter: () => Promise.resolve({ data: { allowed: false, scope: 'ENDPOINT' }, error: null }),
  });
  const r = await send(fakeRequest(log), deps);
  assertEquals(r, { status: 429, json: { ok: false, code: 'RATE_LIMITED', clientToken: token } });
  assertEquals(log, ['identity', 'limit']);
});

Deno.test('a failing or unusable limiter fails closed with 503 and reads nothing', async () => {
  const limiters: Array<() => Promise<ContactRateLimitResult>> = [
    () => Promise.reject(new Error('rpc down')),
    () => {
      throw new Error('synchronous failure');
    },
    () => Promise.resolve({ data: null, error: { message: 'function does not exist' } }),
    () => Promise.resolve({ data: { allowed: true }, error: { message: 'partial' } }),
    () => Promise.resolve({ data: null, error: null }),
    () => Promise.resolve({ data: {}, error: null }),
    () => Promise.resolve({ data: 'allowed', error: null }),
  ];
  for (const limiter of limiters) {
    const { deps, log, token } = await harness({ limiter });
    const r = await send(fakeRequest(log), deps);
    assertEquals(r, { status: 503, json: { ok: false, code: 'NOT_RECORDED', clientToken: token } });
    assertEquals(log, ['identity', 'limit']);
  }
});
