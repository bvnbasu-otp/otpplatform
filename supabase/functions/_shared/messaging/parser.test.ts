/**
 * Quote parser — Deno runtime coverage. See phone.test.ts for the rationale.
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { CONFIRMATION_THRESHOLD, RuleBasedQuoteParser } from './parser.ts';

const parser = new RuleBasedQuoteParser();

Deno.test('parser reads the documented format with full confidence', () => {
  const parsed = parser.parse('QUOTE RFQ-7K29AB 8500');
  assertEquals(parsed.command, 'QUOTE');
  assertEquals(parsed.rfqReference, 'RFQ-7K29AB');
  assertEquals(parsed.amount, 8500);
  assertEquals(parsed.confidence, 1);
});

Deno.test('parser reads formats suppliers actually send', () => {
  const cases: Array<[string, number]> = [
    ['quote rfq-7k29ab 8500', 8500],
    ['RFQ-7K29AB Rs 8,500', 8500],
    ['Price for RFQ 7K29AB is ₹8500 per kg', 8500],
    ['QUOTE RFQ-7K29AB 1,25,000', 125000],
  ];
  for (const [body, amount] of cases) {
    const parsed = parser.parse(body);
    assertEquals(parsed.rfqReference, 'RFQ-7K29AB', body);
    assertEquals(parsed.amount, amount, body);
  }
});

Deno.test('parser honours STOP unconditionally', () => {
  // A supplier saying STOP has said it however the rest of the message reads.
  const parsed = parser.parse('STOP QUOTE RFQ-7K29AB 8500');
  assertEquals(parsed.command, 'STOP');
  assertEquals(parsed.confidence, 1);
});

Deno.test('parser reports low confidence rather than guessing silently', () => {
  const parsed = parser.parse('maybe around eight thousand');
  assertEquals(parsed.command, 'UNKNOWN');
  assertEquals(parsed.amount, null);
  assertEquals(parsed.confidence < CONFIRMATION_THRESHOLD, true);
});

Deno.test('parser recognises HELP in short and long form', () => {
  for (const input of ['HELP', 'help', 'INFO', 'H', '?', '???']) {
    assertEquals(parser.parse(input).command, 'HELP', input);
  }
});
