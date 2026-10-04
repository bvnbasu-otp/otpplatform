import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  createBodyDigest,
  createOndcAuthHeader,
  generateOndcKeyPair,
  verifyOndcAuthHeader,
} from './ondc-auth-crypto';

/** Official search body from ONDC signing-verification.md. */
const OFFICIAL_BODY =
  '{"context":{"domain":"nic2004:60212","country":"IND","city":"Kochi","action":"search","core_version":"0.9.1","bap_id":"bap.stayhalo.in","bap_uri":"https://8f9f-49-207-209-131.ngrok.io/protocol/","transaction_id":"e6d9f908-1d26-4ff3-a6d1-3af3d3721054","message_id":"a2fe6d52-9fe4-4d1a-9d0b-dccb8b48522d","timestamp":"2022-01-04T09:17:55.971Z","ttl":"P1M"},"message":{"intent":{"fulfillment":{"start":{"location":{"gps":"10.108768, 76.347517"}},"end":{"location":{"gps":"10.102997, 76.353480"}}}}}}';

const OFFICIAL_DIGEST =
  'BLAKE-512=b6lf6lRgOweajukcvcLsagQ2T60+85kRh/Rd2bdS+TG/5ALebOEgDJfyCrre/1+BMu5nA94o4DT3pTFXuUg7sw==';

const OFFICIAL_PUBLIC_KEY = 'awGPjRK6i/Vg/lWr+0xObclVxlwZXvTjWYtlu6NeOHk=';
const OFFICIAL_SIGNATURE =
  'cjbhP0PFyrlSCNszJM1F/YmHDVAWsZqJUPzojnE/7TJU3fJ/rmIlgaUHEr5E0/2PIyf0tpSnWtT6cyNNlpmoAQ==';

