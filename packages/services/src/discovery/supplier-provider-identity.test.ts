import { describe, expect, it } from 'vitest';
import { mapBlindInvitationRow } from '@otp/database';
import {
  OndcIntegrationState,
  ONDC_SUPPLIER_NETWORK_CONTRACT_STATUS,
  SupplierDiscoverySourceKind,
  SupplierNetworkProviderKind,
  normalizeOndcOnSearchRecord,
} from '@otp/domain';
import {
  assertGooglePlacesInviteEligible,
  assertOndcProviderIdentityInsertAllowed,
  classifyGooglePlacesContactability,
} from './supplier-provider-identity-guards';
import { SupplierNetworkProviderEngine } from './supplier-network-providers/supplier-network-provider-engine';
import type { NormalizedDiscoverySupplier } from '@otp/domain';

describe('supplier provider identity guards (SNE)', () => {
  it('documents ONDC contract status without claiming live integration', () => {
    expect(ONDC_SUPPLIER_NETWORK_CONTRACT_STATUS).toContain('NOT CERTIFIED');
  });

  it('rejects Google invite without place id', () => {
    expect(assertGooglePlacesInviteEligible({ placeId: '', phone: '9876543210' }).ok).toBe(false);
  });

  it('classifies missing phone as NO_CONTACT_CHANNEL and does not invite', () => {
    expect(classifyGooglePlacesContactability(undefined)).toBe('NO_CONTACT_CHANNEL');
    expect(assertGooglePlacesInviteEligible({ placeId: 'ChIJ_x', phone: null }).ok).toBe(false);
  });

  it('does not invite from Place ID and phone alone', () => {
    const res = assertGooglePlacesInviteEligible({ placeId: 'ChIJ_ok', phone: '+91 9876543210' });
    expect(res.ok).toBe(false);
  });

  it('invites a Google row only when the quality gate passes, without a Google email', () => {
    const res = assertGooglePlacesInviteEligible({
      placeId: 'ChIJ_ok',
      displayName: 'Hoodi Switchgear',
      formattedAddress: '12 Industrial Road, Bengaluru 560048',
      phone: '+91 9876543210',
      lat: 12.97,
      lng: 77.71,
      googleMapsUri: 'https://maps.google.com/?cid=ok',
      businessStatus: 'OPERATIONAL',
      email: 'sales@hoodi.example',
    });
    expect(res.ok).toBe(true);
  });

  it('ONDC guard rejects missing seller or participant id', () => {
    const base = {
      integrationState: OndcIntegrationState.PREPROD,
      liveSuccess: true,
    };
    expect(assertOndcProviderIdentityInsertAllowed({ ...base, providerSupplierId: '', providerParticipantId: 'bpp' }).ok).toBe(
      false,
    );
    expect(assertOndcProviderIdentityInsertAllowed({ ...base, providerSupplierId: 'seller-1', providerParticipantId: '' }).ok).toBe(
      false,
    );
  });

  it('ONDC guard refuses insert when provider not live / not configured', () => {
    expect(
      assertOndcProviderIdentityInsertAllowed({
        integrationState: OndcIntegrationState.NOT_CONFIGURED,
        providerSupplierId: 's1',
        providerParticipantId: 'bpp1',
        liveSuccess: false,
      }).ok,
    ).toBe(false);
    expect(
      assertOndcProviderIdentityInsertAllowed({
        integrationState: OndcIntegrationState.NOT_CONFIGURED,
        providerSupplierId: 's1',
        providerParticipantId: 'bpp1',
        liveSuccess: true,
      }).ok,
    ).toBe(false);
  });

  it('ONDC guard accepts only live success with ids', () => {
    const res = assertOndcProviderIdentityInsertAllowed({
      integrationState: OndcIntegrationState.PREPROD,
      providerSupplierId: 'seller-1',
      providerParticipantId: 'bpp.example.com',
      liveSuccess: true,
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.candidate.provider).toBe(SupplierNetworkProviderKind.ONDC);
    }
  });

  it('same display name across Google + ONDC stays two provider identities (no merge)', async () => {
    const google: NormalizedDiscoverySupplier = {
      sourceKind: SupplierDiscoverySourceKind.GOOGLE_DISCOVERY,
      externalRef: 'ChIJ_google_only',
      displayAliasSeed: 'ChIJ_google_only',
      businessName: 'Shared Name Traders',
      matchFactors: [],
      canReceiveRfq: true,
      canSubmitQuote: false,
      lifecycleTier: 'DISCOVERED_IN_AREA',
      provenanceLabel: 'Local businesses',
      placeId: 'ChIJ_google_only',
    };
    const ondc: NormalizedDiscoverySupplier = {
      sourceKind: SupplierDiscoverySourceKind.ONDC_SELLER,
      externalRef: 'ondc:seller-xyz',
      displayAliasSeed: 'seller-xyz',
      businessName: 'Shared Name Traders',
      matchFactors: [],
      canReceiveRfq: true,
      canSubmitQuote: false,
      lifecycleTier: 'ONDC_DISCOVERED',
      provenanceLabel: 'Network suppliers',
      ondcProviderId: 'seller-xyz',
    };

    const engine = new SupplierNetworkProviderEngine([
      {
        sourceKind: SupplierDiscoverySourceKind.GOOGLE_DISCOVERY,
        discover: async () => ({ sourceKind: SupplierDiscoverySourceKind.GOOGLE_DISCOVERY, candidates: [google] }),
      },
      {
        sourceKind: SupplierDiscoverySourceKind.ONDC_SELLER,
        discover: async () => ({ sourceKind: SupplierDiscoverySourceKind.ONDC_SELLER, candidates: [ondc] }),
      },
    ]);

    const agg = await engine.discover({ category: 'TEST' });
    expect(agg.merged).toHaveLength(2);
    const refs = agg.merged.map((m) => m.externalRef).sort();
    expect(refs).toEqual(['ChIJ_google_only', 'ondc:seller-xyz']);
  });

  it('same display name with different Place IDs stays separate; duplicate Place ID is idempotent', async () => {
    const shared = {
      sourceKind: SupplierDiscoverySourceKind.GOOGLE_DISCOVERY,
      matchFactors: [],
      canReceiveRfq: false,
      canSubmitQuote: false,
      lifecycleTier: 'DISCOVERED_IN_AREA' as const,
      provenanceLabel: 'Local businesses',
      businessName: 'Shared Name Traders',
    };
    const engine = new SupplierNetworkProviderEngine([
      {
        sourceKind: SupplierDiscoverySourceKind.GOOGLE_DISCOVERY,
        discover: async () => ({
          sourceKind: SupplierDiscoverySourceKind.GOOGLE_DISCOVERY,
          candidates: [
            { ...shared, externalRef: 'ChIJ_a', displayAliasSeed: 'ChIJ_a', placeId: 'ChIJ_a' },
            { ...shared, externalRef: 'ChIJ_b', displayAliasSeed: 'ChIJ_b', placeId: 'ChIJ_b' },
            { ...shared, externalRef: 'ChIJ_a', displayAliasSeed: 'ChIJ_a', placeId: 'ChIJ_a' },
          ],
        }),
      },
    ]);
    const agg = await engine.discover({ category: 'TEST' });
    expect(agg.merged.map((m) => m.placeId).sort()).toEqual(['ChIJ_a', 'ChIJ_b']);
  });

  it('canonical ONDC normalization does not create a supplier, invitation, or Place ID', () => {
    const otpSupplierId = '11111111-1111-4111-8111-111111111111';
    const result = normalizeOndcOnSearchRecord(
      {
        participantId: 'participant-foundation-a',
        sellerId: 'seller-foundation-a',
        sellerName: 'Reported Seller A',
        endpoint: 'https://bpp.invalid/on_search',
        sellerPin: '641001',
        correlationId: 'tx-foundation-a',
        observedAt: '2026-10-01T05:31:00.000Z',
        domain: 'ONDC:RET12',
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
    expect(result.candidate.otpSupplierId).toBeUndefined();
    expect(result.candidate.requestedPin).toBe('560048');
    expect(result.candidate.location?.pinCode).toBe('641001');
    expect(result.candidate.phone).toBeUndefined();
    expect(result.candidate).not.toHaveProperty('placeId');
    expect(result.candidate).not.toHaveProperty('rating');
    expect(result.candidate).not.toHaveProperty('invitationId');
    expect(result.candidate.registered).toBe(false);
    expect(result.candidate.provenance).toBe('ONDC_ON_SEARCH');
    expect(JSON.stringify(result.candidate)).not.toContain('GOOGLE_PLACES');
  });

  it('buyer blind invitation payload omits Place ID and provider identifiers', () => {
    const mapped = mapBlindInvitationRow({
      invitation_id: '11111111-1111-1111-1111-111111111111',
      rfq_id: '22222222-2222-2222-2222-222222222222',
      anonymous_label: 'Supplier A',
      status: 'INVITED',
      invited_at: '2026-10-01T00:00:00Z',
      viewed_at: null,
      declined_at: null,
    });
    const json = JSON.stringify(mapped);
    expect(json).not.toMatch(/placeId|place_id|GOOGLE_PLACES|ONDC/i);
    expect(Object.keys(mapped).sort()).toEqual(
      ['anonymousLabel', 'declinedAt', 'invitationId', 'invitedAt', 'rfqId', 'status', 'viewedAt'].sort(),
    );
  });
});
