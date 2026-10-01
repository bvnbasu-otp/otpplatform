import { describe, expect, it } from 'vitest';
import { assertCandidateAntiLeak } from '../types/supplier-network-engine';
import {
  ProviderReachabilityKind,
  SupplierNetworkProviderKind,
  SupplierNetworkProviderOperationalStatus,
  providerIdentityKey,
  type NormalizedProviderSupplierCandidate,
} from '../types/supplier-provider-identity';
import {
  ONDC_FOUNDATION_INTEGRATION_STATUS,
  ONDC_FOUNDATION_PROTOCOL_ACTIONS,
  OndcCategorySupport,
  admitOndcCandidateToRfqAuthority,
  decodeOndcProviderSupplierId,
  dedupeProviderNeutralCandidates,
  emptyOndcRfqAuthorityState,
  encodeOndcProviderSupplierId,
  evaluateOndcDiscoveryGeography,
  normalizeOndcOnSearchRecord,
  ondcIntegrationStatus,
  resolveOndcFoundationDiscoveryDomain,
  toOndcBuyerSafeView,
  type OndcDiscoveryRequestScope,
  type OndcNormalizedCandidate,
  type OndcOnSearchRecord,
} from './ondc-provider-foundation';

const DISCOVERY_SCOPE: OndcDiscoveryRequestScope = {
  requestedPin: '560048',
  requestedCategory: 'cotton yarn',
  requestedSubcategoryCode: 'cotton_yarn',
  requirementMode: 'PRODUCT_MATERIAL',
};

const SCOPE = {
  rfqId: 'rfq-foundation-1',
  ...DISCOVERY_SCOPE,
  requestedPin: '560048',
  requestedCategory: 'cotton yarn',
};

const OTP_SUPPLIER_ID = '11111111-1111-4111-8111-111111111111';

function reportedRecord(overrides: Partial<OndcOnSearchRecord> = {}): OndcOnSearchRecord {
  return {
    participantId: 'participant-foundation-a',
    sellerId: 'seller-foundation-a',
    sellerName: 'Reported Seller A',
    locationId: 'location-foundation-a',
    catalogueId: 'catalogue-foundation-a',
    itemIds: ['item-foundation-a'],
    domain: 'ONDC:RET12',
    cityCode: 'std:080',
    country: 'IND',
    endpoint: 'https://bpp.invalid/on_search',
    formattedAddress: 'Industrial layout',
    sellerPin: '560048',
    sellerCity: 'Bengaluru',
    sellerState: 'Karnataka',
    sellerCountry: 'IND',
    coordinates: { lat: 12.97, lng: 77.71 },
    category: 'cotton yarn',
    providerSubcategory: 'cotton',
    correlationId: 'tx-foundation-a',
    messageId: 'msg-foundation-a',
    contextTimestamp: '2026-10-01T05:30:00.000Z',
    observedAt: '2026-10-01T05:31:00.000Z',
    ...overrides,
  };
}

function mustCandidate(
  overrides: Partial<OndcOnSearchRecord> = {},
  scope: OndcDiscoveryRequestScope = DISCOVERY_SCOPE,
): OndcNormalizedCandidate {
  const result = normalizeOndcOnSearchRecord(reportedRecord(overrides), scope);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.reason);
  return result.candidate;
}