describe('ONDC auth crypto', () => {
  it('matches the official BLAKE-512 digest and not a SHA-256 value under that label', () => {
    expect(createBodyDigest(OFFICIAL_BODY)).toBe(OFFICIAL_DIGEST);
    const shaLabeled = `BLAKE-512=${createHash('sha256').update(OFFICIAL_BODY, 'utf8').digest('base64')}`;
    expect(shaLabeled).not.toBe(OFFICIAL_DIGEST);
    expect(shaLabeled).not.toBe(createBodyDigest(OFFICIAL_BODY));
  });

  it('verifies the published signature against the published raw registry key', () => {
    const header =
      `Signature keyId="example-bap.com|bap1234|ed25519",algorithm="ed25519",created="1641287875",expires="1641291475",headers="(created) (expires) digest",signature="${OFFICIAL_SIGNATURE}"`;
    const now = Math.floor(Date.now() / 1000);
    const result = verifyOndcAuthHeader({
      authHeader: header,
      body: OFFICIAL_BODY,
      publicKeyPem: OFFICIAL_PUBLIC_KEY,
      maxClockDriftSeconds: now - 1641291475 + 60,
    });
    expect(result.valid).toBe(true);
  });

  it('accepts PEM and raw 32-byte keys, and fails closed on a wrong digest, body, or key', () => {
    const keys = generateOndcKeyPair();
    const bodyA = '{"mock":"body-a"}';
    const bodyB = '{"mock":"body-b"}';
    const header = createOndcAuthHeader({
      body: bodyA,
      subscriberId: 'example-bap.com',
      uniqueKeyId: 'bap1234',
      privateKeyPem: keys.privateKeyPem,
    });
    const created = Number(header.match(/created="(\d+)"/)?.[1]);
    const expires = Number(header.match(/expires="(\d+)"/)?.[1]);
    expect(expires - created).toBe(300);
    expect(header).toContain('headers="(created) (expires) digest"');
    expect(header).toContain('algorithm="ed25519"');
    expect(header).toContain('keyId="example-bap.com|bap1234|ed25519"');

    expect(verifyOndcAuthHeader({
      authHeader: header,
      body: bodyA,
      publicKeyPem: keys.publicKeyPem,
    }).valid).toBe(true);

    expect(verifyOndcAuthHeader({
      authHeader: header,
      body: bodyA,
      publicKeyPem: keys.publicKeyBase64,
    }).valid).toBe(true);

    const now = Math.floor(Date.now() / 1000);
    const shaDigest = `BLAKE-512=${createHash('sha256').update(bodyA, 'utf8').digest('base64')}`;
    const signingString = `(created): ${now}\n(expires): ${now + 60}\ndigest: ${shaDigest}`;
    const shaSignature = sign(null, Buffer.from(signingString, 'utf8'), keys.privateKeyPem).toString('base64');
    const shaHeader =
      `Signature keyId="example-bap.com|bap1234|ed25519",algorithm="ed25519",created="${now}",expires="${now + 60}",headers="(created) (expires) digest",signature="${shaSignature}"`;
    expect(verifyOndcAuthHeader({
      authHeader: shaHeader,
      body: bodyA,
      publicKeyPem: keys.publicKeyPem,
    }).valid).toBe(false);
    expect(verifyOndcAuthHeader({
      authHeader: shaHeader,
      body: bodyA,
      publicKeyPem: keys.publicKeyBase64,
    }).valid).toBe(false);

    expect(verifyOndcAuthHeader({
      authHeader: header,
      body: bodyB,
      publicKeyPem: keys.publicKeyPem,
    }).valid).toBe(false);
    expect(verifyOndcAuthHeader({
      authHeader: header,
      body: bodyB,
      publicKeyPem: keys.publicKeyBase64,
    }).valid).toBe(false);

    for (const publicKeyPem of ['', 'not-a-key', '@@@', Buffer.alloc(16).toString('base64'), Buffer.alloc(64).toString('base64')]) {
      expect(verifyOndcAuthHeader({ authHeader: header, body: bodyA, publicKeyPem }).valid).toBe(false);
    }
    expect(verifyOndcAuthHeader({
      authHeader: header,
      body: bodyA,
      publicKeyPem: null as unknown as string,
    }).valid).toBe(false);
    expect(verifyOndcAuthHeader({
      authHeader: header,
      body: bodyA,
      publicKeyPem: `${keys.publicKeyBase64.slice(0, 10)}!${keys.publicKeyBase64.slice(10)}`,
    }).valid).toBe(false);
    expect(verifyOndcAuthHeader({
      authHeader: 'not-a-signature',
      body: bodyA,
      publicKeyPem: keys.publicKeyPem,
    }).valid).toBe(false);
    expect(verifyOndcAuthHeader({
      authHeader: 'Signature created="1"',
      body: bodyA,
      publicKeyPem: keys.publicKeyPem,
    }).valid).toBe(false);

    const { publicKey: x25519 } = generateKeyPairSync('x25519');
    const xDer = x25519.export({ type: 'spki', format: 'der' });
    const xRaw = Buffer.from(xDer).subarray(xDer.length - 32).toString('base64');
    expect(verifyOndcAuthHeader({
      authHeader: header,
      body: bodyA,
      publicKeyPem: xRaw,
    }).valid).toBe(false);
    const xPem = x25519.export({ type: 'spki', format: 'pem' });
    expect(String(xPem)).toContain('-----BEGIN PUBLIC KEY-----');
    expect(verifyOndcAuthHeader({
      authHeader: header,
      body: bodyA,
      publicKeyPem: String(xPem),
    }).valid).toBe(false);

    const obj = { b: 1, a: 2 };
    expect(createBodyDigest(obj)).toBe(createBodyDigest(JSON.stringify(obj)));
    expect(createBodyDigest(JSON.stringify(JSON.stringify(obj)))).not.toBe(createBodyDigest(obj));
    expect(createBodyDigest('{"b":1,"a":2}')).not.toBe(createBodyDigest('{"a":2,"b":1}'));
  });
});
