/**
 * 00231 correlation survives a discarded in-memory ledger.
 * The journal below is the stand-in for the database. The ledger Map is not.
 */
import { describe, expect, it, vi } from 'vitest';
import {
  OndcDispatchFailureClass,
  OndcDispatchStatus,
  OndcObservationSource,
  OndcRuntimeEnvironment,
  createOndcDispatchLedger,
  type OndcDispatchRecord,
} from '@otp/domain';
import { createOndcAuthHeader, generateOndcKeyPair } from './crypto/ondc-auth-crypto';
import {
  acceptIssuedOndcOnSearch,
  executeOndcDiscoveryDispatch,
  timeoutDurableOndcDispatch,
} from './ondc-discovery-dispatch';
import type {
  OndcDiscoveryCallbackAccept,
  OndcDiscoveryCallbackAcceptResult,
  OndcDiscoveryDispatchInsert,
  OndcDiscoveryDispatchStore,
} from './ondc-discovery-dispatch-store';

const NOW = new Date('2026-10-04T03:30:00.000Z');

function request() {
  return {
    otpTransactionId: 'tx-durable-00231',
    subcategoryCode: 'cotton_yarn',
    requirementMode: 'PRODUCT_MATERIAL',
    buyerRequestedPin: '560048',
    cityCode: 'std:0421',
    itemName: 'MOCK cotton yarn',
    initiatorId: 'operator-mock',
  };
}

interface Journal extends OndcDiscoveryDispatchStore {
  observations: Array<{ providerSupplierId: string; requestedPin: string; sellerPin: string | null }>;
  finds: number;
  rows: number;
}

