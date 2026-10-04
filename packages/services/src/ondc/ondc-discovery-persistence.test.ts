import { describe, expect, it, vi } from 'vitest';
import {
  createOndcDiscoveryStore,
  OndcDispatchStatus,
  OndcObservationSource,
  OndcRuntimeEnvironment,
  type OndcDispatchRecord,
} from '@otp/domain';
import type { OndcDiscoveryDispatchInsert, OndcDiscoveryDispatchStore } from './ondc-discovery-dispatch-store';
import { createOndcAuthHeader, generateOndcKeyPair } from './crypto/ondc-auth-crypto';
import { OndcBapReceiver } from './receiver/ondc-bap-receiver';
import { ingestOndcOnSearchCallback } from './ondc-callback-ingress';
import { persistNormalizedOndcOnSearch } from './ondc-discovery-persistence';
import { OndcNetworkService } from './ondc-network-service';
import type { OndcCatalog, OndcPayload } from './types/ondc-beckn';

const OBSERVED_AT = '2026-10-01T05:31:00.000Z';

function serviceSearchStore(failCallbackPending = false): OndcDiscoveryDispatchStore & {
  identity(): { transactionId: string; messageId: string; correlationId: string } | null;
} {
  let row: OndcDispatchRecord | null = null;
  const created = (input: OndcDiscoveryDispatchInsert): OndcDispatchRecord => ({
    correlationId: input.correlationId,
    idempotencyKey: input.idempotencyKey,
    otpTransactionId: input.otpTransactionId,
    transactionId: input.transactionId,
    messageId: input.messageId,
    operation: 'search',
    provider: 'ONDC',
    environment: input.environment,
    observationSource: input.observationSource,
    buyerRequestedPin: input.buyerRequestedPin,
    domain: input.domain,
    city: input.city,
    categoryLabel: input.categoryLabel ?? null,
    subcategoryCode: input.subcategoryCode ?? null,
    requirementMode: input.requirementMode ?? null,
    initiatedAt: OBSERVED_AT,
    initiatorId: '',
    expectedBapId: input.expectedBapId,
    status: OndcDispatchStatus.REFUSED,
    transactionIssued: false,
    gatewayAcknowledged: false,
    realNetworkVerified: false,
    failure: null,
    reason: null,
    callbackDigest: null,
    canonicalObservedAt: null,
    boundParticipantId: null,
    persistence: 'NOT_STORED',
  });
  return {
    identity() {
      return row
        ? { transactionId: row.transactionId, messageId: row.messageId, correlationId: row.correlationId }
        : null;
    },
    async findByIdempotencyKey(idempotencyKey) {
      return row?.idempotencyKey === idempotencyKey ? row : null;
    },
    async findByTransactionId(transactionId) {
      return row?.transactionId === transactionId ? row : null;
    },
    async findByCorrelationId(correlationId) {
      return row?.correlationId === correlationId ? row : null;
    },
    async insert(input) {
      if (row?.idempotencyKey === input.idempotencyKey) return row;
      row = created(input);
      return row;
    },
    async advance(input) {
      if (!row || row.transactionId !== input.transactionId || row.messageId !== input.messageId) {
        throw new Error('unknown_transaction');
      }
      if (input.status === 'CALLBACK_PENDING' && failCallbackPending) throw new Error('dispatch_not_durable');
      if (input.status === 'CALLBACK_PENDING') {
        row.transactionIssued = true;
        row.gatewayAcknowledged = row.observationSource === OndcObservationSource.REAL_NETWORK;
        row.status = OndcDispatchStatus.PENDING_CALLBACK;
      }
      return row;
    },
    async acceptCallback() {
      throw new Error('dispatch_not_durable');
    },
  };
}

