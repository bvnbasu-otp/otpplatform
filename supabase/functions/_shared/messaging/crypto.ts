/**
 * Signature primitives for webhook verification.
 *
 * WebCrypto only, so this works unchanged in Deno and in Node under vitest.
 * Comparisons are constant-time: a signature check that returns early on the
 * first wrong byte leaks the correct signature to anyone patient enough to
 * measure it.
 */

const encoder = new TextEncoder();

async function hmac(
  algorithm: 'SHA-1' | 'SHA-256',
  secret: string,
  message: string,
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: algorithm },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  return new Uint8Array(signature);
}

export async function hmacSha1Base64(secret: string, message: string): Promise<string> {
  return toBase64(await hmac('SHA-1', secret, message));
}

export async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  return toHex(await hmac('SHA-256', secret, message));
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value));
  return toHex(new Uint8Array(digest));
}

/** Equal-length, byte-wise, no early exit. */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}
