const TOKEN_VERSION = 'v1';
const NONCE_BYTES = 24;
const TOKEN_PATTERN = /^v1\.([0-9a-f]{48})\.([0-9a-f]{64})$/;

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(hex: string): ArrayBuffer {
  const buffer = new ArrayBuffer(hex.length / 2);
  const bytes = new Uint8Array(buffer);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return buffer;
}

function hmacKey(secret: string): Promise<CryptoKey> {
  if (secret.length < 32) throw new Error('contact rate-limit secret is not configured');
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

async function sign(key: CryptoKey, value: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value)));
}

async function bucketKey(key: CryptoKey, nonceHex: string): Promise<string> {
  return bytesToHex(await sign(key, `contact-enquiry:client:${nonceHex}`));
}

export interface ContactClientIdentity {
  token: string;
  bucketKey: string;
  issued: boolean;
}

export async function issueContactClientIdentity(
  secret: string,
  nonce: Uint8Array = crypto.getRandomValues(new Uint8Array(NONCE_BYTES)),
): Promise<ContactClientIdentity> {
  if (nonce.byteLength !== NONCE_BYTES) throw new Error('invalid contact client nonce');
  const key = await hmacKey(secret);
  const nonceHex = bytesToHex(nonce);
  const payload = `${TOKEN_VERSION}.${nonceHex}`;
  const signature = bytesToHex(await sign(key, payload));
  return { token: `${payload}.${signature}`, bucketKey: await bucketKey(key, nonceHex), issued: true };
}

export async function resolveContactClientIdentity(
  token: string | null | undefined,
  secret: string,
  replacementNonce?: Uint8Array,
): Promise<ContactClientIdentity> {
  const key = await hmacKey(secret);
  const match = token?.match(TOKEN_PATTERN);
  if (match) {
    const payload = `${TOKEN_VERSION}.${match[1]}`;
    const valid = await crypto.subtle.verify(
      'HMAC',
      key,
      hexToBytes(match[2]!),
      new TextEncoder().encode(payload),
    );
    if (valid) {
      return { token: token!, bucketKey: await bucketKey(key, match[1]!), issued: false };
    }
  }
  return issueContactClientIdentity(secret, replacementNonce);
}
