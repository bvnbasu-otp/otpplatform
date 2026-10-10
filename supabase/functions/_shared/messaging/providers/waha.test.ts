/**
 * WAHA request construction and failure paths. Fetch is injected, so these
 * tests do not open a socket and do not send WhatsApp.
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { WahaMessagingProvider, wahaTunnelHeaders } from './waha.ts';
import type { OutboundMessage } from '../types.ts';

const BASE = 'http://127.0.0.1:3008';
const MESSAGE: OutboundMessage = {
  to: '+919876543210',
  channel: 'WHATSAPP',
  body: 'Pilot notice',
};

interface Captured {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | undefined;
}

function jsonResponse(status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Fresh Response per test — bodies are single-use. */
function sessionWorking(): Response {
  return jsonResponse(200, { name: 'default', status: 'WORKING' });
}

function checkExistsLegacy(): Response {
  return jsonResponse(200, { numberExists: false });
}

function workingSessionThen(responses: Response[]): Response[] {
  return [sessionWorking(), checkExistsLegacy(), ...responses];
}

function scripted(responses: Response[]): { fetchImpl: typeof fetch; calls: Captured[] } {
  const calls: Captured[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const headers: Record<string, string> = {};
    new Headers(init?.headers).forEach((value, key) => {
      headers[key] = value;
    });
    calls.push({
      url: String(input),
      method: init?.method ?? 'GET',
      headers,
      body: typeof init?.body === 'string' ? init.body : undefined,
    });
    const next = responses.shift();
    if (!next) throw new Error('unexpected fetch');
    return next;
  };
  return { fetchImpl, calls };
}

function provider(fetchImpl: typeof fetch): WahaMessagingProvider {
  return new WahaMessagingProvider({ baseUrl: BASE, session: 'default', fetchImpl });
}

Deno.test('WAHA send uses the session check and sendText contract', async () => {
  const { fetchImpl, calls } = scripted(workingSessionThen([
    jsonResponse(200, { id: 'waha-msg-1' }),
  ]));

  const receipt = await provider(fetchImpl).send(MESSAGE);

  assertEquals(receipt.status, 'SENT');
  assertEquals(receipt.provider, 'WAHA');
  assertEquals(receipt.externalMessageId, 'waha-msg-1');
  assertEquals(calls.length, 3);
  assertEquals(calls[0].url, `${BASE}/api/sessions/default`);
  assertEquals(calls[1].url.includes('/api/contacts/check-exists'), true);
  assertEquals(calls[2].method, 'POST');
  assertEquals(calls[2].url, `${BASE}/api/sendText`);
  assertEquals(JSON.parse(calls[2].body ?? '{}'), {
    session: 'default',
    chatId: '919876543210@c.us',
    text: 'Pilot notice',
  });
});

Deno.test('WAHA send uses LID chatId from check-exists when present', async () => {
  const { fetchImpl, calls } = scripted([
    sessionWorking(),
    jsonResponse(200, { numberExists: true, chatId: '33251787841621@lid' }),
    jsonResponse(201, {}),
  ]);
  const receipt = await provider(fetchImpl).send(MESSAGE);
  assertEquals(receipt.status, 'SENT');
  assertEquals(JSON.parse(calls[2].body ?? '{}').chatId, '33251787841621@lid');
});

Deno.test('WAHA accepts a message id nested under key.id', async () => {
  const { fetchImpl } = scripted(workingSessionThen([
    jsonResponse(200, { key: { id: 'nested-id' } }),
  ]));
  const receipt = await provider(fetchImpl).send(MESSAGE);
  assertEquals(receipt.externalMessageId, 'nested-id');
});

Deno.test('WAHA treats an empty 201 send body as SENT', async () => {
  const { fetchImpl } = scripted(workingSessionThen([
    new Response(null, { status: 201 }),
  ]));
  const receipt = await provider(fetchImpl).send(MESSAGE);
  assertEquals(receipt.status, 'SENT');
  assertEquals(receipt.externalMessageId, null);
});

Deno.test('WAHA treats a non-JSON send body as SENT when status is ok', async () => {
  const { fetchImpl } = scripted(workingSessionThen([
    new Response('not-json', { status: 201 }),
  ]));
  const receipt = await provider(fetchImpl).send(MESSAGE);
  assertEquals(receipt.status, 'SENT');
  assertEquals(receipt.externalMessageId, null);
});

Deno.test('WAHA rejects an ngrok HTML interstitial on send', async () => {
  const { fetchImpl } = scripted(workingSessionThen([
    new Response('<html>ngrok</html>', { status: 200, headers: { 'Content-Type': 'text/html' } }),
  ]));
  const receipt = await provider(fetchImpl).send(MESSAGE);
  assertEquals(receipt.status, 'FAILED');
  assertEquals(receipt.failureReason, 'WAHA returned a non-JSON response');
});

