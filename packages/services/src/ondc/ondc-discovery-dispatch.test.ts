/**
 * ONDC-06 dispatch pipeline. Every fixture is MOCK. Fetch is stubbed. No live gateway call.
 */
import { describe, expect, it, vi } from 'vitest';
import {
  createOndcDiscoveryStore,
  createOndcDispatchLedger,
  OndcDispatchStatus,
  OndcObservationSource,
  OndcRuntimeEnvironment,
  type OndcDispatchRecord,
} from '@otp/domain';
import { generateOndcKeyPair, createOndcAuthHeader } from './crypto/ondc-auth-crypto';
import {
  acceptIssuedOndcOnSearch,
  executeOndcDiscoveryDispatch,
  runControlledOndcPreprodExercise,
  timeoutOndcDispatchCallback,
} from './ondc-discovery-dispatch';
import type { OndcDiscoveryDispatchInsert, OndcDiscoveryDispatchStore } from './ondc-discovery-dispatch-store';
import { lookupOndcSigningPublicKey, resolveOndcV2LookupUrl } from './ondc-registry-lookup';

const NOW = new Date('2026-10-04T03:30:00.000Z');

function request(overrides: Record<string, unknown> = {}) {
  return {
    otpTransactionId: 'tx-mock-ondc-06',
    subcategoryCode: 'cotton_yarn',
    requirementMode: 'PRODUCT_MATERIAL',
    buyerRequestedPin: '560048',
    cityCode: 'std:080',
    itemName: 'MOCK cotton yarn',
    initiatorId: 'operator-mock',
    ...overrides,
  };
}

function preprodConfig(privateKey: string, overrides: Record<string, unknown> = {}) {
  return {
    environmentRaw: 'PRE_PROD',
    maxRetries: overrides.maxRetries as string | undefined,
    preprod: {
      gatewayUrl: 'https://gateway.preprod.otp.test/gateway',
      subscriberId: 'bap.preprod.otp.test',
      uniqueKeyId: 'bap-key-mock',
      signingPrivateKey: privateKey,
      registryUrl: 'https://registry.preprod.otp.test',
      callbackUrl: 'https://callback.preprod.otp.test/ondc',
    },
    production: {},
    ...overrides,
  };
}

function productionConfig(privateKey: string) {
  return {
    environmentRaw: 'PRODUCTION',
    productionEnabled: 'true',
    preprod: {},
    production: {
      gatewayUrl: 'https://prod.gateway.ondc.org/search',
      subscriberId: 'bap.production.otp.test',
      uniqueKeyId: 'production-key',
      signingPrivateKey: privateKey,
      registryUrl: 'https://prod.registry.ondc.org',
      callbackUrl: 'https://callback.production.otp.test/ondc',
    },
  };
}

function ackResponse(): Response {
  return {
    ok: true,
    status: 200,
    json: async () => ({ message: { ack: { status: 'ACK' } } }),
    text: async () => '',
  } as Response;
}

/** Isolated stand-in for 00231. PRE_PROD unit tests inject this; they do not skip the store. */
function rememberedSearchStore(): OndcDiscoveryDispatchStore {
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
    initiatedAt: NOW.toISOString(),
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
    async findByIdempotencyKey() {
      return row;
    },
    async findByTransactionId(transactionId) {
      return row?.transactionId === transactionId ? row : null;
    },
    async findByCorrelationId(correlationId) {
      return row?.correlationId === correlationId ? row : null;
    },
    async insert(input) {
      const recovered = row?.idempotencyKey === input.idempotencyKey ? row : null;
      if (recovered) return recovered;
      row = created(input);
      return row;
    },
    async advance(input) {
      if (!row || row.transactionId !== input.transactionId || row.messageId !== input.messageId) {
        throw new Error('unknown_transaction');
      }
      if (input.status === 'CALLBACK_PENDING') {
        row.status = OndcDispatchStatus.PENDING_CALLBACK;
        row.transactionIssued = true;
        row.gatewayAcknowledged = row.observationSource === OndcObservationSource.REAL_NETWORK;
        row.realNetworkVerified = false;
      } else if (input.status === 'FAILED') {
        row.status = OndcDispatchStatus.FAILED;
        row.transactionIssued = true;
        row.gatewayAcknowledged = false;
        row.reason = input.failureReason ?? null;
      }
      return row;
    },
    async acceptCallback() {
      throw new Error('dispatch_not_durable');
    },
  };
}

