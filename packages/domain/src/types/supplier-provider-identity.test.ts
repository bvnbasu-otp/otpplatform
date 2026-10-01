import { describe, expect, it } from 'vitest';
import {
  ONDC_SUPPLIER_NETWORK_CONTRACT_STATUS,
  ProviderContactabilityStatus,
  ProviderReachabilityKind,
  SupplierNetworkProviderKind,
  SupplierNetworkProviderOperationalStatus,
  normalizeOndcOnSearchRecord,
  providerIdentityKey,
  type NormalizedProviderSupplierCandidate,
} from '../index.ts';

describe('supplier provider identity', () => {
  it('exports Google Places and ONDC as provider ids', () => {
    expect(SupplierNetworkProviderKind.GOOGLE_PLACES).toBe('GOOGLE_PLACES');
    expect(SupplierNetworkProviderKind.ONDC).toBe('ONDC');
    expect(Object.values(SupplierNetworkProviderKind)).toEqual(['GOOGLE_PLACES', 'ONDC']);
  });

  it('records the ONDC contract as ready and not live-certified', () => {
    expect(ONDC_SUPPLIER_NETWORK_CONTRACT_STATUS).toBe(
      'PROVIDER CONTRACT READY / LIVE INTEGRATION NOT CERTIFIED',
    );
  });

  it('keeps a Google Place ID as a provider key until OTP registration', () => {
    const placeId = 'ChIJ_place_only';
    const candidate: NormalizedProviderSupplierCandidate = {
      provider: SupplierNetworkProviderKind.GOOGLE_PLACES,
      providerSupplierId: placeId,
      displayName: 'Hoodi Switchgear',
    };
    expect(candidate.providerSupplierId).toBe(placeId);
    expect(candidate.otpSupplierId).toBeUndefined();
    expect(candidate).not.toHaveProperty('participantId');
    expect(candidate).not.toHaveProperty('bppUri');
  });

  it('keeps reachability and provider status explicit', () => {
    expect(Object.values(ProviderReachabilityKind)).toEqual([
      'PHONE',
      'SMS',
      'WHATSAPP',
      'EMAIL',
      'NETWORK',
      'OTHER_PROVIDER_CHANNEL',
    ]);
    expect(Object.values(ProviderContactabilityStatus)).toEqual(['REACHABLE', 'NOT_REACHABLE']);
    expect(Object.values(SupplierNetworkProviderOperationalStatus)).toEqual([
      'CONFIGURED',
      'LIVE',
      'REACHABLE',
      'UNAVAILABLE',
      'CREDENTIAL_GATED',
      'NOT_IMPLEMENTED',
      'ERROR',
    ]);
    expect(SupplierNetworkProviderOperationalStatus.CREDENTIAL_GATED).not.toBe(
      SupplierNetworkProviderOperationalStatus.LIVE,
    );
  });

  it('does not treat the same id string on two providers as one identity', () => {
    const sharedId = 'shared-provider-token';
    expect(providerIdentityKey(SupplierNetworkProviderKind.GOOGLE_PLACES, sharedId)).not.toBe(
      providerIdentityKey(SupplierNetworkProviderKind.ONDC, sharedId),
    );
  });

  it('normalizes an ONDC identity that is not an OTP supplier id and does not invent missing fields', () => {
    const otpSupplierId = '11111111-1111-4111-8111-111111111111';
    const result = normalizeOndcOnSearchRecord(
      {
        participantId: 'participant-foundation-a',
        sellerId: 'seller-foundation-a',
        sellerName: 'Reported Seller A',
        locationId: 'location-foundation-a',
        endpoint: 'https://bpp.invalid/on_search',
        domain: 'ONDC:RET12',
        correlationId: 'tx-foundation-a',
        observedAt: '2026-10-01T05:31:00.000Z',
      },
      {
        requestedPin: '560048',
        requestedCategory: 'cotton yarn',
        requestedSubcategoryCode: 'cotton_yarn',
        requirementMode: 'PRODUCT_MATERIAL',
      },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.candidate.provider).toBe(SupplierNetworkProviderKind.ONDC);
    expect(result.candidate.providerSupplierId).not.toBe(otpSupplierId);
    expect(result.candidate.providerSupplierId).not.toBe('seller-foundation-a');
    expect(result.candidate.otpSupplierId).toBeUndefined();
    expect(providerIdentityKey(result.candidate.provider, result.candidate.providerSupplierId)).not.toBe(otpSupplierId);
    expect(result.candidate.requestedPin).toBe('560048');
    expect(result.candidate.location).toBeUndefined();
    expect(result.candidate.phone).toBeUndefined();
    expect(result.candidate).not.toHaveProperty('rating');
    expect(result.candidate).not.toHaveProperty('placeId');
    expect(result.candidate.provenance).toBe('ONDC_ON_SEARCH');
    expect(result.candidate.correlationId).toBe('tx-foundation-a');
    expect(result.candidate.integrationStatus).toBe(SupplierNetworkProviderOperationalStatus.CREDENTIAL_GATED);
    const again = normalizeOndcOnSearchRecord(
      {
        participantId: 'participant-foundation-a',
        sellerId: 'seller-foundation-a',
        sellerName: 'Reported Seller A',
        locationId: 'location-foundation-a',
        endpoint: 'https://bpp.invalid/on_search',
        correlationId: 'tx-foundation-a',
        observedAt: '2026-10-01T05:31:00.000Z',
      },
      { requestedPin: '560048' },
    );
    expect(again.ok).toBe(true);
    if (!again.ok) return;
    expect(again.candidate.providerSupplierId).toBe(result.candidate.providerSupplierId);
  });
});