Deno.test('WAHA adds ngrok-skip-browser-warning for ngrok hosts', async () => {
  assertEquals(wahaTunnelHeaders('https://abc.ngrok-free.dev')['ngrok-skip-browser-warning'], 'true');
  assertEquals(wahaTunnelHeaders('http://127.0.0.1:3008')['ngrok-skip-browser-warning'], undefined);

  const ngrokBase = 'https://tunnel.ngrok-free.app';
  const { fetchImpl, calls } = scripted(workingSessionThen([
    jsonResponse(200, { id: 'x' }),
  ]));
  await new WahaMessagingProvider({ baseUrl: ngrokBase, session: 'default', fetchImpl }).send(MESSAGE);
  assertEquals(calls[0].headers['ngrok-skip-browser-warning'], 'true');
  assertEquals(calls[1].headers['ngrok-skip-browser-warning'], 'true');
  assertEquals(calls[2].headers['ngrok-skip-browser-warning'], 'true');
});

Deno.test('WAHA reports 4xx without the response body', async () => {
  const secret = 'waha-response-secret';
  const { fetchImpl } = scripted(workingSessionThen([
    jsonResponse(400, { error: secret }),
  ]));
  const receipt = await provider(fetchImpl).send(MESSAGE);
  assertEquals(receipt.status, 'FAILED');
  assertEquals(receipt.failureReason, 'WAHA returned 400');
  assertEquals(receipt.failureReason?.includes(secret), false);
});

Deno.test('WAHA reports 5xx without the response body', async () => {
  const { fetchImpl } = scripted(workingSessionThen([
    jsonResponse(503, { detail: 'internal' }),
  ]));
  const receipt = await provider(fetchImpl).send(MESSAGE);
  assertEquals(receipt.failureReason, 'WAHA returned 503');
});

Deno.test('WAHA reports 401 as a failed send and still sends no credential header', async () => {
  const { fetchImpl, calls } = scripted([
    jsonResponse(401, { message: 'no-key' }),
  ]);
  const receipt = await provider(fetchImpl).send(MESSAGE);
  assertEquals(receipt.failureReason, 'WAHA session check returned 401');
  assertEquals(calls[0].headers.authorization, undefined);
  assertEquals(receipt.failureReason?.includes('no-key'), false);
});

Deno.test('WAHA does not send when the session is not WORKING', async () => {
  const { fetchImpl, calls } = scripted([
    jsonResponse(200, { status: 'SCAN_QR_CODE' }),
  ]);
  const receipt = await provider(fetchImpl).send(MESSAGE);
  assertEquals(receipt.failureReason, 'WAHA session is not available');
  assertEquals(calls.length, 1);
});

Deno.test('WAHA rejects a malformed session payload', async () => {
  const { fetchImpl } = scripted([
    new Response('nope', { status: 200 }),
  ]);
  const receipt = await provider(fetchImpl).send(MESSAGE);
  assertEquals(receipt.failureReason, 'WAHA session check returned a malformed response');
});

Deno.test('WAHA rejects an invalid recipient before any request', async () => {
  const { fetchImpl, calls } = scripted([]);
  const receipt = await provider(fetchImpl).send({ ...MESSAGE, to: 'not-a-phone' });
  assertEquals(receipt.failureReason, 'invalid recipient');
  assertEquals(calls.length, 0);
});

Deno.test('WAHA rejects SMS before any request', async () => {
  const { fetchImpl, calls } = scripted([]);
  const receipt = await provider(fetchImpl).send({ ...MESSAGE, channel: 'SMS' });
  assertEquals(receipt.failureReason, 'WAHA provider handles WhatsApp only');
  assertEquals(calls.length, 0);
});

Deno.test('WAHA reports a send timeout without the gateway URL', async () => {
  const { fetchImpl } = scripted(workingSessionThen([]));
  const timingOut: typeof fetch = async (input, init) => {
    const url = String(input);
    if (url.includes('/api/sendText')) {
      throw Object.assign(new Error('timed out'), { name: 'TimeoutError' });
    }
    return fetchImpl(input, init);
  };
  const receipt = await provider(timingOut).send(MESSAGE);
  assertEquals(receipt.failureReason, 'WAHA send timed out');
  assertEquals(receipt.failureReason?.includes(BASE), false);
});

Deno.test('WAHA reports a session-check timeout', async () => {
  const fetchImpl: typeof fetch = async () => {
    throw Object.assign(new Error('timed out'), { name: 'AbortError' });
  };
  const receipt = await provider(fetchImpl).send(MESSAGE);
  assertEquals(receipt.failureReason, 'WAHA session check timed out');
});

Deno.test('WAHA verify refuses unsigned inbound traffic', async () => {
  const ok = await provider(fetch).verify({
    method: 'POST',
    url: `${BASE}/webhook`,
    headers: {},
    rawBody: '{}',
  });
  assertEquals(ok, false);
  assertEquals(provider(fetch).parse({ method: 'POST', url: '', headers: {}, rawBody: '{}' }), []);
  assertEquals(provider(fetch).parseStatus({ method: 'POST', url: '', headers: {}, rawBody: '{}' }), []);
});
