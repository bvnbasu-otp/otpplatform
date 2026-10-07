/**
 * ONDC-06 security matrix. Fixtures are MOCK. No live network call.
 */
import { createHash, sign as rawSign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import {
  OndcObservationSource,
  OndcRuntimeEnvironment,
  createOndcDiscoveryStore,
  createOndcDispatchLedger,
} from '@otp/domain';
import { OndcGatewayClient } from '../../packages/services/src/ondc/client/ondc-gateway-client';
import { createBodyDigest, createOndcAuthHeader, generateOndcKeyPair, verifyOndcAuthHeader } from '../../packages/services/src/ondc/crypto/ondc-auth-crypto';
import {
  acceptIssuedOndcOnSearch,
  executeOndcDiscoveryDispatch,
} from '../../packages/services/src/ondc/ondc-discovery-dispatch';

const root = fileURLToPath(new URL('../..', import.meta.url));
const NOW = new Date('2026-10-04T03:30:00.000Z');
const OFFICIAL_BODY =
  '{"context":{"domain":"nic2004:60212","country":"IND","city":"Kochi","action":"search","core_version":"0.9.1","bap_id":"bap.stayhalo.in","bap_uri":"https://8f9f-49-207-209-131.ngrok.io/protocol/","transaction_id":"e6d9f908-1d26-4ff3-a6d1-3af3d3721054","message_id":"a2fe6d52-9fe4-4d1a-9d0b-dccb8b48522d","timestamp":"2022-01-04T09:17:55.971Z","ttl":"P1M"},"message":{"intent":{"fulfillment":{"start":{"location":{"gps":"10.108768, 76.347517"}},"end":{"location":{"gps":"10.102997, 76.353480"}}}}}}';
const OFFICIAL_DIGEST = 'BLAKE-512=b6lf6lRgOweajukcvcLsagQ2T60+85kRh/Rd2bdS+TG/5ALebOEgDJfyCrre/1+BMu5nA94o4DT3pTFXuUg7sw==';

function catalog(transactionId: string, messageId: string, bppId: string, timestamp: string, sellerId = 'seller-mock-a') {
  return {
    context: {
      domain: 'ONDC:RET12',
      country: 'IND',
      city: 'std:080',
      action: 'on_search' as const,
      core_version: '1.2.0',
      bap_id: 'mock.otp.test',
      bap_uri: 'https://mock.otp.test/ondc-callback',
      bpp_id: bppId,
      bpp_uri: 'https://bpp.mock.otp.test/ondc',
      transaction_id: transactionId,
      message_id: messageId,
      timestamp,
    },
    message: {
      catalog: {
        id: 'catalogue-mock',
        providers: [
          {
            id: sellerId,
            descriptor: { name: 'Mock Reported Seller' },
            locations: [
              {
                id: 'location-mock-a',
                address: { area_code: '641001', city: 'Coimbatore', state: 'Tamil Nadu', country: 'IND' },
              },
            ],
          },
        ],
      },
    },
  };
}

describe('ONDC-06 security (MOCK)', () => {
  it('uses the cited BLAKE2b-512 digest and rejects a SHA-256 digest under the same label', () => {
    expect(createBodyDigest(OFFICIAL_BODY)).toBe(OFFICIAL_DIGEST);
    const sha = createHash('sha256').update(OFFICIAL_BODY).digest('base64');
    expect(`BLAKE-512=${sha}`).not.toBe(OFFICIAL_DIGEST);

    const keys = generateOndcKeyPair();
    const body = '{"mock":true,"label":"MOCK"}';
    const created = Math.floor(Date.now() / 1000).toString();
    const expires = (Number(created) + 60).toString();
    const digest = `BLAKE-512=${createHash('sha256').update(body).digest('base64')}`;
    const signingString = `(created): ${created}\n(expires): ${expires}\ndigest: ${digest}`;
    const signature = rawSign(null, Buffer.from(signingString), keys.privateKeyPem).toString('base64');
    const header = `Signature keyId="bpp.mock.otp.test|mock-key|ed25519",algorithm="ed25519",created="${created}",expires="${expires}",headers="(created) (expires) digest",signature="${signature}"`;
    expect(verifyOndcAuthHeader({ authHeader: header, body, publicKeyPem: keys.publicKeyPem }).valid).toBe(false);

    const valid = createOndcAuthHeader({
      body,
      subscriberId: 'bpp.mock.otp.test',
      uniqueKeyId: 'mock-key',
      privateKeyPem: keys.privateKeyPem,
    });
    expect(verifyOndcAuthHeader({ authHeader: valid, body, publicKeyPem: keys.publicKeyBase64 }).valid).toBe(true);
    const signedCreated = Number(valid.match(/created="(\d+)"/)?.[1]);
    const signedExpires = Number(valid.match(/expires="(\d+)"/)?.[1]);
    expect(signedExpires - signedCreated).toBe(300);
    const shortLived = createOndcAuthHeader({
      body,
      subscriberId: 'bpp.mock.otp.test',
      uniqueKeyId: 'mock-key',
      privateKeyPem: keys.privateKeyPem,
      ttlSeconds: 60,
    });
    expect(verifyOndcAuthHeader({ authHeader: shortLived, body, publicKeyPem: keys.publicKeyBase64 }).valid).toBe(true);
    const context = new OndcGatewayClient({
      environment: 'MOCK',
      subscriberId: 'mock.otp.test',
      uniqueKeyId: 'mock-key',
      bapUri: 'https://mock.otp.test/ondc-on-search',
      signingPrivateKeyPem: keys.privateKeyPem,
    }).createContext({ domain: 'ONDC:RET12', action: 'search', transactionId: 'tx-mock-city' });
    expect(context.city).toBe('std:080');
    expect(verifyOndcAuthHeader({ authHeader: '', body, publicKeyPem: keys.publicKeyPem }).valid).toBe(false);
    expect(verifyOndcAuthHeader({ authHeader: 'Signature created="1"', body, publicKeyPem: keys.publicKeyPem }).valid).toBe(false);
    const mismatched = valid.replace('bpp.mock.otp.test|mock-key|ed25519', 'bpp.mock.otp.test|mock-key|rsa');
    expect(verifyOndcAuthHeader({ authHeader: mismatched, body, publicKeyPem: keys.publicKeyPem }).valid).toBe(false);
    const other = generateOndcKeyPair();
    expect(verifyOndcAuthHeader({ authHeader: valid, body, publicKeyPem: other.publicKeyPem }).valid).toBe(false);
    expect(verifyOndcAuthHeader({ authHeader: valid, body: `${body} `, publicKeyPem: keys.publicKeyPem }).valid).toBe(false);
  });

  it('fails closed for callback, replay, provider, and client-supplied overrides', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network must not be called'));
    try {
      const keys = generateOndcKeyPair();
      const other = generateOndcKeyPair();
      const ledger = createOndcDispatchLedger();
      const dispatched = await executeOndcDiscoveryDispatch({
        request: {
          otpTransactionId: 'tx-mock-security',
          subcategoryCode: 'cotton_yarn',
          requirementMode: 'PRODUCT_MATERIAL',
          buyerRequestedPin: '560048',
          cityCode: 'std:080',
          itemName: 'MOCK cotton yarn',
          initiatorId: 'operator-mock',
        },
        categoryLabel: 'cotton yarn',
        environmentConfig: { environmentRaw: 'LOCAL', preprod: {}, production: {} },
        ledger,
        now: () => NOW,
        ids: { correlationId: 'corr-mock-security', messageId: 'msg-mock-security' },
      });
      const store = createOndcDiscoveryStore();
      const body = catalog(dispatched.transactionId, dispatched.messageId, 'bpp.mock.otp.test', '2026-10-04T03:45:00.000Z');
      const authHeader = createOndcAuthHeader({
        body,
        subscriberId: 'bpp.mock.otp.test',
        uniqueKeyId: 'bpp-key-mock',
        privateKeyPem: keys.privateKeyPem,
      });
      const resolve = async (keyId: string) => (keyId.startsWith('bpp.mock.otp.test|') ? keys.publicKeyPem : other.publicKeyPem);

      const missing = await acceptIssuedOndcOnSearch({
        ledger,
        authHeader: '',
        body,
        processingEnvironment: OndcRuntimeEnvironment.LOCAL,
        processingSource: OndcObservationSource.MOCK,
        store,
        resolvePublicKey: resolve,
      });
      expect(missing.reason).toBe('missing_signature');
      expect(store.identities.size).toBe(0);

      const malformed = await acceptIssuedOndcOnSearch({
        ledger,
        authHeader: 'Signature keyId="not-a-key"',
        body,
        processingEnvironment: OndcRuntimeEnvironment.LOCAL,
        processingSource: OndcObservationSource.MOCK,
        store,
        resolvePublicKey: resolve,
      });
      expect(malformed.reason).toBe('malformed_signature');

      const wrongKey = await acceptIssuedOndcOnSearch({
        ledger,
        authHeader,
        body,
        processingEnvironment: OndcRuntimeEnvironment.LOCAL,
        processingSource: OndcObservationSource.MOCK,
        store,
        resolvePublicKey: async () => other.publicKeyPem,
      });
      expect(wrongKey.ok).toBe(false);
      expect(wrongKey.failure).toBe('AUTH_FAILURE');

      const unknownKey = await acceptIssuedOndcOnSearch({
        ledger,
        authHeader,
        body,
        processingEnvironment: OndcRuntimeEnvironment.LOCAL,
        processingSource: OndcObservationSource.MOCK,
        store,
        resolvePublicKey: async () => null,
      });
      expect(unknownKey.reason).toBe('public_key_not_configured');

      const wrongSubscriberHeader = createOndcAuthHeader({
        body,
        subscriberId: 'other.mock.otp.test',
        uniqueKeyId: 'other-key',
        privateKeyPem: other.privateKeyPem,
      });
      const wrongSubscriber = await acceptIssuedOndcOnSearch({
        ledger,
        authHeader: wrongSubscriberHeader,
        body,
        processingEnvironment: OndcRuntimeEnvironment.LOCAL,
        processingSource: OndcObservationSource.MOCK,
        store,
        resolvePublicKey: async () => other.publicKeyPem,
      });
      expect(wrongSubscriber.reason).toBe('wrong_subscriber');

      const tampered = { ...body, context: { ...body.context, transaction_id: 'tx-other' } };
      const tamperedHeader = createOndcAuthHeader({
        body: body,
        subscriberId: 'bpp.mock.otp.test',
        uniqueKeyId: 'bpp-key-mock',
        privateKeyPem: keys.privateKeyPem,
      });
      const modified = await acceptIssuedOndcOnSearch({
        ledger,
        authHeader: tamperedHeader,
        body: tampered,
        processingEnvironment: OndcRuntimeEnvironment.LOCAL,
        processingSource: OndcObservationSource.MOCK,
        store,
        resolvePublicKey: resolve,
      });
      expect(modified.failure).toBe('AUTH_FAILURE');

      const accepted = await acceptIssuedOndcOnSearch({
        ledger,
        authHeader,
        body,
        processingEnvironment: OndcRuntimeEnvironment.LOCAL,
        processingSource: OndcObservationSource.MOCK,
        store,
        resolvePublicKey: resolve,
      });
      expect(accepted.ok).toBe(true);
      expect(accepted.persistence).toBe('STORED_MOCK');
      expect(store.identities.size).toBe(1);

      const replay = await acceptIssuedOndcOnSearch({
        ledger,
        authHeader,
        body,
        processingEnvironment: OndcRuntimeEnvironment.LOCAL,
        processingSource: OndcObservationSource.MOCK,
        store,
        resolvePublicKey: resolve,
      });
      expect(replay.replay).toBe(true);
      expect(store.identities.size).toBe(1);

      const older = catalog(dispatched.transactionId, dispatched.messageId, 'bpp.mock.otp.test', '2026-10-04T03:00:00.000Z', 'seller-mock-b');
      const olderHeader = createOndcAuthHeader({
        body: older,
        subscriberId: 'bpp.mock.otp.test',
        uniqueKeyId: 'bpp-key-mock',
        privateKeyPem: keys.privateKeyPem,
      });
      const duplicate = await acceptIssuedOndcOnSearch({
        ledger,
        authHeader: olderHeader,
        body: older,
        processingEnvironment: OndcRuntimeEnvironment.LOCAL,
        processingSource: OndcObservationSource.MOCK,
        store,
        resolvePublicKey: resolve,
      });
      expect(duplicate.reason).toBe('duplicate_message');
      expect(store.identities.size).toBe(1);
      expect([...store.identities.values()][0]?.sellerPin).toBe('641001');

      const wrongMessage = catalog(dispatched.transactionId, 'msg-unknown', 'bpp.mock.otp.test', '2026-10-04T03:50:00.000Z');
      const wrongMessageHeader = createOndcAuthHeader({
        body: wrongMessage,
        subscriberId: 'bpp.mock.otp.test',
        uniqueKeyId: 'bpp-key-mock',
        privateKeyPem: keys.privateKeyPem,
      });
      const unknownMessage = await acceptIssuedOndcOnSearch({
        ledger,
        authHeader: wrongMessageHeader,
        body: wrongMessage,
        processingEnvironment: OndcRuntimeEnvironment.LOCAL,
        processingSource: OndcObservationSource.MOCK,
        store,
        resolvePublicKey: resolve,
      });
      expect(unknownMessage.reason).toBe('unknown_message');

      const wrongOperation = catalog(dispatched.transactionId, dispatched.messageId, 'bpp.mock.otp.test', '2026-10-04T03:50:00.000Z');
      wrongOperation.context.action = 'on_select' as 'on_search';
      const wrongOperationHeader = createOndcAuthHeader({
        body: wrongOperation,
        subscriberId: 'bpp.mock.otp.test',
        uniqueKeyId: 'bpp-key-mock',
        privateKeyPem: keys.privateKeyPem,
      });
      const operation = await acceptIssuedOndcOnSearch({
        ledger,
        authHeader: wrongOperationHeader,
        body: wrongOperation,
        processingEnvironment: OndcRuntimeEnvironment.LOCAL,
        processingSource: OndcObservationSource.MOCK,
        store,
        resolvePublicKey: resolve,
      });
      expect(operation.reason).toBe('wrong_operation');

      const wrongProviderBody = catalog(dispatched.transactionId, dispatched.messageId, 'other-bpp.mock.otp.test', '2026-10-04T03:55:00.000Z');
      const wrongProviderHeader = createOndcAuthHeader({
        body: wrongProviderBody,
        subscriberId: 'other-bpp.mock.otp.test',
        uniqueKeyId: 'other-key',
        privateKeyPem: other.privateKeyPem,
      });
      const wrongProvider = await acceptIssuedOndcOnSearch({
        ledger,
        authHeader: wrongProviderHeader,
        body: wrongProviderBody,
        processingEnvironment: OndcRuntimeEnvironment.LOCAL,
        processingSource: OndcObservationSource.MOCK,
        store,
        resolvePublicKey: async () => other.publicKeyPem,
      });
      expect(wrongProvider.reason).toBe('wrong_provider');
      expect(store.identities.size).toBe(1);

      const unknownTransaction = catalog('tx-unknown', dispatched.messageId, 'bpp.mock.otp.test', '2026-10-04T03:55:00.000Z');
      const unknownTransactionHeader = createOndcAuthHeader({
        body: unknownTransaction,
        subscriberId: 'bpp.mock.otp.test',
        uniqueKeyId: 'bpp-key-mock',
        privateKeyPem: keys.privateKeyPem,
      });
      const unknown = await acceptIssuedOndcOnSearch({
        ledger,
        authHeader: unknownTransactionHeader,
        body: unknownTransaction,
        processingEnvironment: OndcRuntimeEnvironment.LOCAL,
        processingSource: OndcObservationSource.MOCK,
        store,
        resolvePublicKey: resolve,
      });
      expect(unknown.reason).toBe('unknown_transaction');
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it('refuses client overrides, production, and a pre-prod fallback, and does not invite', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ message: { ack: { status: 'ACK' } } }),
      text: async () => '',
    } as Response);
    try {
      const keys = generateOndcKeyPair();
      for (const client of [
        { providerSupplierId: 'client-seller' },
        { participantId: 'client-bpp' },
        { category: 'ONDC:RET10' },
        { endpoint: 'https://client.example/ondc' },
        { environment: 'PRODUCTION' },
      ]) {
        const rejected = await executeOndcDiscoveryDispatch({
          request: {
            otpTransactionId: 'tx-mock-override',
            subcategoryCode: 'cctv_surveillance',
            requirementMode: 'PRODUCT_MATERIAL',
            buyerRequestedPin: '560001',
            initiatorId: 'operator-mock',
            client,
          },
          environmentConfig: { environmentRaw: 'LOCAL', preprod: {}, production: {} },
          now: () => NOW,
        });
        expect(rejected.failure).toBe('CLIENT_OVERRIDE');
        expect(rejected.gatewayAcknowledged).toBe(false);
      }

      const unsupported = await executeOndcDiscoveryDispatch({
        request: {
          otpTransactionId: 'tx-mock-unsupported',
          subcategoryCode: 'motor_rewinding',
          requirementMode: 'REPAIR_MAINTENANCE',
          buyerRequestedPin: '560048',
          itemName: 'CCTV camera title must not map',
          initiatorId: 'operator-mock',
        },
        environmentConfig: { environmentRaw: 'LOCAL', preprod: {}, production: {} },
        now: () => NOW,
      });
      expect(unsupported.failure).toBe('UNSUPPORTED_DOMAIN');

      const production = await executeOndcDiscoveryDispatch({
        request: {
          otpTransactionId: 'tx-mock-production',
          subcategoryCode: 'cotton_yarn',
          buyerRequestedPin: '560048',
          initiatorId: 'operator-mock',
        },
        environmentConfig: {
          environmentRaw: 'PRODUCTION',
          productionEnabled: 'true',
          preprod: {
            gatewayUrl: 'https://gateway.preprod.otp.test/gateway',
            subscriberId: 'bap.preprod.otp.test',
            uniqueKeyId: 'bap-key',
            signingPrivateKey: keys.privateKeyPem,
            registryUrl: 'https://registry.preprod.otp.test',
            callbackUrl: 'https://callback.preprod.otp.test/ondc',
          },
          production: {
            gatewayUrl: 'https://prod.gateway.ondc.org/search',
            subscriberId: 'bap.production.otp.test',
            uniqueKeyId: 'production-key',
            signingPrivateKey: keys.privateKeyPem,
            registryUrl: 'https://prod.registry.ondc.org',
            callbackUrl: 'https://callback.production.otp.test/ondc',
          },
        },
        ondcEnabled: 'true',
        now: () => NOW,
      });
      expect(production.failure).toBe('PRODUCTION_REFUSED');

      const fallback = await executeOndcDiscoveryDispatch({
        request: {
          otpTransactionId: 'tx-mock-fallback',
          subcategoryCode: 'cotton_yarn',
          buyerRequestedPin: '560048',
          cityCode: 'std:080',
          initiatorId: 'operator-mock',
        },
        environmentConfig: {
          environmentRaw: 'PRE_PROD',
          preprod: {},
          production: {
            gatewayUrl: 'https://prod.gateway.ondc.org/search',
            subscriberId: 'bap.production.otp.test',
            uniqueKeyId: 'production-key',
            signingPrivateKey: keys.privateKeyPem,
            registryUrl: 'https://prod.registry.ondc.org',
            callbackUrl: 'https://callback.production.otp.test/ondc',
          },
        },
        now: () => NOW,
      });
      expect(fallback.failure).toBe('CREDENTIAL_MISSING');
      expect(fallback.gatewayAcknowledged).toBe(false);
      expect(fetchSpy).not.toHaveBeenCalled();

      const dispatchSource = readFileSync(`${root}/packages/services/src/ondc/ondc-discovery-dispatch.ts`, 'utf8');
      const providerSource = readFileSync(`${root}/packages/services/src/discovery/supplier-network-providers/ondc-supplier-provider.ts`, 'utf8');
      expect(dispatchSource).not.toContain('discover_and_invite_for_rfq');
      expect(dispatchSource).not.toContain('.select(');
      expect(dispatchSource).not.toContain('.init(');
      expect(dispatchSource).not.toContain('.confirm(');
      expect(dispatchSource).not.toContain('.status(');
      expect(providerSource).not.toContain('discover_and_invite_for_rfq');
      expect(providerSource).toContain('ONDC /search is not dispatched from supplier discovery');
    } finally {
      fetchSpy.mockRestore();
    }
  });
});
