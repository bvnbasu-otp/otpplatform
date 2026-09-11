/**
 * Provider resolution — Deno runtime coverage.
 *
 * Missing credentials must fail loudly at boot rather than silently fall back
 * to the mock, which would look like a working system while every enquiry
 * went nowhere.
 */
import {
  assertEquals,
  assertInstanceOf,
  assertThrows,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { MessagingConfigError, resolveProvider } from './resolve.ts';
import { MockMessagingProvider } from './mock.ts';

Deno.test('resolveProvider defaults to MOCK', () => {
  const provider = resolveProvider({});
  assertInstanceOf(provider, MockMessagingProvider);
  assertEquals(provider.id, 'MOCK');
});

Deno.test('resolveProvider fails loudly on missing Twilio credentials', () => {
  assertThrows(
    () => resolveProvider({ MESSAGING_PROVIDER: 'TWILIO' }),
    MessagingConfigError,
    'TWILIO_ACCOUNT_SID',
  );
});

Deno.test('resolveProvider fails loudly on missing Meta credentials', () => {
  assertThrows(
    () => resolveProvider({ MESSAGING_PROVIDER: 'META' }),
    MessagingConfigError,
    'META_PHONE_NUMBER_ID',
  );
});

Deno.test('resolveProvider rejects an unknown provider id', () => {
  assertThrows(
    () => resolveProvider({ MESSAGING_PROVIDER: 'CARRIER_PIGEON' }),
    MessagingConfigError,
    'Unknown MESSAGING_PROVIDER',
  );
});

Deno.test('resolveProvider selects Twilio when both credentials are set', () => {
  const provider = resolveProvider({
    MESSAGING_PROVIDER: 'TWILIO',
    TWILIO_ACCOUNT_SID: 'AC00000000000000000000000000000000',
    TWILIO_AUTH_TOKEN: 'auth-token',
    TWILIO_SMS_FROM: '+15551234567',
  });
  assertEquals(provider.id, 'TWILIO');
});