describe('ONDC-06 discovery dispatch (MOCK)', () => {
  it('returns a labelled MOCK acknowledgement without calling the network', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network must not be called'));
    try {
      const ledger = createOndcDispatchLedger();
      const first = await executeOndcDiscoveryDispatch({
        request: request(),
        categoryLabel: 'cotton yarn',
        environmentConfig: { environmentRaw: 'LOCAL', preprod: {}, production: {} },
        ledger,
        now: () => NOW,
        ids: { correlationId: 'corr-mock-ondc-06', messageId: 'msg-mock-ondc-06' },
      });
      const second = await executeOndcDiscoveryDispatch({
        request: request(),
        categoryLabel: 'cotton yarn',
        environmentConfig: { environmentRaw: 'CI', preprod: {}, production: {} },
        ledger,
        now: () => NOW,
        ids: { correlationId: 'corr-other', messageId: 'msg-other' },
      });
      expect(first.mockAcknowledged).toBe(true);
      expect(first.mock).toBe(true);
      expect(first.observationSource).toBe('MOCK');
      expect(first.realNetworkVerified).toBe(false);
      expect(first.gatewayAcknowledged).toBe(false);
      expect(first.preparedRequest?.context.domain).toBe('ONDC:RET12');
      expect(first.preparedRequest?.context.bap_id).toBe('mock.otp.test');
      expect(first.preparedRequest?.message.intent.fulfillment.end.location.address.area_code).toBe('560048');
      expect(second.correlationId).toBe(first.correlationId);
      expect(second.transactionId).toBe(first.transactionId);
      expect(second.messageId).toBe(first.messageId);
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(JSON.stringify(first.buyerView)).not.toMatch(/Verified Supplier|BEGIN PRIVATE|Authorization/i);
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it('signs one idempotent PRE_PROD search, retries a 503, and refuses production', async () => {
    const keys = generateOndcKeyPair();
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    try {
      fetchSpy.mockResolvedValueOnce({
        ok: false,
        status: 503,
        text: async () => 'temporary',
        json: async () => ({}),
      } as Response);
      fetchSpy.mockResolvedValueOnce(ackResponse());
      const ledger = createOndcDispatchLedger();
      const dispatchStore = rememberedSearchStore();
      const sent = await executeOndcDiscoveryDispatch({
        request: request({ otpTransactionId: 'tx-mock-preprod' }),
        categoryLabel: 'cotton yarn',
        environmentConfig: preprodConfig(keys.privateKeyPem, { maxRetries: '1' }),
        ledger,
        dispatchStore,
        now: () => NOW,
        ids: { correlationId: 'corr-mock-preprod', messageId: 'msg-mock-preprod' },
        ondcEnabled: 'true',
      });
      expect(sent.gatewayAcknowledged).toBe(true);
      expect(sent.realNetworkVerified).toBe(false);
      expect(sent.callbackStatus).toBe('PENDING');
      expect(sent.observationSource).toBe('REAL_NETWORK');
      expect(sent.mock).toBe(false);
      expect(fetchSpy).toHaveBeenCalledTimes(2);
      const firstUrl = String(fetchSpy.mock.calls[0]?.[0]);
      const secondUrl = String(fetchSpy.mock.calls[1]?.[0]);
      expect(firstUrl).toBe('https://gateway.preprod.otp.test/gateway/search');
      expect(secondUrl).toBe(firstUrl);
      expect(firstUrl).not.toContain('prod.gateway.ondc.org');
      const firstBody = String((fetchSpy.mock.calls[0]?.[1] as RequestInit | undefined)?.body ?? '');
      const secondBody = String((fetchSpy.mock.calls[1]?.[1] as RequestInit | undefined)?.body ?? '');
      expect(firstBody).toBe(secondBody);
      expect(firstBody).toContain('"transaction_id":"tx-mock-preprod"');
      expect(firstBody).toContain('"message_id":"msg-mock-preprod"');
      expect(firstBody).not.toContain('BEGIN PRIVATE KEY');

      fetchSpy.mockClear();
      const again = await executeOndcDiscoveryDispatch({
        request: request({ otpTransactionId: 'tx-mock-preprod' }),
        categoryLabel: 'cotton yarn',
        environmentConfig: preprodConfig(keys.privateKeyPem, { maxRetries: '1' }),
        ledger,
        dispatchStore,
        now: () => NOW,
        ids: { correlationId: 'corr-other-preprod', messageId: 'msg-other-preprod' },
      });
      expect(again.correlationId).toBe('corr-mock-preprod');
      expect(fetchSpy).not.toHaveBeenCalled();

      const blocked = await executeOndcDiscoveryDispatch({
        request: request(),
        environmentConfig: productionConfig(keys.privateKeyPem),
        ondcEnabled: 'true',
        now: () => NOW,
      });
      expect(blocked.failure).toBe('PRODUCTION_REFUSED');
      expect(blocked.realNetworkVerified).toBe(false);
      expect(fetchSpy).not.toHaveBeenCalled();

      const fallback = await executeOndcDiscoveryDispatch({
        request: request(),
        environmentConfig: {
          environmentRaw: 'PRE_PROD',
          preprod: {},
          production: productionConfig(keys.privateKeyPem).production,
        },
        now: () => NOW,
      });
      expect(fallback.gatewayAcknowledged).toBe(false);
      expect(fallback.failure).toBe('CREDENTIAL_MISSING');
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it('correlates an authenticated MOCK callback and does not store a second event', async () => {
    const keys = generateOndcKeyPair();
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network must not be called'));
    try {
      const ledger = createOndcDispatchLedger();
      const dispatched = await executeOndcDiscoveryDispatch({
        request: request(),
        categoryLabel: 'cotton yarn',
        environmentConfig: { environmentRaw: 'LOCAL', preprod: {}, production: {} },
        ledger,
        now: () => NOW,
        ids: { correlationId: 'corr-mock-callback', messageId: 'msg-mock-callback' },
      });
      const body = {
        context: {
          domain: 'ONDC:RET12',
          country: 'IND',
          city: 'std:080',
          action: 'on_search' as const,
          core_version: '1.2.0',
          bap_id: 'mock.otp.test',
          bap_uri: 'https://mock.otp.test/ondc-callback',
          bpp_id: 'bpp.mock.otp.test',
          bpp_uri: 'https://bpp.mock.otp.test/ondc',
          transaction_id: dispatched.transactionId,
          message_id: dispatched.messageId,
          timestamp: '2026-10-04T03:40:00.000Z',
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
      const authHeader = createOndcAuthHeader({
        body,
        subscriberId: 'bpp.mock.otp.test',
        uniqueKeyId: 'bpp-key-mock',
        privateKeyPem: keys.privateKeyPem,
      });
      const store = createOndcDiscoveryStore();
      const accepted = await acceptIssuedOndcOnSearch({
        ledger,
        authHeader,
        body,
        processingEnvironment: OndcRuntimeEnvironment.LOCAL,
        processingSource: OndcObservationSource.MOCK,
        store,
        resolvePublicKey: async () => keys.publicKeyPem,
      });
      const replay = await acceptIssuedOndcOnSearch({
        ledger,
        authHeader,
        body,
        processingEnvironment: OndcRuntimeEnvironment.LOCAL,
        processingSource: OndcObservationSource.MOCK,
        store,
        resolvePublicKey: async () => keys.publicKeyPem,
      });
      expect(accepted.ok).toBe(true);
      expect(accepted.protocol.message.ack.status).toBe('ACK');
      expect(accepted.persistence).toBe('STORED_MOCK');
      expect(accepted.realNetworkVerified).toBe(false);
      expect(accepted.invitations).toBe(0);
      expect(accepted.quotes).toBe(0);
      expect(replay.replay).toBe(true);
      expect(replay.protocol.message.ack.status).toBe('ACK');
      expect(store.identities.size).toBe(1);
      const retained = [...store.identities.values()][0];
      expect(retained?.requestedPin).toBe('560048');
      expect(retained?.sellerPin).toBe('641001');
      expect(retained?.source).toBe('MOCK');
      expect(retained?.source).not.toBe('REAL_NETWORK');
      expect(fetchSpy).not.toHaveBeenCalled();

      const separated = await acceptIssuedOndcOnSearch({
        ledger,
        authHeader,
        body,
        processingEnvironment: OndcRuntimeEnvironment.PRE_PROD,
        processingSource: OndcObservationSource.REAL_NETWORK,
        store: createOndcDiscoveryStore(),
        resolvePublicKey: async () => keys.publicKeyPem,
      });
      expect(separated.ok).toBe(false);
      expect(separated.reason).toBe('environment_mismatch');
      expect(separated.persistence).toBe('REJECTED');
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it('keeps a missing callback pending and the exercise closed to anonymous callers', async () => {
    const keys = generateOndcKeyPair();
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(ackResponse());
    try {
      const ledger = createOndcDispatchLedger();
      const sent = await executeOndcDiscoveryDispatch({
        request: request({ otpTransactionId: 'tx-mock-pending' }),
        categoryLabel: 'cotton yarn',
        environmentConfig: preprodConfig(keys.privateKeyPem),
        ledger,
        dispatchStore: rememberedSearchStore(),
        now: () => NOW,
        ids: { correlationId: 'corr-mock-pending', messageId: 'msg-mock-pending' },
      });
      expect(sent.callbackStatus).toBe('PENDING');
      expect(sent.realNetworkVerified).toBe(false);
      const timedOut = timeoutOndcDispatchCallback(ledger, 'corr-mock-pending');
      expect(timedOut?.status).toBe('CALLBACK_TIMED_OUT');
      expect(timedOut?.realNetworkVerified).toBe(false);
      expect(timedOut?.failure).toBe('CALLBACK_TIMEOUT');

      const anonymous = await runControlledOndcPreprodExercise({
        exercise: true,
        actorId: 'anonymous',
        request: request(),
        environmentConfig: preprodConfig(keys.privateKeyPem),
        now: () => NOW,
      });
      expect(anonymous.failure).toBe('UNAUTHENTICATED');
      const closed = await runControlledOndcPreprodExercise({
        exercise: false,
        actorId: 'operator-mock',
        request: request(),
        environmentConfig: preprodConfig(keys.privateKeyPem),
        now: () => NOW,
      });
      expect(closed.reason).toBe('exercise_not_enabled');
      expect(fetchSpy.mock.calls.length).toBe(1);

      const fixtureExercise = await runControlledOndcPreprodExercise({
        exercise: true,
        actorId: 'operator-mock',
        request: request(),
        environmentConfig: preprodConfig(keys.privateKeyPem),
        now: () => NOW,
        hostedCallbackAttested: true,
      });
      expect(fixtureExercise.reason).toBe('callback_not_hosted');
      expect(fixtureExercise.realNetworkVerified).toBe(false);
      expect(fetchSpy.mock.calls.length).toBe(1);

      const unattested = await runControlledOndcPreprodExercise({
        exercise: true,
        actorId: 'operator-mock',
        request: request(),
        environmentConfig: {
          ...preprodConfig(keys.privateKeyPem),
          preprod: {
            ...preprodConfig(keys.privateKeyPem).preprod,
            callbackUrl: 'https://buyer.opentradeprocurement.ai/functions/v1/ondc-on-search',
            gatewayUrl: 'https://gateway.preprod.otp.test/gateway',
          },
        },
        now: () => NOW,
      });
      expect(unattested.reason).toBe('callback_not_hosted');
      expect(fetchSpy.mock.calls.length).toBe(1);
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it('looks up a MOCK registry key only at the cited v2 path and never production', async () => {
    const keys = generateOndcKeyPair();
    expect(resolveOndcV2LookupUrl('https://registry.preprod.otp.test')).toBe('https://registry.preprod.otp.test/v2.0/lookup');
    expect(resolveOndcV2LookupUrl('https://prod.registry.ondc.org')).toBeNull();
    expect(resolveOndcV2LookupUrl('https://registry.preprod.otp.test/custom')).toBeNull();
    const fetchSpy = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => [
        {
          subscriber_id: 'bpp.mock.otp.test',
          ukId: 'bpp-key-mock',
          signing_public_key: keys.publicKeyBase64,
          valid_until: '2099-01-01T00:00:00.000Z',
        },
      ],
    })) as unknown as typeof fetch;
    const found = await lookupOndcSigningPublicKey({
      registryUrl: 'https://registry.preprod.otp.test',
      subscriberId: 'bap.preprod.otp.test',
      uniqueKeyId: 'bap-key-mock',
      signingPrivateKey: keys.privateKeyPem,
      targetSubscriberId: 'bpp.mock.otp.test',
      targetUniqueKeyId: 'bpp-key-mock',
      country: 'IND',
      city: 'std:080',
      domain: 'ONDC:RET12',
      timeoutMs: 1000,
      fetchImpl: fetchSpy,
    });
    expect(found).toBe(keys.publicKeyBase64);
    const call = (fetchSpy as unknown as { mock: { calls: unknown[][] } }).mock.calls[0];
    const url = String(call?.[0]);
    const init = call?.[1] as { body?: string; headers?: { Authorization?: string } };
    expect(url).toBe('https://registry.preprod.otp.test/v2.0/lookup');
    expect(url).not.toContain('prod.registry.ondc.org');
    expect(JSON.parse(String(init?.body))).toEqual({
      subscriber_id: 'bpp.mock.otp.test',
      country: 'IND',
      city: 'std:080',
      domain: 'ONDC:RET12',
      type: 'BPP',
      ukId: 'bpp-key-mock',
    });
    expect(String(init?.body)).not.toContain('BEGIN PRIVATE KEY');
    expect(String(init?.headers?.Authorization).startsWith('Signature ')).toBe(true);
    const blocked = await lookupOndcSigningPublicKey({
      registryUrl: 'https://prod.registry.ondc.org/v2.0/lookup',
      subscriberId: 'bap.preprod.otp.test',
      uniqueKeyId: 'bap-key-mock',
      signingPrivateKey: keys.privateKeyPem,
      targetSubscriberId: 'bpp.mock.otp.test',
      targetUniqueKeyId: 'bpp-key-mock',
      country: 'IND',
      city: 'std:080',
      domain: 'ONDC:RET12',
      timeoutMs: 1000,
      fetchImpl: fetchSpy,
    });
    expect(blocked).toBeNull();
    expect((fetchSpy as unknown as { mock: { calls: unknown[][] } }).mock.calls).toHaveLength(1);

    const rejectedRow = async (row: Record<string, unknown>) => {
      const lookup = vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => [row],
      })) as unknown as typeof fetch;
      return lookupOndcSigningPublicKey({
        registryUrl: 'https://registry.preprod.otp.test',
        subscriberId: 'bap.preprod.otp.test',
        uniqueKeyId: 'bap-key-mock',
        signingPrivateKey: keys.privateKeyPem,
        targetSubscriberId: 'bpp.mock.otp.test',
        targetUniqueKeyId: 'bpp-key-mock',
        country: 'IND',
        city: 'std:080',
        domain: 'ONDC:RET12',
        timeoutMs: 1000,
        fetchImpl: lookup,
      });
    };
    expect(await rejectedRow({
      subscriber_id: 'bpp.mock.otp.test',
      ukId: 'bpp-key-mock',
      type: 'BAP',
      status: 'SUBSCRIBED',
      signing_public_key: keys.publicKeyBase64,
      valid_until: '2099-01-01T00:00:00.000Z',
    })).toBeNull();
    expect(await rejectedRow({
      subscriber_id: 'bpp.mock.otp.test',
      ukId: 'bpp-key-mock',
      type: 'BPP',
      status: 'INITIATED',
      signing_public_key: keys.publicKeyBase64,
      valid_until: '2099-01-01T00:00:00.000Z',
    })).toBeNull();
    expect(await rejectedRow({
      subscriber_id: 'bpp.mock.otp.test',
      ukId: 'bpp-key-mock',
      type: 'BPP',
      status: 'SUBSCRIBED',
      signing_public_key: keys.publicKeyBase64,
      valid_until: '2000-01-01T00:00:00.000Z',
    })).toBeNull();
  });
});