function payload(transactionId = 'tx-mock-discovery'): OndcPayload<{ catalog: OndcCatalog }> {
  return {
    context: {
      domain: 'ONDC:RET12',
      country: 'IND',
      city: 'std:080',
      action: 'on_search',
      core_version: '1.2.0',
      bap_id: 'bap.example.test',
      bap_uri: 'https://bap.example.test/ondc',
      bpp_id: 'bpp.example.test',
      bpp_uri: 'https://bpp.example.test/ondc',
      transaction_id: transactionId,
      message_id: 'msg-mock-discovery',
      timestamp: OBSERVED_AT,
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

describe('ONDC discovery persistence (MOCK)', () => {
  it('persists a normalized MOCK observation and does not create procurement rows', () => {
    const persisted = persistNormalizedOndcOnSearch({
      payload: payload(),
      observedAt: OBSERVED_AT,
      scope: { requestedPin: '560048', requestedCategory: 'cotton yarn' },
      meta: { source: OndcObservationSource.MOCK, environment: OndcRuntimeEnvironment.LOCAL },
    });
    const again = persistNormalizedOndcOnSearch({
      payload: payload(),
      observedAt: OBSERVED_AT,
      scope: { requestedPin: '560048', requestedCategory: 'cotton yarn' },
      meta: { source: OndcObservationSource.MOCK, environment: OndcRuntimeEnvironment.LOCAL },
      store: persisted.store,
    });
    expect(persisted.candidates).toHaveLength(1);
    expect(again.identityCount).toBe(1);
    expect(again.suppliersInserted).toBe(0);
    expect(again.invitations).toBe(0);
    expect(again.quotes).toBe(0);
    expect(again.awards).toBe(0);
    expect(again.purchaseOrders).toBe(0);
    expect(again.payments).toBe(0);
    const retained = [...again.store.identities.values()][0];
    expect(retained?.source).toBe('MOCK');
    expect(retained?.source).not.toBe('REAL_NETWORK');
    expect(retained?.requestedPin).toBe('560048');
    expect(retained?.sellerPin).toBe('641001');
    expect(retained?.provider).toBe('ONDC');
    expect(retained?.rating).toBeNull();
    expect(retained?.liveSuccess).toBe(false);
  });

  it('rejects an unknown transaction and replays a verified MOCK callback without a network call', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network must not be called'));
    try {
      const idle = new OndcNetworkService();
      const blocked = await idle.broadcastRfqToOndc({ rfqId: 'tx-mock-discovery', title: 'yarn', category: 'cotton yarn' });
      expect(blocked.ok).toBe(false);
      expect(fetchSpy).not.toHaveBeenCalled();

      const keys = generateOndcKeyPair();
      const body = payload();
      const authHeader = createOndcAuthHeader({
        body,
        subscriberId: 'bpp.example.test',
        uniqueKeyId: 'key-mock',
        privateKeyPem: keys.privateKeyPem,
      });
      const receiver = new OndcBapReceiver({ lookupPublicKeyFn: async () => keys.publicKeyPem });
      const seen = new Set<string>();
      const store = createOndcDiscoveryStore();
      const meta = { source: OndcObservationSource.MOCK, environment: OndcRuntimeEnvironment.LOCAL } as const;
      const unknown = await ingestOndcOnSearchCallback({
        receiver,
        authHeader,
        body,
        payload: body,
        knownTransactionIds: [],
        seenMessageKeys: seen,
        observedAt: OBSERVED_AT,
        meta,
        store,
      });
      expect(unknown.ok).toBe(false);
      expect(unknown.reason).toBe('unknown_transaction');
      expect(unknown.invitations).toBe(0);

      const accepted = await ingestOndcOnSearchCallback({
        receiver,
        authHeader,
        body,
        payload: body,
        knownTransactionIds: ['tx-mock-discovery'],
        seenMessageKeys: seen,
        observedAt: OBSERVED_AT,
        scope: { requestedPin: '560048', requestedCategory: 'cotton yarn' },
        meta,
        store,
      });
      const replay = await ingestOndcOnSearchCallback({
        receiver,
        authHeader,
        body,
        payload: body,
        knownTransactionIds: ['tx-mock-discovery'],
        seenMessageKeys: seen,
        observedAt: OBSERVED_AT,
        scope: { requestedPin: '560048', requestedCategory: 'cotton yarn' },
        meta,
        store,
      });
      expect(accepted.ok).toBe(true);
      expect(accepted.identityCount).toBe(1);
      expect(replay.replay).toBe(true);
      expect(replay.identityCount).toBe(1);
      expect(store.identities.size).toBe(1);
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it('attaches a pre-prod client only for the pre-prod slot and never a production client (MOCK fetch)', async () => {
    const names = [
      'ONDC_ENVIRONMENT',
      'ONDC_ENABLED',
      'ONDC_PRODUCTION_ENABLED',
      'ONDC_PREPROD_GATEWAY_URL',
      'ONDC_PREPROD_SUBSCRIBER_ID',
      'ONDC_PREPROD_UNIQUE_KEY_ID',
      'ONDC_PREPROD_SIGNING_PRIVATE_KEY',
      'ONDC_PREPROD_REGISTRY_URL',
      'ONDC_PREPROD_CALLBACK_URL',
      'ONDC_PRODUCTION_GATEWAY_URL',
      'ONDC_PRODUCTION_SUBSCRIBER_ID',
      'ONDC_PRODUCTION_UNIQUE_KEY_ID',
      'ONDC_PRODUCTION_SIGNING_PRIVATE_KEY',
      'ONDC_PRODUCTION_REGISTRY_URL',
      'ONDC_PRODUCTION_CALLBACK_URL',
      'ONDC_SUBSCRIBER_ID',
      'ONDC_SIGNING_PRIVATE_KEY_PEM',
      'ONDC_GATEWAY_URL',
    ];
    const previous = new Map(names.map((name) => [name, process.env[name]]));
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ message: { ack: { status: 'ACK' } } }),
      text: async () => '',
    } as Response);
    const restore = () => {
      for (const [name, value] of previous) {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
      }
    };
    try {
      process.env.ONDC_ENVIRONMENT = 'PRODUCTION';
      process.env.ONDC_PRODUCTION_ENABLED = 'true';
      process.env.ONDC_PRODUCTION_GATEWAY_URL = 'https://production.example.test/gateway';
      process.env.ONDC_PRODUCTION_SUBSCRIBER_ID = 'production-slot.example.test';
      process.env.ONDC_PRODUCTION_UNIQUE_KEY_ID = 'production-key';
      process.env.ONDC_PRODUCTION_SIGNING_PRIVATE_KEY = 'production-signing-material';
      process.env.ONDC_PRODUCTION_REGISTRY_URL = 'https://production.example.test/registry';
      process.env.ONDC_PRODUCTION_CALLBACK_URL = 'https://production.example.test/callback';
      const production = new OndcNetworkService({ enabled: true });
      expect(production.getClient()).toBeNull();
      expect(production.getEnvironmentDecision().environment).toBe('PRODUCTION');
      const productionSearch = await production.broadcastRfqToOndc({
        rfqId: 'tx-prod-blocked',
        title: 'yarn',
        category: 'cotton yarn',
      });
      expect(productionSearch.ok).toBe(false);
      expect(fetchSpy).not.toHaveBeenCalled();

      for (const name of names) delete process.env[name];
      process.env.ONDC_ENVIRONMENT = 'PRE_PROD';
      process.env.ONDC_SUBSCRIBER_ID = 'legacy-slot.example.test';
      process.env.ONDC_SIGNING_PRIVATE_KEY_PEM = 'legacy-signing-material';
      process.env.ONDC_GATEWAY_URL = 'https://legacy.example.test/gateway';
      const legacy = new OndcNetworkService({ enabled: true });
      expect(legacy.getClient()).toBeNull();
      expect(legacy.getEnvironmentDecision().realClientAllowed).toBe(false);

      const preprodKeys = generateOndcKeyPair();
      process.env.ONDC_PREPROD_GATEWAY_URL = 'https://gateway.preprod.otp.test/gateway';
      process.env.ONDC_PREPROD_SUBSCRIBER_ID = 'preprod-slot.otp.test';
      process.env.ONDC_PREPROD_UNIQUE_KEY_ID = 'preprod-key';
      process.env.ONDC_PREPROD_SIGNING_PRIVATE_KEY = preprodKeys.privateKeyPem;
      process.env.ONDC_PREPROD_REGISTRY_URL = 'https://registry.preprod.otp.test';
      process.env.ONDC_PREPROD_CALLBACK_URL = 'https://callback.preprod.otp.test/ondc';
      const unstored = new OndcNetworkService({ enabled: true });
      expect(unstored.getClient()).not.toBeNull();
      const refusedSearch = await unstored.broadcastRfqToOndc({
        rfqId: 'tx-preprod-unstored',
        title: 'cotton yarn',
        category: 'cotton yarn',
        buyerRequestedPin: '560048',
        cityCode: 'std:080',
        initiatorId: 'operator-mock',
        taxonomyContext: { subcategoryCode: 'cotton_yarn', requirementMode: 'PRODUCT_MATERIAL' },
      });
      expect(refusedSearch.ok).toBe(false);
      expect(refusedSearch.error).toBe('dispatch_not_durable');
      expect(unstored.listIssuedTransactions()).toEqual([]);
      expect(fetchSpy).not.toHaveBeenCalled();

      const preprod = new OndcNetworkService({ enabled: true, dispatchStore: serviceSearchStore() });
      expect(preprod.getClient()).not.toBeNull();
      expect(preprod.getEnvironmentDecision().credentialSlot).toBe('PRE_PROD');
      const search = await preprod.broadcastRfqToOndc({
        rfqId: 'tx-preprod-mock',
        title: 'cotton yarn',
        category: 'cotton yarn',
        buyerRequestedPin: '560048',
        cityCode: 'std:080',
        initiatorId: 'operator-mock',
        taxonomyContext: { subcategoryCode: 'cotton_yarn', requirementMode: 'PRODUCT_MATERIAL' },
      });
      expect(search.ok).toBe(true);
      const calledUrl = String(fetchSpy.mock.calls[0]?.[0] ?? '');
      expect(calledUrl).toBe('https://gateway.preprod.otp.test/gateway/search');
      expect(calledUrl).not.toContain('production.example.test');
      expect(calledUrl).not.toContain('legacy.example.test');
      expect(preprod.listIssuedTransactions()).toEqual(['tx-preprod-mock']);
      fetchSpy.mockClear();
      const missingCity = await preprod.broadcastRfqToOndc({
        rfqId: 'tx-preprod-no-city',
        title: 'cotton yarn',
        category: 'cotton yarn',
        buyerRequestedPin: '560048',
        initiatorId: 'operator-mock',
        taxonomyContext: { subcategoryCode: 'cotton_yarn', requirementMode: 'PRODUCT_MATERIAL' },
      });
      expect(missingCity.ok).toBe(false);
      expect(missingCity.error).toBe('city_unresolved');
      expect(fetchSpy).not.toHaveBeenCalled();

      fetchSpy.mockClear();
      const flaky = serviceSearchStore(true);
      const flakyService = new OndcNetworkService({ enabled: true, dispatchStore: flaky });
      const acknowledged = {
        rfqId: 'tx-ack-persist',
        title: 'cotton yarn',
        category: 'cotton yarn',
        buyerRequestedPin: '560048',
        cityCode: 'std:080',
        initiatorId: 'operator-mock',
        taxonomyContext: { subcategoryCode: 'cotton_yarn', requirementMode: 'PRODUCT_MATERIAL' },
      };
      const failedAck = await flakyService.broadcastRfqToOndc(acknowledged);
      const identity = flaky.identity();
      expect(failedAck.ok).toBe(false);
      expect(failedAck.error).toBe('dispatch_not_durable');
      expect(failedAck.transactionId).toBe('tx-ack-persist');
      expect(flakyService.listIssuedTransactions()).toEqual([]);
      expect(identity?.transactionId).toBe('tx-ack-persist');
      expect(identity?.messageId.length).toBeGreaterThan(0);
      expect(identity?.correlationId.length).toBeGreaterThan(0);
      const firstBody = String((fetchSpy.mock.calls[0]?.[1] as RequestInit | undefined)?.body ?? '');
      expect(firstBody).toContain('"transaction_id":"tx-ack-persist"');
      expect(firstBody).toContain(`"message_id":"${identity?.messageId}"`);
      expect(String(fetchSpy.mock.calls[0]?.[0] ?? '')).not.toContain('prod.gateway.ondc.org');

      const retried = await flakyService.broadcastRfqToOndc(acknowledged);
      expect(retried.ok).toBe(false);
      expect(retried.transactionId).toBe('tx-ack-persist');
      expect(flaky.identity()).toEqual(identity);
      expect(fetchSpy).toHaveBeenCalledTimes(2);
      const secondBody = String((fetchSpy.mock.calls[1]?.[1] as RequestInit | undefined)?.body ?? '');
      expect(secondBody).toContain('"transaction_id":"tx-ack-persist"');
      expect(secondBody).toContain(`"message_id":"${identity?.messageId}"`);
      expect(flakyService.listIssuedTransactions()).toEqual([]);
    } finally {
      fetchSpy.mockRestore();
      restore();
    }
  });
});
