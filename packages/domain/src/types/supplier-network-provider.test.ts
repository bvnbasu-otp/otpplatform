import { describe, expect, it } from 'vitest';
import {
  SupplierDiscoverySourceKind,
  SUPPLIER_DISCOVERY_BUYER_LABELS,
} from '../enums/supplier-discovery-source';
import { mapSourceKindToBuyerCountBucket } from './supplier-network-provider';

describe('supplier discovery provenance labels', () => {
  it('uses buyer-simple labels without protocol jargon', () => {
    expect(SUPPLIER_DISCOVERY_BUYER_LABELS[SupplierDiscoverySourceKind.OTP_SUPPLIER]).toBe(
      'OTP Verified',
    );
    expect(SUPPLIER_DISCOVERY_BUYER_LABELS[SupplierDiscoverySourceKind.ONDC_SELLER]).toBe(
      'Network suppliers',
    );
    expect(SUPPLIER_DISCOVERY_BUYER_LABELS[SupplierDiscoverySourceKind.GOOGLE_DISCOVERY]).toBe(
      'Local businesses',
    );
  });

  it('maps Google discovery to local businesses bucket — not OTP verified', () => {
    expect(mapSourceKindToBuyerCountBucket(SupplierDiscoverySourceKind.GOOGLE_DISCOVERY)).toBe(
      'local',
    );
    expect(mapSourceKindToBuyerCountBucket(SupplierDiscoverySourceKind.OTP_SUPPLIER)).toBe(
      'otpVerified',
    );
  });
});
