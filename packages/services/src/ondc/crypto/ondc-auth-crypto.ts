import * as crypto from 'crypto';

/**
 * ONDC Cryptographic Specification:
 * - Signing Algorithm: Ed25519
 * - Hashing: BLAKE2b-512
 * - Authorization Header Format:
 *   Signature keyId="subscriber_id|unique_key_id|ed25519",algorithm="ed25519",created="1234567890",expires="1234567990",headers="(created) (expires) digest",signature="..."
 */

export interface OndcKeyPair {
  signingPublicKey: string; // Base64 or Hex
  signingPrivateKey: string; // PEM or Base64
  encPublicKey?: string;
  encPrivateKey?: string;
}

/**
 * Generate an Ed25519 keypair for ONDC Registry enrollment.
 */
export function generateOndcKeyPair(): {
  publicKeyPem: string;
  privateKeyPem: string;
  publicKeyBase64: string;
  privateKeyBase64: string;
} {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519', {
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  const rawPub = crypto.createPublicKey(publicKey).export({ type: 'spki', format: 'der' });
  // The last 32 bytes of Ed25519 DER public key are the raw 32-byte public key
  const raw32Pub = rawPub.subarray(rawPub.length - 32);

  const rawPriv = crypto.createPrivateKey(privateKey).export({ type: 'pkcs8', format: 'der' });
  const raw32Priv = rawPriv.subarray(rawPriv.length - 32);

  return {
    publicKeyPem: publicKey,
    privateKeyPem: privateKey,
    publicKeyBase64: raw32Pub.toString('base64'),
    privateKeyBase64: raw32Priv.toString('base64'),
  };
}

/**
 * BLAKE2b-512 digest of the exact body bytes. Standard base64, BLAKE-512= prefix.
 * A string body is hashed as UTF-8. An object is serialized once with JSON.stringify.
 */
export function createBodyDigest(body: string | object): string {
  const payloadStr = typeof body === 'string' ? body : JSON.stringify(body);
  const hash = crypto.createHash('blake2b512').update(payloadStr, 'utf8').digest('base64');
  return `BLAKE-512=${hash}`;
}

const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');

/**
 * PEM/SPKI text is returned unchanged for crypto.verify.
 * A registry signing_public_key is accepted only as canonical base64 of 32 bytes,
 * then wrapped as an Ed25519 SPKI key. Any other material fails closed.
 */
function verificationKey(material: string): string | crypto.KeyObject {
  if (typeof material !== 'string' || material.length === 0) {
    throw new Error('unsupported public key');
  }
  if (material.includes('-----BEGIN PUBLIC KEY-----')) {
    return material;
  }
  const trimmed = material.trim();
  if (!/^[A-Za-z0-9+/]{43}=?$/.test(trimmed)) {
    throw new Error('unsupported public key');
  }
  const raw = Buffer.from(trimmed, 'base64');
  if (raw.length !== 32 || raw.toString('base64').replace(/=+$/, '') !== trimmed.replace(/=+$/, '')) {
    throw new Error('unsupported public key');
  }
  return crypto.createPublicKey({
    key: Buffer.concat([ED25519_SPKI_PREFIX, raw]),
    format: 'der',
    type: 'spki',
  });
}

/**
 * Generate ONDC Authorization Header with Ed25519 signature.
 */
export function createOndcAuthHeader(params: {
  body: string | object;
  subscriberId: string;
  uniqueKeyId: string;
  privateKeyPem: string;
  ttlSeconds?: number;
}): string {
  const { body, subscriberId, uniqueKeyId, privateKeyPem, ttlSeconds = 300 } = params;

  const created = Math.floor(Date.now() / 1000);
  const expires = created + ttlSeconds;
  const digest = createBodyDigest(body);

  const signingString = `(created): ${created}\n(expires): ${expires}\ndigest: ${digest}`;

  const signatureBuffer = crypto.sign(
    null,
    Buffer.from(signingString, 'utf8'),
    privateKeyPem,
  );
  const signatureBase64 = signatureBuffer.toString('base64');

  const keyId = `${subscriberId}|${uniqueKeyId}|ed25519`;

  return `Signature keyId="${keyId}",algorithm="ed25519",created="${created}",expires="${expires}",headers="(created) (expires) digest",signature="${signatureBase64}"`;
}

/**
 * Verify incoming ONDC Authorization Header from Gateway or BPP.
 */
export function verifyOndcAuthHeader(params: {
  authHeader: string;
  body: string | object;
  publicKeyPem: string;
  maxClockDriftSeconds?: number;
}): { valid: boolean; error?: string } {
  const { authHeader, body, publicKeyPem, maxClockDriftSeconds = 300 } = params;

  try {
    if (!authHeader || !authHeader.startsWith('Signature ')) {
      return { valid: false, error: 'Missing or invalid Authorization header scheme' };
    }

    const parseField = (name: string): string | null => {
      const match = authHeader.match(new RegExp(`${name}="([^"]+)"`));
      return match?.[1] ?? null;
    };

    const algorithm = parseField('algorithm');
    const keyId = parseField('keyId');
    if (algorithm !== 'ed25519' || !keyId?.endsWith('|ed25519')) {
      return { valid: false, error: 'Unsupported ONDC signature algorithm' };
    }
    const created = parseField('created');
    const expires = parseField('expires');
    const signature = parseField('signature');

    if (!created || !expires || !signature) {
      return { valid: false, error: 'Missing required signature fields' };
    }

    const now = Math.floor(Date.now() / 1000);
    const createdTime = parseInt(created, 10);
    const expiresTime = parseInt(expires, 10);

    if (now < createdTime - maxClockDriftSeconds) {
      return { valid: false, error: 'Signature created in the future' };
    }
    if (now > expiresTime + maxClockDriftSeconds) {
      return { valid: false, error: 'Signature expired' };
    }

    const digest = createBodyDigest(body);
    const signingString = `(created): ${created}\n(expires): ${expires}\ndigest: ${digest}`;
    const publicKey = verificationKey(publicKeyPem);

    const isVerified = crypto.verify(
      null,
      Buffer.from(signingString, 'utf8'),
      publicKey,
      Buffer.from(signature, 'base64'),
    );

    return { valid: isVerified, error: isVerified ? undefined : 'Signature verification failed' };
  } catch (err: any) {
    return { valid: false, error: err?.message || 'Verification exception' };
  }
}