function createJournal(): Journal {
  const byTransaction = new Map<string, OndcDispatchRecord>();
  const byKey = new Map<string, OndcDispatchRecord>();
  const byCorrelation = new Map<string, OndcDispatchRecord>();
  const observations: Journal['observations'] = [];
  const journal: Journal = {
    observations,
    finds: 0,
    get rows() {
      return byTransaction.size;
    },
    async findByIdempotencyKey(idempotencyKey) {
      journal.finds += 1;
      return byKey.get(idempotencyKey) ?? null;
    },
    async findByTransactionId(transactionId) {
      journal.finds += 1;
      return byTransaction.get(transactionId) ?? null;
    },
    async findByCorrelationId(correlationId) {
      journal.finds += 1;
      return byCorrelation.get(correlationId) ?? null;
    },
    async insert(input: OndcDiscoveryDispatchInsert) {
      const recovered = byKey.get(input.idempotencyKey);
      if (recovered) return recovered;
      if (byTransaction.has(input.transactionId)) throw new Error('transaction_id_reused');
      const row: OndcDispatchRecord = {
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
      };
      byTransaction.set(row.transactionId, row);
      byKey.set(row.idempotencyKey, row);
      byCorrelation.set(row.correlationId, row);
      return row;
    },
    async advance(input) {
      const row = byTransaction.get(input.transactionId);
      if (!row || row.messageId !== input.messageId) throw new Error('unknown_transaction');
      if (input.status === 'CALLBACK_PENDING') {
        row.status = row.observationSource === OndcObservationSource.MOCK
          ? OndcDispatchStatus.MOCK_ACK
          : OndcDispatchStatus.PENDING_CALLBACK;
        row.transactionIssued = true;
        row.realNetworkVerified = false;
        row.persistence = 'NOT_STORED';
      } else if (input.status === 'TIMED_OUT') {
        if (row.status !== OndcDispatchStatus.PENDING_CALLBACK && row.status !== OndcDispatchStatus.MOCK_ACK) {
          throw new Error('invalid_lifecycle_status');
        }
        row.status = OndcDispatchStatus.CALLBACK_TIMED_OUT;
        row.failure = OndcDispatchFailureClass.CALLBACK_TIMEOUT;
        row.reason = input.failureReason ?? 'callback_timeout';
        row.realNetworkVerified = false;
        row.persistence = 'NOT_STORED';
      } else if (input.status === 'FAILED') {
        row.status = OndcDispatchStatus.FAILED;
        row.transactionIssued = true;
        row.realNetworkVerified = false;
        row.reason = input.failureReason ?? null;
      } else if (input.status === 'DISPATCHING') {
        row.transactionIssued = false;
        row.realNetworkVerified = false;
      }
      return row;
    },
    async acceptCallback(input: OndcDiscoveryCallbackAccept): Promise<OndcDiscoveryCallbackAcceptResult> {
      const row = byTransaction.get(input.transactionId);
      const rejected = (reason: string): OndcDiscoveryCallbackAcceptResult => ({
        ok: false,
        replay: false,
        stale: reason === 'canonical_observed_at_regression',
        reason,
        persistence: 'REJECTED',
        realNetworkVerified: false,
        identityCount: 0,
      });
      if (!row) return rejected('unknown_transaction');
      if (row.messageId !== input.messageId) return rejected('unknown_message');
      if (!row.transactionIssued) return rejected('callback_not_pending');
      if (input.environment !== row.environment || input.observationSource !== row.observationSource) {
        return rejected(input.observationSource === row.observationSource ? 'environment_mismatch' : 'mock_not_real');
      }
      if (input.domain && input.domain !== row.domain) return rejected('wrong_context');
      if (input.bapId && input.bapId !== row.expectedBapId) return rejected('wrong_context');
      if (row.boundParticipantId && row.boundParticipantId !== input.callbackSubscriber) return rejected('wrong_provider');
      if (row.callbackDigest && row.callbackDigest !== input.bodyDigest) return rejected('duplicate_message');
      if (row.callbackDigest === input.bodyDigest) {
        return {
          ok: true,
          replay: true,
          stale: false,
          reason: 'replay',
          persistence: row.persistence,
          realNetworkVerified: false,
          identityCount: 0,
        };
      }
      if (row.canonicalObservedAt && Date.parse(input.observedAt) < Date.parse(row.canonicalObservedAt)) {
        return rejected('canonical_observed_at_regression');
      }
      const sellers = input.candidates.filter((candidate) => candidate.provider_supplier_id.trim().length > 0);
      if (sellers.length === 0) return rejected('observation_not_retained');
      for (const seller of sellers) {
        observations.push({
          providerSupplierId: seller.provider_supplier_id,
          requestedPin: row.buyerRequestedPin,
          sellerPin: seller.seller_pin ?? null,
        });
      }
      row.callbackDigest = input.bodyDigest;
      row.canonicalObservedAt = input.observedAt;
      row.boundParticipantId = input.callbackSubscriber;
      row.status = OndcDispatchStatus.CALLBACK_VERIFIED;
      row.persistence = row.observationSource === OndcObservationSource.REAL_NETWORK ? 'STORED_REAL' : 'STORED_MOCK';
      row.realNetworkVerified = row.observationSource === OndcObservationSource.REAL_NETWORK;
      return {
        ok: true,
        replay: false,
        stale: false,
        reason: null,
        persistence: row.persistence,
        realNetworkVerified: row.realNetworkVerified,
        identityCount: sellers.length,
      };
    },
  };
  return journal;
}

