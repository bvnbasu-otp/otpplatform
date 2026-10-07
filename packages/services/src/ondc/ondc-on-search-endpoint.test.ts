/**
 * Hosted /on_search handler. Fixtures are MOCK. No live registry or gateway call.
 */
import { describe, expect, it, vi } from 'vitest';
import { createOndcDiscoveryStore, createOndcDispatchLedger, OndcObservationSource, OndcRuntimeEnvironment } from '@otp/domain';
import { createOndcAuthHeader, generateOndcKeyPair } from './crypto/ondc-auth-crypto';
import { executeOndcDiscoveryDispatch } from './ondc-discovery-dispatch';
import { handleOndcOnSearchRequest } from './ondc-on-search-endpoint';

const NOW = new Date('2026-10-04T03:30:00.000Z');

function catalog(transactionId: string, messageId: string, bppId: string, timestamp: string) {
  return {
    context: {
      domain: 'ONDC:RET12',
      country: 'IND',
      city: 'std:0421',
      action: 'on_search' as const,
      core_version: '1.2.0',
      bap_id: 'mock.otp.test',
      bap_uri: 'https://mock.otp.test/ondc-on-search',
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
            id: 'seller-mock-a',
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

describe('ONDC /on_search endpoint (MOCK)', () => {
  it('fail-closes the HTTP boundary and retains one verified observation', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network must not be called'));
    try {
      const keys = generateOndcKeyPair();
      const ledger = createOndcDispatchLedger();
      const store = createOndcDiscoveryStore();
      const dispatched = await executeOndcDiscoveryDispatch({
        request: {
          otpTransactionId: 'tx-mock-endpoint',
          subcategoryCode: 'cotton_yarn',
          requirementMode: 'PRODUCT_MATERIAL',
          buyerRequestedPin: '560048',
          cityCode: 'std:0421',
          itemName: 'MOCK cotton yarn',
          initiatorId: 'operator-mock',
        },
        categoryLabel: 'cotton yarn',
        environmentConfig: { environmentRaw: 'LOCAL', preprod: {}, production: {} },
        ledger,
        now: () => NOW,
        ids: { correlationId: 'corr-mock-endpoint', messageId: 'msg-mock-endpoint' },
      });
      const body = catalog(dispatched.transactionId, dispatched.messageId, 'bpp.mock.otp.test', '2026-10-04T03:45:00.000Z');
      const rawBody = JSON.stringify(body);
      const authorization = createOndcAuthHeader({
        body: rawBody,
        subscriberId: 'bpp.mock.otp.test',
        uniqueKeyId: 'bpp-key-mock',
        privateKeyPem: keys.privateKeyPem,
      });
      const resolvePublicKey = async () => keys.publicKeyPem;
      const shared = {
        ledger,
        processingEnvironment: OndcRuntimeEnvironment.LOCAL,
        processingSource: OndcObservationSource.MOCK,
        store,
        resolvePublicKey,
      };

      const wrongMethod = await handleOndcOnSearchRequest({
        ...shared,
        method: 'GET',
        url: 'https://buyer.opentradeprocurement.ai/functions/v1/ondc-on-search/on_search',
        rawBody,
        authorization,
      });
      expect(wrongMethod.status).toBe(405);
      expect(wrongMethod.body.message.ack.status).toBe('NACK');
      expect(store.identities.size).toBe(0);

      const wrongPath = await handleOndcOnSearchRequest({
        ...shared,
        method: 'POST',
        url: 'https://buyer.opentradeprocurement.ai/functions/v1/ondc-on-search/on_select',
        rawBody,
        authorization,
      });
      expect(wrongPath.result.reason).toBe('wrong_operation');
      expect(store.identities.size).toBe(0);

      const missing = await handleOndcOnSearchRequest({
        ...shared,
        method: 'POST',
        url: 'https://buyer.opentradeprocurement.ai/functions/v1/ondc-on-search/on_search',
        rawBody,
        authorization: null,
      });
      expect(missing.result.reason).toBe('missing_signature');
      expect(store.identities.size).toBe(0);

      const tampered = rawBody.replace('Mock Reported Seller', 'Tampered Seller');
      const tamper = await handleOndcOnSearchRequest({
        ...shared,
        method: 'POST',
        url: 'https://buyer.opentradeprocurement.ai/functions/v1/ondc-on-search/on_search',
        rawBody: tampered,
        authorization,
      });
      expect(tamper.result.ok).toBe(false);
      expect(tamper.result.failure).toBe('AUTH_FAILURE');
      expect(store.identities.size).toBe(0);

      const emptyLedger = createOndcDispatchLedger();
      const unknown = await handleOndcOnSearchRequest({
        ...shared,
        ledger: emptyLedger,
        method: 'POST',
        url: 'https://buyer.opentradeprocurement.ai/functions/v1/ondc-on-search/on_search',
        rawBody,
        authorization,
      });
      expect(unknown.result.reason).toBe('unknown_transaction');
      expect(unknown.result.persistence).toBe('REJECTED');
      expect(store.identities.size).toBe(0);

      const production = await handleOndcOnSearchRequest({
        ...shared,
        processingEnvironment: OndcRuntimeEnvironment.PRODUCTION,
        processingSource: OndcObservationSource.REAL_NETWORK,
        method: 'POST',
        url: 'https://buyer.opentradeprocurement.ai/functions/v1/ondc-on-search/on_search',
        rawBody,
        authorization,
        registry: {
          registryUrl: 'https://prod.registry.ondc.org/v2.0/lookup',
          subscriberId: 'must-not-be-used',
          uniqueKeyId: 'must-not-be-used',
          signingPrivateKey: keys.privateKeyPem,
          timeoutMs: 1000,
          fetchImpl: fetchSpy,
        },
      });
      expect(production.result.reason).toBe('environment_rejected');
      expect(store.identities.size).toBe(0);
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(JSON.stringify(production.body)).not.toMatch(/BEGIN |PRIVATE|signature=/i);

      const accepted = await handleOndcOnSearchRequest({
        ...shared,
        method: 'POST',
        url: 'https://buyer.opentradeprocurement.ai/functions/v1/ondc-on-search/on_search',
        rawBody,
        authorization,
      });
      expect(accepted.status).toBe(200);
      expect(accepted.body.message.ack.status).toBe('ACK');
      expect(accepted.result.persistence).toBe('STORED_MOCK');
      expect(accepted.result.realNetworkVerified).toBe(false);
      expect(store.identities.size).toBe(1);
      expect([...store.identities.values()][0]?.requestedPin).toBe('560048');
      expect([...store.identities.values()][0]?.sellerPin).toBe('641001');

      const replay = await handleOndcOnSearchRequest({
        ...shared,
        method: 'POST',
        url: 'https://buyer.opentradeprocurement.ai/functions/v1/ondc-on-search/on_search',
        rawBody,
        authorization,
      });
      expect(replay.result.replay).toBe(true);
      expect(store.identities.size).toBe(1);
      expect(JSON.stringify(accepted.body)).not.toMatch(/bpp_uri|BEGIN |Authorization/i);
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
    }
  });
});
