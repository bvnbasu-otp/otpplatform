import { describe, expect, it } from 'vitest';
import { SupplierNetworkProviderKind } from '../types/supplier-provider-identity';
import { normalizeOndcOnSearchRecord, type OndcOnSearchRecord } from './ondc-provider-foundation';
import {
  OndcObservationSource,
  OndcRuntimeEnvironment,
} from './ondc-environment';
import {
  createOndcDiscoveryStore,
  ondcDiscoveryProcurementCounts,
  ondcDiscoveryRfqCapability,
  rejectOndcProviderMutation,
  retainOndcDiscoveryFromUntrusted,
  retainOndcDiscoveryObservation,
  toOndcDiscoveryBuyerView,
} from './ondc-discovery-persistence';

function candidate(overrides: Partial<OndcOnSearchRecord> = {}, requestedPin = '560048') {
  const result = normalizeOndcOnSearchRecord(
    {
      participantId: 'participant-discovery-a',
      sellerId: 'seller-discovery-a',
      sellerName: 'Reported Discovery Seller',
      locationId: 'location-discovery-a',
      endpoint: 'https://bpp.example.test/ondc',
      sellerPin: '641001',
      sellerCity: 'Coimbatore',
      sellerState: 'Tamil Nadu',
      correlationId: 'tx-discovery-a',
      messageId: 'msg-discovery-a',
      contextTimestamp: '2026-10-01T05:30:00.000Z',
      domain: 'ONDC:RET12',
      ...overrides,
    },
    { requestedPin, requestedCategory: 'cotton yarn' },
  );
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.reason);
  return result.candidate;
}

const meta = { source: OndcObservationSource.MOCK, environment: OndcRuntimeEnvironment.LOCAL } as const;

describe('ONDC discovery observation store', () => {
  it('keeps one identity for duplicate and concurrent observations without using the timestamp as the key', () => {
    const store = createOndcDiscoveryStore();
    const first = retainOndcDiscoveryObservation(store, candidate(), meta);
    const replay = retainOndcDiscoveryObservation(store, candidate(), meta);
    const renamed = retainOndcDiscoveryObservation(
      store,
      candidate({ sellerName: 'Reported Discovery Seller', sellerId: 'seller-discovery-b', correlationId: 'tx-other' }),
      meta,
    );
    expect(first.ok && replay.ok && renamed.ok).toBe(true);
    expect(store.identities.size).toBe(2);
    expect(replay.ok && replay.replay).toBe(true);
    expect([...store.identities.values()].every((row) => row.provider === SupplierNetworkProviderKind.ONDC)).toBe(true);
  });

  it('does not merge on name, link an OTP supplier, or overwrite the buyer PIN', () => {
    const store = createOndcDiscoveryStore();
    retainOndcDiscoveryObservation(store, candidate({ phone: undefined, email: undefined }), meta);
    const later = retainOndcDiscoveryObservation(
      store,
      candidate(
        {
          correlationId: 'tx-discovery-b',
          messageId: 'msg-discovery-b',
          contextTimestamp: '2026-10-01T06:30:00.000Z',
          sellerPin: '641001',
          phone: '9876543210',
        },
        '641001',
      ),
      meta,
    );
    expect(later.ok).toBe(true);
    if (!later.ok) return;
    expect(later.retained.requestedPin).toBe('560048');
    expect(later.retained.sellerPin).toBe('641001');
    expect(later.retained.requestedPin).not.toBe(later.retained.sellerPin);
    expect(later.retained.reportedPhone).toBe('9876543210');
    expect(later.retained.bppUri).toBe('https://bpp.example.test/ondc');
    expect(later.retained.liveSuccess).toBe(false);
    expect(later.retained.otpSupplierId).toBeNull();
    expect(later.retained.placeId).toBeNull();
    expect(later.retained.rating).toBeNull();
    expect(later.retained.registered).toBe(false);
    expect(ondcDiscoveryProcurementCounts(store)).toEqual({
      suppliersInserted: 0,
      invitations: 0,
      quotes: 0,
      awards: 0,
      purchaseOrders: 0,
      payments: 0,
    });
    const sameName = retainOndcDiscoveryObservation(
      store,
      candidate({ sellerId: 'seller-same-name', sellerName: 'Reported Discovery Seller' }),
      meta,
    );
    expect(sameName.ok && sameName.created).toBe(true);
    expect(store.identities.size).toBe(2);
  });

  it('rejects provider mutation, client injection, mock-as-real, and production without activation', () => {
    const store = createOndcDiscoveryStore();
    const saved = retainOndcDiscoveryObservation(store, candidate(), meta);
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    expect(rejectOndcProviderMutation(saved.retained, 'GOOGLE_PLACES')).toEqual({
      ok: false,
      reason: 'provider_immutable',
    });
    expect(
      retainOndcDiscoveryFromUntrusted(store, { rating: 4.5, liveSuccess: true, placeId: 'ChIJ' }, candidate(), meta),
    ).toMatchObject({ ok: false, reason: 'client_injection_rejected' });
    expect(
      retainOndcDiscoveryObservation(store, candidate(), {
        source: OndcObservationSource.REAL_NETWORK,
        environment: OndcRuntimeEnvironment.LOCAL,
      }),
    ).toMatchObject({ ok: false, reason: 'rejected_provenance' });
    expect(
      retainOndcDiscoveryObservation(store, candidate(), {
        source: OndcObservationSource.REAL_NETWORK,
        environment: OndcRuntimeEnvironment.PRODUCTION,
      }),
    ).toMatchObject({ ok: false, reason: 'ondc_production_disabled' });
    expect(ondcDiscoveryRfqCapability()).toEqual({ canReceiveRfq: false, invitationCreated: false });
    expect(toOndcDiscoveryBuyerView(saved.retained)).toEqual({
      provider: 'ONDC',
      displayName: 'Reported Discovery Seller',
      requestedCategory: 'cotton yarn',
      stage: 'DISCOVERED',
    });
    expect(JSON.stringify(toOndcDiscoveryBuyerView(saved.retained))).not.toContain('bpp.example.test');
  });
});
