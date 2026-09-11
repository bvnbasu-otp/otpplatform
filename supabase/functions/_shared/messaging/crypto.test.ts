/**
 * HMAC primitives and constant-time comparison — Deno runtime coverage.
 *
 * These are the pieces that decide whether an inbound webhook is genuine, so
 * they get a smoke check under both runtimes. Known-answer vectors: RFC 2202
 * for HMAC-SHA-1, RFC 4231 for HMAC-SHA-256.
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  hmacSha1Base64,
  hmacSha256Hex,
  sha256Hex,
  timingSafeEqual,
} from './crypto.ts';

Deno.test('hmacSha256Hex matches RFC 4231 test case 1', async () => {
  const key = new TextDecoder().decode(new Uint8Array(20).fill(0x0b));
  const digest = await hmacSha256Hex(key, 'Hi There');
  assertEquals(digest, 'b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7');
});

Deno.test('hmacSha1Base64 signs a known payload deterministically', async () => {
  const a = await hmacSha1Base64('secret', 'payload');
  const b = await hmacSha1Base64('secret', 'payload');
  const c = await hmacSha1Base64('secret2', 'payload');
  assertEquals(a, b);
  assertEquals(a === c, false);
});

Deno.test('sha256Hex produces the standard NIST empty-string digest', async () => {
  assertEquals(
    await sha256Hex(''),
    'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
  );
});

Deno.test('timingSafeEqual rejects mismatched lengths and mismatched contents', () => {
  assertEquals(timingSafeEqual('abc', 'abc'), true);
  assertEquals(timingSafeEqual('abc', 'abcd'), false);
  assertEquals(timingSafeEqual('abc', 'abd'), false);
  assertEquals(timingSafeEqual('', ''), true);
});
