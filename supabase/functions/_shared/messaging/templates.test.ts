/**
 * Deno unit tests for the messaging templates.
 *
 * Run with:
 *   deno test supabase/functions/_shared/messaging/templates.test.ts
 *
 * The browser-side vitest suite in `tests/unit/messaging-core.test.ts` covers
 * this logic in depth. These Deno tests are a smoke check that the
 * TypeScript still compiles under the runtime the edge functions actually use
 * — a class of drift the vitest suite cannot catch on its own.
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { renderOutcomeReply, renderQuoteAcknowledgement } from './templates.ts';

const CTX = {
  channel: 'WHATSAPP' as const,
  appUrl: 'https://app.otp.test',
};

Deno.test('renderQuoteAcknowledgement echoes the reference and amount', () => {
  const message = renderQuoteAcknowledgement(
    { publicRef: 'RFQ-ABC123', amount: 8500 },
    CTX,
  );
  assertEquals(message.body.includes('RFQ-ABC123'), true);
  assertEquals(message.body.includes('8,500'), true);
});

Deno.test('renderOutcomeReply is silent on duplicates and rate-limits', () => {
  assertEquals(renderOutcomeReply('DUPLICATE', CTX), null);
  assertEquals(renderOutcomeReply('RATE_LIMITED', CTX), null);
  assertEquals(renderOutcomeReply('BAD_REQUEST', CTX), null);
});

Deno.test('renderOutcomeReply refuses to confirm reference existence to strangers', () => {
  const unknown = renderOutcomeReply('UNKNOWN_SENDER', CTX, { reference: 'RFQ-9' });
  assertEquals(unknown?.body.includes('RFQ-9'), false);
});