describe('ONDC provider foundation', () => {
  it('limits the foundation protocol to search then on_search', () => {
    expect(ONDC_FOUNDATION_PROTOCOL_ACTIONS).toEqual(['search', 'on_search']);
    expect(ONDC_FOUNDATION_PROTOCOL_ACTIONS).not.toContain('select');
    expect(ONDC_FOUNDATION_PROTOCOL_ACTIONS).not.toContain('init');
    expect(ONDC_FOUNDATION_PROTOCOL_ACTIONS).not.toContain('confirm');
  });

  it('uses the existing allow-list and does not default to grocery or SRV11', () => {
    expect(resolveOndcFoundationDiscoveryDomain({
      subcategoryCode: 'cotton_yarn',
      requirementMode: 'PRODUCT_MATERIAL',
    })).toBe('ONDC:RET12');
    expect(resolveOndcFoundationDiscoveryDomain({
      subcategoryCode: 'cctv_surveillance',
      requirementMode: 'PRODUCT_MATERIAL',
    })).toBe('ONDC:RET14');
    expect(resolveOndcFoundationDiscoveryDomain({
      subcategoryCode: 'cctv_surveillance',
      requirementMode: 'PROJECT_CONTRACT',
    })).toBeNull();
    expect(resolveOndcFoundationDiscoveryDomain({ subcategoryCode: 'general_products' })).toBeNull();
    expect(resolveOndcFoundationDiscoveryDomain({ subcategoryCode: 'paints_coatings' })).toBeNull();
    expect(resolveOndcFoundationDiscoveryDomain({})).toBeNull();
    expect(resolveOndcFoundationDiscoveryDomain({ subcategoryCode: 'groceries' })).toBeNull();
    expect(resolveOndcFoundationDiscoveryDomain({ subcategoryCode: 'Domestic RO Water Purifiers' })).toBeNull();
  });

  it('keeps the integration status credential-gated and not live', () => {
    expect(ondcIntegrationStatus()).toBe(ONDC_FOUNDATION_INTEGRATION_STATUS);
    expect(ondcIntegrationStatus()).toBe(SupplierNetworkProviderOperationalStatus.CREDENTIAL_GATED);
    expect(ondcIntegrationStatus()).not.toBe(SupplierNetworkProviderOperationalStatus.LIVE);
    const candidate = mustCandidate();
    expect(candidate.integrationStatus).toBe(SupplierNetworkProviderOperationalStatus.CREDENTIAL_GATED);
    expect(candidate.providerStatus).not.toBe(SupplierNetworkProviderOperationalStatus.LIVE);
    expect(candidate.liveIntegrationCertified).toBe(false);
  });

  it('normalizes a valid on_search record and keeps provider fields specific', () => {
    const candidate = mustCandidate();
    expect(candidate.provider).toBe(SupplierNetworkProviderKind.ONDC);
    expect(candidate.ondc.participantId).toBe('participant-foundation-a');
    expect(candidate.ondc.sellerId).toBe('seller-foundation-a');
    expect(candidate.ondc.locationId).toBe('location-foundation-a');
    expect(candidate.ondc.catalogueId).toBe('catalogue-foundation-a');
    expect(candidate.ondc.itemIds).toEqual(['item-foundation-a']);
    expect(candidate.ondc.domain).toBe('ONDC:RET12');
    expect(candidate.ondc.providerSubcategory).toBe('cotton');
    expect(candidate.ondc.endpoint).toBe('https://bpp.invalid/on_search');
    expect(candidate.ondc.context.action).toBe('on_search');
    expect(candidate.ondc.context.transactionId).toBe('tx-foundation-a');
    expect(candidate.correlationId).toBe('tx-foundation-a');
    expect(candidate.discoveredAt).toBe('2026-10-01T05:30:00.000Z');
    expect(candidate.provenance).toBe('ONDC_ON_SEARCH');
    expect(candidate.requestedPin).toBe('560048');
    expect(candidate.location?.pinCode).toBe('560048');
    expect(candidate.location?.coordinates).toEqual({ lat: 12.97, lng: 77.71 });
    expect(candidate.categoryClassification.support).toBe(OndcCategorySupport.MAPPED);
    expect(candidate.categoryClassification.allowListedDomain).toBe('ONDC:RET12');
    expect(candidate).not.toHaveProperty('placeId');
    expect(candidate).not.toHaveProperty('googleMapsUri');
    expect(candidate).not.toHaveProperty('businessStatus');
    expect(candidate).not.toHaveProperty('rating');
    expect(candidate.registered).toBe(false);
    expect(candidate.gstVerified).toBe(false);
    expect(candidate.otpVerified).toBe(false);
    expect(candidate.awarded).toBe(false);
    expect(candidate.purchaseOrderIssued).toBe(false);
    expect(candidate.paymentCreated).toBe(false);
    expect(candidate.otpSupplierId).toBeUndefined();
    expect(candidate.liveIntegrationCertified).toBe(false);
    expect(candidate.discoveryOnly).toBe(true);
  });

  it('rejects a missing participant or seller and keeps identity distinct from an OTP supplier id', () => {
    expect(normalizeOndcOnSearchRecord(reportedRecord({ participantId: undefined }), DISCOVERY_SCOPE).ok).toBe(false);
    expect(normalizeOndcOnSearchRecord(reportedRecord({ sellerId: '' }), DISCOVERY_SCOPE).ok).toBe(false);
    expect(normalizeOndcOnSearchRecord(reportedRecord({ participantId: 'unknown-bpp' }), DISCOVERY_SCOPE).ok).toBe(false);

    const encoded = encodeOndcProviderSupplierId({
      participantId: 'participant-foundation-a',
      sellerId: 'seller-foundation-a',
      locationId: 'location-foundation-a',
    });
    const again = encodeOndcProviderSupplierId({
      participantId: 'participant-foundation-a',
      sellerId: 'seller-foundation-a',
      locationId: 'location-foundation-a',
    });
    expect(encoded).toBe(again);
    expect(encoded).not.toBe(OTP_SUPPLIER_ID);
    expect(encoded).not.toBe('seller-foundation-a');
    const decoded = decodeOndcProviderSupplierId(encoded ?? '');
    expect(decoded).toEqual({
      participantId: 'participant-foundation-a',
      sellerId: 'seller-foundation-a',
      locationId: 'location-foundation-a',
    });
    expect(encodeOndcProviderSupplierId({
      participantId: 'a\u001fb',
      sellerId: 'seller-foundation-a',
    })).toBeNull();

    const candidate = mustCandidate();
    expect(candidate.providerSupplierId).toBe(encoded);
    expect(candidate.providerSupplierId).not.toBe(OTP_SUPPLIER_ID);
    expect(candidate.otpSupplierId).toBeUndefined();
    expect(providerIdentityKey(candidate.provider, candidate.providerSupplierId)).not.toBe(OTP_SUPPLIER_ID);
    expect(decodeOndcProviderSupplierId(candidate.providerSupplierId)?.sellerId).toBe(candidate.ondc.sellerId);
  });

  it('accepts optional provider fields without inventing them', () => {
    const candidate = mustCandidate({
      catalogueId: undefined,
      itemIds: undefined,
      coordinates: undefined,
      phone: undefined,
      email: undefined,
      sellerCity: undefined,
      sellerState: undefined,
      sellerLocality: undefined,
      cityCode: undefined,
      messageId: undefined,
    });
    expect(candidate.ondc.catalogueId).toBeUndefined();
    expect(candidate.ondc.itemIds).toEqual([]);
    expect(candidate.location?.coordinates).toBeUndefined();
    expect(candidate.location?.city).toBeUndefined();
    expect(candidate.location?.locality).toBeUndefined();
    expect(candidate.phone).toBeUndefined();
    expect(candidate.ondc.reportedEmail).toBeUndefined();
    expect(candidate.ondc.cityCode).toBeUndefined();
    expect(candidate.location?.pinCode).toBe('560048');
    expect(candidate.reachability.map((channel) => channel.kind)).toEqual([ProviderReachabilityKind.NETWORK]);
    expect(candidate).not.toHaveProperty('rating');
    expect(JSON.stringify(candidate)).not.toContain('4.5');
    expect(JSON.stringify(candidate)).not.toContain('ONDC Verified Supplier');
    expect(JSON.stringify(candidate)).not.toContain('unknown-bpp');
  });

  it('does not invent a phone, email, endpoint, rating, or coordinates', () => {
    const candidate = mustCandidate({
      endpoint: undefined,
      phone: undefined,
      email: 'not-an-email',
      coordinates: undefined,
    });
    expect(candidate.phone).toBeUndefined();
    expect(candidate.ondc.reportedEmail).toBeUndefined();
    expect(candidate.ondc.endpoint).toBeUndefined();
    expect(candidate.location?.coordinates).toBeUndefined();
    expect(candidate.reachability.some((channel) => channel.kind === ProviderReachabilityKind.NETWORK)).toBe(false);
    expect(candidate.reachability.some((channel) => channel.kind === ProviderReachabilityKind.PHONE)).toBe(false);
    expect(candidate).not.toHaveProperty('rating');
    expect(normalizeOndcOnSearchRecord(reportedRecord({ sellerName: 'ONDC Verified Supplier' }), DISCOVERY_SCOPE).ok).toBe(false);
  });

  it('does not merge distinct ids, or the same display name across providers', () => {
    const first = mustCandidate();
    const second = mustCandidate({
      sellerId: 'seller-foundation-b',
      sellerName: 'Reported Seller A',
      phone: '9876543210',
    });
    const otherLocation = mustCandidate({ locationId: 'location-foundation-b' });
    const google: NormalizedProviderSupplierCandidate = {
      provider: SupplierNetworkProviderKind.GOOGLE_PLACES,
      providerSupplierId: 'ChIJ_place_only',
      displayName: 'Reported Seller A',
      phone: '9876543210',
      location: {
        formattedAddress: 'Industrial layout',
        pinCode: '560048',
        city: 'Bengaluru',
      },
    };

    expect(first.providerSupplierId).not.toBe(second.providerSupplierId);
    expect(first.providerSupplierId).not.toBe(otherLocation.providerSupplierId);
    expect(first.providerSupplierId).toBe(mustCandidate().providerSupplierId);
    const deduped = dedupeProviderNeutralCandidates([first, first, second, otherLocation, google]);
    expect(deduped).toHaveLength(4);
    expect(deduped.map((row) => row.provider)).toEqual([
      SupplierNetworkProviderKind.ONDC,
      SupplierNetworkProviderKind.ONDC,
      SupplierNetworkProviderKind.ONDC,
      SupplierNetworkProviderKind.GOOGLE_PLACES,
    ]);
    expect(providerIdentityKey(google.provider, google.providerSupplierId)).not.toBe(
      providerIdentityKey(first.provider, first.providerSupplierId),
    );
  });

  it('preserves the buyer PIN when the seller PIN differs or geography is missing', () => {
    const differs = mustCandidate({
      sellerPin: '641001',
      sellerCity: 'Coimbatore',
      sellerState: 'Tamil Nadu',
      sellerLocality: 'RS Puram',
      sellerCountry: 'IND',
    });
    expect(differs.requestedPin).toBe('560048');
    expect(differs.location?.pinCode).toBe('641001');
    expect(differs.location?.locality).toBe('RS Puram');
    expect(differs.requestedPin).not.toBe(differs.location?.pinCode);

    const mismatch = evaluateOndcDiscoveryGeography({
      requestedPin: differs.requestedPin,
      sellerPin: differs.location?.pinCode,
      sellerLocality: differs.location?.locality,
      sellerCity: differs.location?.city,
      sellerState: differs.location?.state,
      sellerCountry: differs.location?.country,
    });
    expect(mismatch.normalization).toBe('RETAINED');
    expect(mismatch.sellerPinRelation).toBe('differs_from_requested_pin');
    expect(mismatch.requestedPin).toBe('560048');
    expect(mismatch.sellerPin).toBe('641001');
    expect(mismatch.sellerCity).toBe('Coimbatore');
    expect(mismatch.sellerState).toBe('Tamil Nadu');

    const admitted = admitOndcCandidateToRfqAuthority(differs, SCOPE, emptyOndcRfqAuthorityState());
    expect(admitted.admission.entered).toBe(true);
    expect(admitted.admission.reason).not.toBe('normalization_failed');
    expect(differs.location?.pinCode).toBe('641001');
    expect(differs.requestedPin).toBe('560048');

    const missing = mustCandidate({
      formattedAddress: undefined,
      sellerLocality: undefined,
      sellerPin: undefined,
      sellerCity: undefined,
      sellerState: undefined,
      sellerCountry: undefined,
      coordinates: undefined,
    });
    expect(missing.requestedPin).toBe('560048');
    expect(missing.location).toBeUndefined();
    expect(missing.ondc.sellerLocation).toBeUndefined();
    const unreported = evaluateOndcDiscoveryGeography({
      requestedPin: missing.requestedPin,
      sellerPin: missing.location?.pinCode,
      sellerCity: 'Bengaluru',
    });
    expect(unreported.sellerPinRelation).toBe('seller_pin_unreported');
    expect(unreported.sellerPin).toBeNull();
    expect(unreported.requestedPin).toBe('560048');
    expect(unreported.normalization).toBe('RETAINED');

    const goa = mustCandidate({ sellerState: 'Goa', sellerCity: 'Panaji', sellerPin: '403001' });
    expect(goa.location?.state).toBe('Goa');
    expect(goa.location?.city).toBe('Panaji');
    expect(goa.requestedPin).toBe('560048');
  });

  it('does not require coordinates or a phone for a normalized candidate', () => {
    const candidate = mustCandidate({ coordinates: undefined, phone: undefined, email: undefined });
    expect(candidate.location?.coordinates).toBeUndefined();
    expect(candidate.phone).toBeUndefined();
    const admitted = admitOndcCandidateToRfqAuthority(candidate, SCOPE, emptyOndcRfqAuthorityState());
    expect(admitted.admission.entered).toBe(true);
    expect(admitted.admission.databaseInvitationCreated).toBe(false);
    expect(admitted.admission.dispatch).toBe('NOT_ATTEMPTED');
  });

  it('maps an allow-listed subcategory and refuses label equality and invalid domains', () => {
    const mapped = mustCandidate();
    expect(mapped.categoryClassification.support).toBe(OndcCategorySupport.MAPPED);
    expect(mapped.categoryClassification.allowListedDomain).toBe('ONDC:RET12');
    expect(mapped.requestedCategory).toBe('cotton yarn');
    expect(mapped.category).toBe('cotton yarn');

    const labelOnly = mustCandidate({}, {
      requestedPin: '560048',
      requestedCategory: 'cotton yarn',
    });
    expect(labelOnly.category).toBe('cotton yarn');
    expect(labelOnly.categoryClassification.support).toBe(OndcCategorySupport.UNMAPPED);
    expect(labelOnly.categoryClassification.allowListedDomain).toBeNull();
    expect(JSON.stringify(labelOnly.categoryClassification)).not.toContain('SRV11');
    const labelAdmission = admitOndcCandidateToRfqAuthority(labelOnly, {
      rfqId: SCOPE.rfqId,
      requestedPin: '560048',
      requestedCategory: 'cotton yarn',
    }, emptyOndcRfqAuthorityState());
    expect(labelAdmission.admission.entered).toBe(false);
    expect(labelAdmission.admission.reason).toBe('category_unmapped');

    const invalid = mustCandidate({ domain: 'ONDC:SRV11' });
    expect(invalid.ondc.domain).toBe('ONDC:SRV11');
    expect(invalid.categoryClassification.providerDomain).toBe('ONDC:SRV11');
    expect(invalid.categoryClassification.support).toBe(OndcCategorySupport.NOT_SUPPORTED);
    expect(invalid.categoryClassification.allowListedDomain).toBe('ONDC:RET12');
    const invalidAdmission = admitOndcCandidateToRfqAuthority(invalid, SCOPE, emptyOndcRfqAuthorityState());
    expect(invalidAdmission.admission.entered).toBe(false);
    expect(invalidAdmission.admission.reason).toBe('category_not_supported');

    const paints = mustCandidate({ domain: 'ONDC:RET12' }, {
      ...DISCOVERY_SCOPE,
      requestedSubcategoryCode: 'paints_coatings',
    });
    expect(paints.categoryClassification.support).toBe(OndcCategorySupport.UNMAPPED);
    expect(paints.categoryClassification.allowListedDomain).toBeNull();
    expect(paints.ondc.domain).toBe('ONDC:RET12');

    const projectCctv = mustCandidate({ domain: 'ONDC:RET14', category: 'cctv' }, {
      requestedPin: '560048',
      requestedCategory: 'cctv',
      requestedSubcategoryCode: 'cctv_surveillance',
      requirementMode: 'PROJECT_CONTRACT',
    });
    expect(projectCctv.categoryClassification.support).toBe(OndcCategorySupport.NOT_SUPPORTED);
    expect(projectCctv.categoryClassification.allowListedDomain).toBeNull();
    expect(projectCctv.ondc.domain).toBe('ONDC:RET14');
  });

  it('represents network reachability only when an http(s) endpoint is present', () => {
    const reachable = mustCandidate({ phone: undefined, email: undefined });
    expect(reachable.phone).toBeUndefined();
    expect(reachable.reachability).toEqual([
      { kind: ProviderReachabilityKind.NETWORK, value: 'https://bpp.invalid/on_search' },
    ]);
    expect(reachable.providerStatus).toBe(SupplierNetworkProviderOperationalStatus.REACHABLE);
    expect(reachable.integrationStatus).not.toBe(SupplierNetworkProviderOperationalStatus.LIVE);

    const admitted = admitOndcCandidateToRfqAuthority(reachable, SCOPE, emptyOndcRfqAuthorityState());
    expect(admitted.admission.entered).toBe(true);
    expect(admitted.admission.dispatch).toBe('NOT_ATTEMPTED');
    expect(admitted.admission.registered).toBe(false);
    expect(admitted.admission.gstVerified).toBe(false);
    expect(admitted.admission.awarded).toBe(false);
    expect(admitted.admission.paymentCreated).toBe(false);
    expect(admitted.admission.databaseInvitationCreated).toBe(false);
    expect(admitted.state.invitations[0]?.dispatch).toBe('NOT_ATTEMPTED');

    const noEndpoint = mustCandidate({ endpoint: 'NETWORK', phone: undefined });
    expect(noEndpoint.ondc.endpoint).toBeUndefined();
    expect(noEndpoint.reachability.some((channel) => channel.kind === ProviderReachabilityKind.NETWORK)).toBe(false);
    expect(noEndpoint.providerStatus).toBe(SupplierNetworkProviderOperationalStatus.UNAVAILABLE);

    const unavailable = mustCandidate({ unavailable: true });
    expect(unavailable.providerStatus).toBe(SupplierNetworkProviderOperationalStatus.UNAVAILABLE);
    const refused = admitOndcCandidateToRfqAuthority(unavailable, SCOPE, emptyOndcRfqAuthorityState());
    expect(refused.admission.entered).toBe(false);
    expect(refused.admission.reason).toBe('provider_unavailable');
    expect(refused.state.participants).toHaveLength(0);
    expect(refused.state.invitations).toHaveLength(0);
  });

  it('rejects a record that has no correlation id or discovery timestamp', () => {
    const missingCorrelation = normalizeOndcOnSearchRecord(
      reportedRecord({ correlationId: undefined }),
      DISCOVERY_SCOPE,
    );
    expect(missingCorrelation.ok).toBe(false);
    if (!missingCorrelation.ok) expect(missingCorrelation.reason).toBe('missing_correlation_id');

    const missingTime = normalizeOndcOnSearchRecord(
      reportedRecord({ contextTimestamp: undefined, observedAt: undefined }),
      DISCOVERY_SCOPE,
    );
    expect(missingTime.ok).toBe(false);
    if (!missingTime.ok) expect(missingTime.reason).toBe('missing_discovery_timestamp');
  });

  it('admits one eligible candidate through the authority ledger without a second participant', () => {
    const candidate = mustCandidate();
    const first = admitOndcCandidateToRfqAuthority(candidate, SCOPE, emptyOndcRfqAuthorityState());
    const second = admitOndcCandidateToRfqAuthority(candidate, SCOPE, first.state);

    expect(first.admission.entered).toBe(true);
    expect(first.admission.stage).toBe('DISCOVERED');
    expect(first.admission.invitationState).toBe('AUTHORITY_RECORDED');
    expect(first.admission.authorityPath).toBe('SNE_RFQ_AUTHORITY');
    expect(first.admission.databaseParticipantCreated).toBe(false);
    expect(first.admission.databaseInvitationCreated).toBe(false);
    expect(first.state.participants).toHaveLength(1);
    expect(first.state.invitations).toHaveLength(1);
    expect(first.state.participants[0]?.registered).toBe(false);

    expect(second.admission.entered).toBe(false);
    expect(second.admission.reason).toBe('duplicate_ondc_identity');
    expect(second.state).toBe(first.state);
    expect(second.state.participants).toHaveLength(1);
    expect(second.state.invitations).toHaveLength(1);

    const buyerView = toOndcBuyerSafeView(candidate);
    expect(buyerView).toEqual({
      provenanceLabel: 'Network suppliers',
      category: 'cotton yarn',
      stage: 'DISCOVERED',
    });
    expect(JSON.stringify(buyerView)).not.toMatch(/participant-foundation-a|seller-foundation-a|bpp\.invalid|560048/i);
    expect(() => assertCandidateAntiLeak(buyerView)).not.toThrow();
    expect(candidate).not.toHaveProperty('invitationId');
    expect(candidate).not.toHaveProperty('quoteId');
    expect(candidate).not.toHaveProperty('awardId');
  });
});