function catalog(transactionId: string, messageId: string, timestamp: string, sellerName = 'Mock Reported Seller') {
  return {
    context: {
      domain: 'ONDC:RET12',
      country: 'IND',
      city: 'std:0421',
      action: 'on_search' as const,
      core_version: '1.2.0',
      bap_id: 'mock.otp.test',
      bap_uri: 'https://mock.otp.test/ondc-callback',
      bpp_id: 'bpp.mock.otp.test',
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
            descriptor: { name: sellerName },
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

describe('00231 durable ONDC dispatch correlation', () => {
  it('lets a later process find the dispatch after the first ledger is discarded', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network must not be called'));
    try {
      const keys = generateOndcKeyPair();
      const journal = createJournal();
      const processA = createOndcDispatchLedger();
      const dispatched = await executeOndcDiscoveryDispatch({
        request: request(),
        categoryLabel: 'cotton yarn',
        environmentConfig: { environmentRaw: 'LOCAL', preprod: {}, production: {} },
        ledger: processA,
        dispatchStore: journal,
        now: () => NOW,
        ids: { correlationId: 'corr-durable-00231', messageId: 'msg-durable-00231' },
      });
      expect(dispatched.mockAcknowledged).toBe(true);
      expect(dispatched.realNetworkVerified).toBe(false);
      expect(dispatched.observationSource).toBe('MOCK');
      expect(journal.rows).toBe(1);
      expect(journal.observations).toHaveLength(0);
      expect(fetchSpy).not.toHaveBeenCalled();

      const again = await executeOndcDiscoveryDispatch({
        request: request(),
        categoryLabel: 'cotton yarn',
        environmentConfig: { environmentRaw: 'LOCAL', preprod: {}, production: {} },
        ledger: createOndcDispatchLedger(),
        dispatchStore: journal,
        now: () => NOW,
      });
      expect(again.messageId).toBe(dispatched.messageId);
      expect(again.transactionId).toBe(dispatched.transactionId);
      expect(journal.rows).toBe(1);

      const processB = createOndcDispatchLedger();
      expect(processB.byTransactionId.size).toBe(0);
      const body = catalog(dispatched.transactionId, dispatched.messageId, '2026-10-04T03:40:00.000Z');
      const authorization = createOndcAuthHeader({
        body,
        subscriberId: 'bpp.mock.otp.test',
        uniqueKeyId: 'bpp-key-mock',
        privateKeyPem: keys.privateKeyPem,
      });
      const accepted = await acceptIssuedOndcOnSearch({
        ledger: processB,
        authHeader: authorization,
        body,
        processingEnvironment: OndcRuntimeEnvironment.LOCAL,
        processingSource: OndcObservationSource.MOCK,
        dispatchStore: journal,
        resolvePublicKey: async () => keys.publicKeyPem,
      });
      const replay = await acceptIssuedOndcOnSearch({
        ledger: createOndcDispatchLedger(),
        authHeader: authorization,
        body,
        processingEnvironment: OndcRuntimeEnvironment.LOCAL,
        processingSource: OndcObservationSource.MOCK,
        dispatchStore: journal,
        resolvePublicKey: async () => keys.publicKeyPem,
      });
      expect(journal.finds).toBeGreaterThan(0);
      expect(processB.byTransactionId.size).toBe(0);
      expect(accepted.ok).toBe(true);
      expect(accepted.realNetworkVerified).toBe(false);
      expect(accepted.persistence).toBe('STORED_MOCK');
      expect(replay.replay).toBe(true);
      expect(journal.observations).toHaveLength(1);
      expect(journal.observations[0]?.requestedPin).toBe('560048');
      expect(journal.observations[0]?.sellerPin).toBe('641001');
      expect(journal.rows).toBe(1);

      const changed = catalog(dispatched.transactionId, dispatched.messageId, '2026-10-04T03:20:00.000Z', 'Changed Seller');
      const changedAuth = createOndcAuthHeader({
        body: changed,
        subscriberId: 'bpp.mock.otp.test',
        uniqueKeyId: 'bpp-key-mock',
        privateKeyPem: keys.privateKeyPem,
      });
      const rejected = await acceptIssuedOndcOnSearch({
        ledger: createOndcDispatchLedger(),
        authHeader: changedAuth,
        body: changed,
        processingEnvironment: OndcRuntimeEnvironment.LOCAL,
        processingSource: OndcObservationSource.MOCK,
        dispatchStore: journal,
        resolvePublicKey: async () => keys.publicKeyPem,
      });
      expect(rejected.ok).toBe(false);
      expect(rejected.reason).toBe('duplicate_message');
      expect(journal.observations).toHaveLength(1);
      expect(journal.rows).toBe(1);
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it('does not treat a database failure as a successful dispatch or create a callback dispatch', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network must not be called'));
    try {
      const broken: OndcDiscoveryDispatchStore = {
        async findByIdempotencyKey() {
          return null;
        },
        async findByTransactionId() {
          throw new Error('dispatch_not_durable');
        },
        async findByCorrelationId() {
          throw new Error('dispatch_not_durable');
        },
        async insert() {
          throw new Error('dispatch_not_durable');
        },
        async advance() {
          throw new Error('dispatch_not_durable');
        },
        async acceptCallback() {
          throw new Error('dispatch_not_durable');
        },
      };
      const failed = await executeOndcDiscoveryDispatch({
        request: request(),
        categoryLabel: 'cotton yarn',
        environmentConfig: { environmentRaw: 'LOCAL', preprod: {}, production: {} },
        ledger: createOndcDispatchLedger(),
        dispatchStore: broken,
        now: () => NOW,
        ids: { correlationId: 'corr-fail', messageId: 'msg-fail' },
      });
      expect(failed.ok).toBe(false);
      expect(failed.mockAcknowledged).toBe(false);
      expect(failed.gatewayAcknowledged).toBe(false);
      expect(failed.realNetworkVerified).toBe(false);
      expect(failed.failure).toBe('PERSISTENCE');
      expect(failed.persistence).toBe('REJECTED');
      expect(fetchSpy).not.toHaveBeenCalled();

      const keys = generateOndcKeyPair();
      const empty = createJournal();
      const body = catalog('tx-unknown', 'msg-unknown', '2026-10-04T03:40:00.000Z');
      const authorization = createOndcAuthHeader({
        body,
        subscriberId: 'bpp.mock.otp.test',
        uniqueKeyId: 'bpp-key-mock',
        privateKeyPem: keys.privateKeyPem,
      });
      const unknown = await acceptIssuedOndcOnSearch({
        ledger: createOndcDispatchLedger(),
        authHeader: authorization,
        body,
        processingEnvironment: OndcRuntimeEnvironment.LOCAL,
        processingSource: OndcObservationSource.MOCK,
        dispatchStore: empty,
        resolvePublicKey: async () => keys.publicKeyPem,
      });
      expect(unknown.ok).toBe(false);
      expect(unknown.reason).toBe('unknown_transaction');
      expect(empty.rows).toBe(0);
      expect(empty.observations).toHaveLength(0);
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it('marks a durable timeout as timed out and leaves real verification false', async () => {
    const journal = createJournal();
    const dispatched = await executeOndcDiscoveryDispatch({
      request: { ...request(), otpTransactionId: 'tx-durable-timeout' },
      categoryLabel: 'cotton yarn',
      environmentConfig: { environmentRaw: 'LOCAL', preprod: {}, production: {} },
      ledger: createOndcDispatchLedger(),
      dispatchStore: journal,
      now: () => NOW,
      ids: { correlationId: 'corr-durable-timeout', messageId: 'msg-durable-timeout' },
    });
    const timedOut = await timeoutDurableOndcDispatch(journal, dispatched.correlationId);
    expect(timedOut?.status).toBe('CALLBACK_TIMED_OUT');
    expect(timedOut?.realNetworkVerified).toBe(false);
    expect(timedOut?.failure).toBe('CALLBACK_TIMEOUT');
    expect(journal.observations).toHaveLength(0);
  });

  it('keeps a gateway acknowledgement fail-closed and reuses the durable identity', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ message: { ack: { status: 'ACK' } } }),
      text: async () => '',
    } as Response);
    try {
      const keys = generateOndcKeyPair();
      const preprod = {
        environmentRaw: 'PRE_PROD' as const,
        preprod: {
          gatewayUrl: 'https://gateway.preprod.otp.test/gateway',
          subscriberId: 'bap.preprod.otp.test',
          uniqueKeyId: 'bap-key-mock',
          signingPrivateKey: keys.privateKeyPem,
          registryUrl: 'https://registry.preprod.otp.test',
          callbackUrl: 'https://callback.preprod.otp.test/ondc',
        },
        production: {},
      };
      const blocked = await executeOndcDiscoveryDispatch({
        request: request(),
        categoryLabel: 'cotton yarn',
        environmentConfig: preprod,
        ledger: createOndcDispatchLedger(),
        now: () => NOW,
        ids: { correlationId: 'corr-no-store', messageId: 'msg-no-store' },
      });
      expect(blocked.ok).toBe(false);
      expect(blocked.gatewayAcknowledged).toBe(false);
      expect(blocked.realNetworkVerified).toBe(false);
      expect(blocked.failure).toBe('PERSISTENCE');
      expect(blocked.reason).toBe('dispatch_not_durable');
      expect(fetchSpy).not.toHaveBeenCalled();

      const journal = createJournal();
      const advance = journal.advance.bind(journal);
      let failPending = true;
      journal.advance = async (input) => {
        if (input.status === 'CALLBACK_PENDING' && failPending) throw new Error('dispatch_not_durable');
        const row = await advance(input);
        if (input.status === 'CALLBACK_PENDING') {
          row.gatewayAcknowledged = true;
          row.realNetworkVerified = false;
        }
        return row;
      };
      const sent = await executeOndcDiscoveryDispatch({
        request: { ...request(), otpTransactionId: 'tx-ack-persist' },
        categoryLabel: 'cotton yarn',
        environmentConfig: preprod,
        ledger: createOndcDispatchLedger(),
        dispatchStore: journal,
        now: () => NOW,
        ids: { correlationId: 'corr-ack-persist', messageId: 'msg-ack-persist' },
      });
      expect(sent.ok).toBe(false);
      expect(sent.gatewayAcknowledged).toBe(false);
      expect(sent.realNetworkVerified).toBe(false);
      expect(sent.failure).toBe('PERSISTENCE');
      expect(sent.transactionId).toBe('tx-ack-persist');
      expect(sent.messageId).toBe('msg-ack-persist');
      expect(sent.correlationId).toBe('corr-ack-persist');
      expect(journal.rows).toBe(1);
      const firstBody = String((fetchSpy.mock.calls[0]?.[1] as RequestInit | undefined)?.body ?? '');
      expect(firstBody).toContain('"message_id":"msg-ack-persist"');
      expect(String(fetchSpy.mock.calls[0]?.[0] ?? '')).not.toContain('prod.gateway.ondc.org');

      const retried = await executeOndcDiscoveryDispatch({
        request: { ...request(), otpTransactionId: 'tx-ack-persist' },
        categoryLabel: 'cotton yarn',
        environmentConfig: preprod,
        ledger: createOndcDispatchLedger(),
        dispatchStore: journal,
        now: () => NOW,
        ids: { correlationId: 'corr-new', messageId: 'msg-new' },
      });
      expect(retried.ok).toBe(false);
      expect(retried.gatewayAcknowledged).toBe(false);
      expect(retried.transactionId).toBe('tx-ack-persist');
      expect(retried.messageId).toBe('msg-ack-persist');
      expect(retried.correlationId).toBe('corr-ack-persist');
      expect(journal.rows).toBe(1);
      const secondBody = String((fetchSpy.mock.calls[1]?.[1] as RequestInit | undefined)?.body ?? '');
      expect(secondBody).toContain('"transaction_id":"tx-ack-persist"');
      expect(secondBody).toContain('"message_id":"msg-ack-persist"');
      expect(secondBody).not.toContain('msg-new');

      failPending = false;
      const recovered = await executeOndcDiscoveryDispatch({
        request: { ...request(), otpTransactionId: 'tx-ack-persist' },
        categoryLabel: 'cotton yarn',
        environmentConfig: preprod,
        ledger: createOndcDispatchLedger(),
        dispatchStore: journal,
        now: () => NOW,
        ids: { correlationId: 'corr-new', messageId: 'msg-new' },
      });
      expect(recovered.gatewayAcknowledged).toBe(true);
      expect(recovered.realNetworkVerified).toBe(false);
      expect(recovered.messageId).toBe('msg-ack-persist');
      expect(recovered.correlationId).toBe('corr-ack-persist');
      expect(journal.rows).toBe(1);
      fetchSpy.mockClear();
      const replay = await executeOndcDiscoveryDispatch({
        request: { ...request(), otpTransactionId: 'tx-ack-persist' },
        categoryLabel: 'cotton yarn',
        environmentConfig: preprod,
        ledger: createOndcDispatchLedger(),
        dispatchStore: journal,
        now: () => NOW,
        ids: { correlationId: 'corr-new', messageId: 'msg-new' },
      });
      expect(replay.transactionId).toBe('tx-ack-persist');
      expect(replay.messageId).toBe('msg-ack-persist');
      expect(replay.correlationId).toBe('corr-ack-persist');
      expect(replay.realNetworkVerified).toBe(false);
      expect(journal.rows).toBe(1);
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
    }
  });
});
