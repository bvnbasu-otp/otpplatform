/**
 * MockMessagingProvider — Deno runtime coverage.
 *
 * The mock takes the same code path as a real provider in the demo, so its
 * signature-verification behaviour matters. Absence of a shared secret must
 * mean refuse, not allow: a webhook that takes unsigned traffic is a way to
 * bid as any supplier.
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { MockMessagingProvider } from './mock.ts';
import type { WebhookRequest } from '../types.ts';

function req(headers: Record<string, string>, body: string): WebhookRequest {
  return { method: 'POST', url: 'https://example.test/', headers, rawBody: body };
}

Deno.test('mock provider refuses webhooks when no shared secret is configured', async () => {
  const provider = new MockMessagingProvider();
  assertEquals(await provider.verify(req({}, '')), false);
  assertEquals(await provider.verify(req({ 'x-mock-signature': 'anything' }, '')), false);
});

Deno.test('mock provider verifies with a matching header', async () => {
  const provider = new MockMessagingProvider({ sharedSecret: 'shhh' });
  assertEquals(await provider.verify(req({ 'x-mock-signature': 'shhh' }, '')), true);
  assertEquals(await provider.verify(req({ 'x-mock-signature': 'wrong' }, '')), false);
  assertEquals(await provider.verify(req({}, '')), false);
});

Deno.test('mock provider parses a well-formed simulated message', () => {
  const provider = new MockMessagingProvider({ sharedSecret: 'shhh' });
  const body = JSON.stringify({
    from: '9876543210',
    body: 'QUOTE RFQ-7K29AB 8500',
    channel: 'WHATSAPP',
    messageId: 'sim-1',
  });
  const [message] = provider.parse(req({}, body));
  assertEquals(message?.from, '+919876543210');
  assertEquals(message?.channel, 'WHATSAPP');
  assertEquals(message?.externalMessageId, 'sim-1');
  assertEquals(message?.body, 'QUOTE RFQ-7K29AB 8500');
});

Deno.test('mock provider drops malformed payloads without throwing', () => {
  const provider = new MockMessagingProvider();
  assertEquals(provider.parse(req({}, 'not json')).length, 0);
  assertEquals(provider.parse(req({}, JSON.stringify({ body: 'no from' }))).length, 0);
  assertEquals(provider.parse(req({}, JSON.stringify({ from: '+91' }))).length, 0);
});

Deno.test('mock provider records everything it sent to the outbox', async () => {
  const provider = new MockMessagingProvider();
  const receipt = await provider.send({
    to: '+919876543210',
    channel: 'SMS',
    body: 'hello',
  });
  assertEquals(receipt.status, 'SENT');
  assertEquals(provider.outbox.length, 1);
  assertEquals(provider.outbox[0]?.body, 'hello');
});

Deno.test('mock provider surfaces simulated failures on demand', async () => {
  const provider = new MockMessagingProvider({ failSendsTo: ['+919876543210'] });
  const receipt = await provider.send({
    to: '+919876543210',
    channel: 'SMS',
    body: 'this will fail',
  });
  assertEquals(receipt.status, 'FAILED');
  assertEquals(provider.outbox.length, 0);
});
