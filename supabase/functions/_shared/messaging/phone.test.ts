/**
 * Phone normalisation — Deno runtime coverage.
 *
 * These cases mirror the vitest suite in tests/unit/messaging-core.test.ts so
 * a regression under either runtime is caught. Run with:
 *
 *   deno task test        # from supabase/functions/
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { isE164, maskPhone, normalizePhone } from './phone.ts';

Deno.test('normalizePhone accepts the shapes suppliers actually type', () => {
  const inputs = [
    '+919876543210',
    '919876543210',
    '9876543210',
    '09876543210',
    '+91 98765 43210',
    '+91-98765-43210',
    '00919876543210',
    'whatsapp:+919876543210',
    '919876543210@c.us',
  ];
  for (const input of inputs) {
    assertEquals(normalizePhone(input), '+919876543210', input);
  }
});

Deno.test('normalizePhone keeps international numbers intact', () => {
  assertEquals(normalizePhone('+14155552671'), '+14155552671');
  assertEquals(normalizePhone('+442071838750'), '+442071838750');
});

Deno.test('normalizePhone returns null rather than guessing', () => {
  const inputs: Array<string | null | undefined> = [
    '',
    '   ',
    'call me',
    '12345',
    '+0123456789',
    null,
    undefined,
  ];
  for (const input of inputs) {
    assertEquals(normalizePhone(input as string), null, String(input));
  }
});

Deno.test('isE164 accepts only strict E.164', () => {
  assertEquals(isE164('+919876543210'), true);
  assertEquals(isE164('9876543210'), false);
  assertEquals(isE164('+0123456789'), false);
});

Deno.test('maskPhone leaves only the country and operator prefix readable', () => {
  assertEquals(maskPhone('+919876543210'), '+9198765•••••');
  assertEquals(maskPhone('not-a-number'), '•••');
});
