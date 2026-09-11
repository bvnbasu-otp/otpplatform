/**
 * Notification policy - Deno runtime coverage.
 *
 * assertPayloadIsSendable is the last gate between our data and a supplier's
 * phone. A widened payload - buyer identity, committee list, budget - must
 * throw rather than send, and this test guards against that.
 */
import {
  assertEquals,
  assertThrows,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  NotificationPolicyViolation,
  assertPayloadIsSendable,
  formatAmount,
} from './templates.ts';

Deno.test('formatAmount renders INR with Indian grouping', () => {
  assertEquals(formatAmount(8500), 'Rs. 8,500');
  assertEquals(formatAmount(125000), 'Rs. 1,25,000');
});

Deno.test('assertPayloadIsSendable accepts an allow-listed payload', () => {
  assertPayloadIsSendable({
    publicRef: 'RFQ-7K29AB',
    title: '10 HP borewell motor rewinding',
    quoteDeadline: '2026-01-15T00:00:00Z',
  });
});

Deno.test('assertPayloadIsSendable refuses any field it does not know about', () => {
  const payload = {
    publicRef: 'RFQ-7K29AB',
    title: 'motor rewind',
    quoteDeadline: '2026-01-15T00:00:00Z',
    // Buyer identity is off the allow-list on purpose.
    buyerName: 'Greenview Residency',
  };
  assertThrows(
    () => assertPayloadIsSendable(payload as Record<string, unknown>),
    NotificationPolicyViolation,
    'buyerName',
  );
});

Deno.test('assertPayloadIsSendable refuses a payload with no reference at all', () => {
  assertThrows(
    () => assertPayloadIsSendable({}),
  );
});
