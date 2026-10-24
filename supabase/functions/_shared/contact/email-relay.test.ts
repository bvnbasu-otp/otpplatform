/**
 * Contact Us email relay client — Deno runtime coverage with a fake fetch.
 * No network is used and nothing is sent.
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { composeContactNotification, handleContactEnquiry, validateContactEnquiry } from './enquiry.ts';
import type { ContactEnquiryDeps, ContactEmailTransport } from './enquiry.ts';
import {
  CONTACT_EMAIL_RELAY_SECRET_HEADER,
  contactEmailRelayOrigin,
  createContactEmailRelayTransport,
} from './email-relay.ts';

const RELAY_URL = 'https://relay.example.test';
const RELAY_SECRET = 'relay-secret-0123456789abcdef0123456789abcdef';

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

function fakeFetch(respond: (init: RequestInit) => Response | Promise<Response>) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fetchImpl = ((url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return Promise.resolve().then(() => respond(init ?? {}));
  }) as typeof fetch;
  return { fetchImpl, calls };
}

function deps(transport: ContactEmailTransport | null, created = true) {
  const order: string[] = [];
  const d: ContactEnquiryDeps = {
    recordEnquiry: () => {
      order.push('record');
      return Promise.resolve({ id: 'row-1', reference: 'ENQ-1', created, notificationStatus: 'PENDING' });
    },
    markNotification: (_id, status) => {
      order.push(`mark:${status}`);
      return Promise.resolve();
    },
    transport,
  };
  return { d, order };
}

Deno.test('relay is NOT_CONFIGURED without a valid origin and a long secret', async () => {
  const { fetchImpl, calls } = fakeFetch(() => new Response('{"status":"ACCEPTED"}'));
  assertEquals(createContactEmailRelayTransport({ url: undefined, secret: RELAY_SECRET, fetchImpl }), null);
  assertEquals(createContactEmailRelayTransport({ url: RELAY_URL, secret: 'short', fetchImpl }), null);
  assertEquals(contactEmailRelayOrigin('http://relay.example.test'), null);
  assertEquals(contactEmailRelayOrigin('https://relay.example.test/path'), null);
  assertEquals(contactEmailRelayOrigin('http://127.0.0.1:3009'), 'http://127.0.0.1:3009');

  const { d, order } = deps(null);
  const r = await handleContactEnquiry(BODY, d);
  assertEquals(r.body, { ok: true, reference: 'ENQ-1', duplicate: false, notification: 'NOT_CONFIGURED' });
  assertEquals(order, ['record', 'mark:NOT_CONFIGURED']);
  assertEquals(calls.length, 0);
});

Deno.test('relay SENT only on ACCEPTED, after the record is saved', async () => {
  const { fetchImpl, calls } = fakeFetch(() => new Response('{"status":"ACCEPTED"}', { status: 200 }));
  const { d, order } = deps(createContactEmailRelayTransport({ url: RELAY_URL, secret: RELAY_SECRET, fetchImpl }));
  const r = await handleContactEnquiry(BODY, d);
  assertEquals(r.body, { ok: true, reference: 'ENQ-1', duplicate: false, notification: 'SENT' });
  assertEquals(order, ['record', 'mark:SENT']);
  assertEquals(calls[0]!.url, `${RELAY_URL}/contact-email`);
  assertEquals((calls[0]!.init.headers as Record<string, string>)[CONTACT_EMAIL_RELAY_SECRET_HEADER], RELAY_SECRET);
  assertEquals(Object.keys(JSON.parse(String(calls[0]!.init.body))).sort(), ['replyTo', 'subject', 'text']);
});

Deno.test('relay FAILED on a non-success status, a non-accepting body or a thrown fetch', async () => {
  for (
    const respond of [
      () => new Response('{"status":"FAILED"}', { status: 502 }),
      () => new Response('{"status":"FAILED"}', { status: 200 }),
      () => new Response('not json', { status: 200 }),
      (): Response => {
        throw new TypeError('network');
      },
    ]
  ) {
    const { fetchImpl } = fakeFetch(respond);
    const { d, order } = deps(createContactEmailRelayTransport({ url: RELAY_URL, secret: RELAY_SECRET, fetchImpl }));
    const r = await handleContactEnquiry(BODY, d);
    assertEquals(r.body, { ok: true, reference: 'ENQ-1', duplicate: false, notification: 'FAILED' });
    assertEquals(order, ['record', 'mark:FAILED']);
  }
});

Deno.test('relay bounds a streamed success response even without content-length', async () => {
  let generated = 0;
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      generated += 512;
      controller.enqueue(new Uint8Array(512));
      if (generated >= 64 * 1024) controller.close();
    },
    cancel() {
      cancelled = true;
    },
  });
  const { fetchImpl } = fakeFetch(() => new Response(body, { status: 200 }));
  const transport = createContactEmailRelayTransport({ url: RELAY_URL, secret: RELAY_SECRET, fetchImpl })!;
  const validated = validateContactEnquiry(BODY);
  if (!validated.ok) throw new Error('expected valid');
  assertEquals(await transport.send(composeContactNotification(validated.value, 'ENQ-1')), { ok: false });
  assertEquals(cancelled, true);
  assertEquals(generated < 64 * 1024, true);
});

Deno.test('relay FAILED when the call times out', async () => {
  const fetchImpl = ((_url: string, init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    })) as unknown as typeof fetch;
  const transport = createContactEmailRelayTransport({ url: RELAY_URL, secret: RELAY_SECRET, fetchImpl, timeoutMs: 20 })!;
  const validated = validateContactEnquiry(BODY);
  if (!validated.ok) throw new Error('expected valid');
  assertEquals(await transport.send(composeContactNotification(validated.value, 'ENQ-1')), { ok: false });
});

Deno.test('a submission id conflict does not call the relay or mark a notification', async () => {
  const { fetchImpl, calls } = fakeFetch(() => new Response('{"status":"ACCEPTED"}'));
  const { d, order } = deps(createContactEmailRelayTransport({ url: RELAY_URL, secret: RELAY_SECRET, fetchImpl }));
  d.recordEnquiry = () => {
    order.push('record');
    return Promise.resolve({ conflict: true });
  };
  const r = await handleContactEnquiry(BODY, d);
  assertEquals(r, { httpStatus: 409, body: { ok: false, code: 'SUBMISSION_CONFLICT' } });
  assertEquals(order, ['record']);
  assertEquals(calls.length, 0);
});

Deno.test('a duplicate submission does not call the relay', async () => {
  const { fetchImpl, calls } = fakeFetch(() => new Response('{"status":"ACCEPTED"}'));
  const { d, order } = deps(createContactEmailRelayTransport({ url: RELAY_URL, secret: RELAY_SECRET, fetchImpl }), false);
  const r = await handleContactEnquiry(BODY, d);
  assertEquals(r.body, { ok: true, reference: 'ENQ-1', duplicate: true, notification: 'PENDING' });
  assertEquals(order, ['record']);
  assertEquals(calls.length, 0);
});
