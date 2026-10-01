import { describe, expect, it } from 'vitest';
import {
  ONDC_SUPPLIER_NETWORK_CONTRACT_STATUS,
  SupplierNetworkProviderKind,
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
  });
});
