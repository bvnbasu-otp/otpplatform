import { describe, expect, it } from 'vitest';
import {
  OndcCategorySupport,
  ProviderReachabilityKind,
  SupplierNetworkProviderKind,
  SupplierNetworkProviderOperationalStatus,
  admitOndcCandidateToRfqAuthority,
  attemptClientRfqMutation,
  decodeOndcProviderSupplierId,
  dedupeProviderNeutralCandidates,
  emptyOndcRfqAuthorityState,
  encodeOndcProviderSupplierId,
  evaluateOndcDiscoveryGeography,
  normalizeOndcOnSearchRecord,
  ondcIntegrationStatus,
  providerIdentityKey,
  rejectClientOndcOverrides,
  type NormalizedProviderSupplierCandidate,
  type OndcDiscoveryRequestScope,
  type OndcNormalizedCandidate,
  type OndcOnSearchRecord,
} from '@otp/domain';

const DISCOVERY_SCOPE: OndcDiscoveryRequestScope = {
  requestedPin: '560048',
  requestedCategory: 'cotton yarn',
  requestedSubcategoryCode: 'cotton_yarn',
  requirementMode: 'PRODUCT_MATERIAL',
};

const SCOPE = {
  rfqId: 'rfq-foundation-1',
  requestedPin: '560048',
  requestedCategory: 'cotton yarn',
  requestedSubcategoryCode: 'cotton_yarn',
  requirementMode: 'PRODUCT_MATERIAL',
};

const OTP_SUPPLIER_ID = '11111111-1111-4111-8111-111111111111';

function reportedRecord(overrides: Partial<OndcOnSearchRecord> = {}): OndcOnSearchRecord {
  return {
    participantId: 'participant-foundation-a',
    sellerId: 'seller-foundation-a',
    sellerName: 'Reported Seller A',
    locationId: 'location-foundation-a',
    endpoint: 'https://bpp.invalid/on_search',
    sellerPin: '560048',
    sellerCity: 'Bengaluru',
    sellerState: 'Karnataka',
    category: 'cotton yarn',
    domain: 'ONDC:RET12',
    correlationId: 'tx-foundation-a',
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

describe('ONDC provider foundation red team', () => {
  it('fails closed on a fake seller id, participant id, or provider identity', () => {
    expect(encodeOndcProviderSupplierId({ participantId: 'fake', sellerId: 'seller-foundation-a' })).toBeNull();
    expect(encodeOndcProviderSupplierId({ participantId: 'unknown-bpp', sellerId: 'seller-foundation-a' })).toBeNull();
    expect(normalizeOndcOnSearchRecord(reportedRecord({ sellerId: 'fake' }), DISCOVERY_SCOPE).ok).toBe(false);
    expect(normalizeOndcOnSearchRecord(reportedRecord({ sellerId: 'synthetic' }), DISCOVERY_SCOPE).ok).toBe(false);
    expect(normalizeOndcOnSearchRecord(reportedRecord({ participantId: 'placeholder' }), DISCOVERY_SCOPE).ok).toBe(false);
    expect(normalizeOndcOnSearchRecord(reportedRecord({ participantId: 'unknown-bpp' }), DISCOVERY_SCOPE).ok).toBe(false);
    expect(normalizeOndcOnSearchRecord(reportedRecord({ sellerId: 'Reported Seller A' }), DISCOVERY_SCOPE).ok).toBe(false);
    expect(normalizeOndcOnSearchRecord(reportedRecord({ sellerId: '' }), DISCOVERY_SCOPE).ok).toBe(false);
    expect(normalizeOndcOnSearchRecord(reportedRecord({ participantId: undefined }), DISCOVERY_SCOPE).ok).toBe(false);
    const fabricatedName = normalizeOndcOnSearchRecord(
      reportedRecord({ sellerName: 'ONDC Verified Supplier' }),
      DISCOVERY_SCOPE,
    );
    expect(fabricatedName.ok).toBe(false);

    const candidate = mustCandidate();
    expect(candidate.provider).toBe(SupplierNetworkProviderKind.ONDC);
    expect(candidate.providerSupplierId).not.toBe(OTP_SUPPLIER_ID);
    expect(candidate.otpSupplierId).toBeUndefined();
    expect(decodeOndcProviderSupplierId(candidate.providerSupplierId)?.participantId).toBe('participant-foundation-a');
    expect(candidate.providerSupplierId).toBe(mustCandidate().providerSupplierId);
  });

  it('does not invent a rating, phone, email, or coordinates', () => {
    const raw = {
      ...reportedRecord({ phone: undefined, email: undefined, coordinates: undefined }),
      rating: 4.5,
      placeId: 'ChIJ_injected',
    };
    const result = normalizeOndcOnSearchRecord(raw, DISCOVERY_SCOPE);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.candidate).not.toHaveProperty('rating');
    expect(result.candidate.phone).toBeUndefined();
    expect(result.candidate.ondc.reportedEmail).toBeUndefined();
    expect(result.candidate.location?.coordinates).toBeUndefined();
    expect(JSON.stringify(result.candidate)).not.toContain('4.5');
    expect(JSON.stringify(result.candidate)).not.toContain('ChIJ_injected');
    expect(result.candidate).not.toHaveProperty('placeId');

    const invalidContact = mustCandidate({ phone: '12345', email: 'not-an-email' });
    expect(invalidContact.phone).toBeUndefined();
    expect(invalidContact.ondc.reportedEmail).toBeUndefined();
    expect(invalidContact.reachability.some((channel) => channel.kind === ProviderReachabilityKind.PHONE)).toBe(false);
    expect(invalidContact.reachability.some((channel) => channel.kind === ProviderReachabilityKind.EMAIL)).toBe(false);
  });

  it('fails closed on fake network reachability', () => {
    const fakeEndpoint = mustCandidate({ endpoint: 'NETWORK' });
    expect(fakeEndpoint.reachability.some((channel) => channel.kind === ProviderReachabilityKind.NETWORK)).toBe(false);
    expect(fakeEndpoint.ondc.endpoint).toBeUndefined();
    expect(fakeEndpoint.providerStatus).toBe(SupplierNetworkProviderOperationalStatus.UNAVAILABLE);
    const admitted = admitOndcCandidateToRfqAuthority(fakeEndpoint, SCOPE, emptyOndcRfqAuthorityState());
    expect(admitted.admission.entered).toBe(false);

    const untouched = mustCandidate();
    const rejected = rejectClientOndcOverrides(untouched, { reachability: 'NETWORK', networkReachable: true });
    expect(rejected.rejected).toEqual(['reachability', 'networkReachable']);
    expect(rejected.candidate).toBe(untouched);
    expect(rejected.candidate.reachability).toEqual(untouched.reachability);
  });

  it('fails closed on fake verification', () => {
    const candidate = mustCandidate();
    expect(candidate.otpVerified).toBe(false);
    expect(candidate.gstVerified).toBe(false);
    expect(candidate.registered).toBe(false);
    const forged = { ...candidate, otpVerified: true, gstVerified: true } as OndcNormalizedCandidate;
    const admitted = admitOndcCandidateToRfqAuthority(forged, SCOPE, emptyOndcRfqAuthorityState());
    expect(admitted.admission.entered).toBe(false);
    expect(admitted.admission.reason).toBe('verification_claim_rejected');
    expect(admitted.admission.otpVerified).toBe(false);
    expect(admitted.admission.gstVerified).toBe(false);
  });

  it('fails closed on a fake GST claim', () => {
    const candidate = mustCandidate();
    const forged = { ...candidate, gstVerified: true } as OndcNormalizedCandidate & { gstin: string };
    forged.gstin = '29AAAAA0000A1Z5';
    const admitted = admitOndcCandidateToRfqAuthority(forged, SCOPE, emptyOndcRfqAuthorityState());
    expect(admitted.admission.entered).toBe(false);
    expect(admitted.admission.gstVerified).toBe(false);
    expect(admitted.admission.registered).toBe(false);
    const rejected = rejectClientOndcOverrides(candidate, { gstin: '29AAAAA0000A1Z5', gstVerified: true });
    expect(rejected.candidate).toBe(candidate);
    expect(JSON.stringify(rejected.candidate)).not.toContain('29AAAAA0000A1Z5');
  });

  it('fails closed on a duplicate ONDC seller', () => {
    const candidate = mustCandidate();
    const again = mustCandidate();
    const deduped = dedupeProviderNeutralCandidates([candidate, again]);
    expect(deduped).toHaveLength(1);
    expect(candidate.providerSupplierId).toBe(again.providerSupplierId);

    const first = admitOndcCandidateToRfqAuthority(candidate, SCOPE, emptyOndcRfqAuthorityState());
    const second = admitOndcCandidateToRfqAuthority(again, SCOPE, first.state);
    expect(second.admission.entered).toBe(false);
    expect(second.admission.reason).toBe('duplicate_ondc_identity');
    expect(second.state.participants).toHaveLength(1);
    expect(second.state.invitations).toHaveLength(1);
  });

  it('fails closed when the same display name appears on Google and ONDC', () => {
    const ondc = mustCandidate({ phone: '9876543210' });
    const google: NormalizedProviderSupplierCandidate = {
      provider: SupplierNetworkProviderKind.GOOGLE_PLACES,
      providerSupplierId: 'ChIJ_place_only',
      displayName: ondc.displayName,
      phone: '9876543210',
      location: {
        formattedAddress: ondc.location?.formattedAddress,
        pinCode: ondc.location?.pinCode,
        city: ondc.location?.city,
      },
    };
    const deduped = dedupeProviderNeutralCandidates([google, ondc]);
    expect(deduped).toHaveLength(2);
    expect(deduped[0]?.provider).toBe(SupplierNetworkProviderKind.GOOGLE_PLACES);
    expect(deduped[1]?.provider).toBe(SupplierNetworkProviderKind.ONDC);
    expect(ondc.otpSupplierId).toBeUndefined();
    expect(ondc.provenance).not.toBe('GOOGLE_PLACES');
  });

  it('fails closed on status manipulation toward LIVE', () => {
    expect(ondcIntegrationStatus()).toBe(SupplierNetworkProviderOperationalStatus.CREDENTIAL_GATED);
    expect(ondcIntegrationStatus()).not.toBe(SupplierNetworkProviderOperationalStatus.LIVE);

    const candidate = mustCandidate();
    const rejected = rejectClientOndcOverrides(candidate, { providerStatus: 'LIVE', integrationStatus: 'LIVE' });
    expect(rejected.candidate.providerStatus).toBe(SupplierNetworkProviderOperationalStatus.REACHABLE);
    expect(rejected.candidate.integrationStatus).toBe(SupplierNetworkProviderOperationalStatus.CREDENTIAL_GATED);
    expect(rejected.candidate.liveIntegrationCertified).toBe(false);

    const forged = {
      ...candidate,
      integrationStatus: SupplierNetworkProviderOperationalStatus.LIVE,
      liveIntegrationCertified: true,
      providerStatus: SupplierNetworkProviderOperationalStatus.LIVE,
    } as OndcNormalizedCandidate;
    const admitted = admitOndcCandidateToRfqAuthority(forged, SCOPE, emptyOndcRfqAuthorityState());
    expect(admitted.admission.entered).toBe(false);
    expect(admitted.admission.reason).toBe('live_status_rejected');
    expect(admitted.admission.integrationStatus).not.toBe(SupplierNetworkProviderOperationalStatus.LIVE);
    expect(admitted.admission.liveIntegrationCertified).toBe(false);
  });

  it('fails closed on client provider injection and a Google Place ID', () => {
    const candidate = mustCandidate();
    const rejected = rejectClientOndcOverrides(candidate, {
      provider: SupplierNetworkProviderKind.GOOGLE_PLACES,
      sellerId: 'injected-seller',
      participantId: 'injected-participant',
      placeId: 'ChIJ_injected',
      provenance: 'GOOGLE_PLACES',
    });
    expect(rejected.candidate).toBe(candidate);
    expect(rejected.candidate.provider).toBe(SupplierNetworkProviderKind.ONDC);
    expect(rejected.candidate.ondc.sellerId).toBe('seller-foundation-a');
    expect(rejected.candidate.ondc.participantId).toBe('participant-foundation-a');
    expect(rejected.candidate.provenance).toBe('ONDC_ON_SEARCH');
    expect(rejected.candidate).not.toHaveProperty('placeId');

    const injected = normalizeOndcOnSearchRecord(
      { ...reportedRecord(), placeId: 'ChIJ_injected' } as OndcOnSearchRecord,
      DISCOVERY_SCOPE,
    );
    expect(injected.ok).toBe(true);
    if (!injected.ok) return;
    expect(injected.candidate.provider).toBe(SupplierNetworkProviderKind.ONDC);
    expect(injected.candidate.provenance).toBe('ONDC_ON_SEARCH');
    expect(JSON.stringify(injected.candidate)).not.toContain('ChIJ_injected');
    expect(injected.candidate).not.toHaveProperty('placeId');
  });

  it('fails closed on a client invitation', () => {
    const state = emptyOndcRfqAuthorityState();
    const mutation = attemptClientRfqMutation(state, { invitation: 'INVITED', rfqId: SCOPE.rfqId });
    expect(mutation.ok).toBe(false);
    expect(mutation.reason).toBe('client_mutation_rejected');
    expect(mutation.state).toBe(state);
    expect(mutation.state.invitations).toHaveLength(0);
    expect(mutation.state.participants).toHaveLength(0);
  });

  it('fails closed on client supplier activation', () => {
    const candidate = mustCandidate();
    const rejected = rejectClientOndcOverrides(candidate, {
      otpSupplierId: OTP_SUPPLIER_ID,
      supplierActive: true,
      registered: true,
    });
    expect(rejected.candidate.otpSupplierId).toBeUndefined();
    expect(rejected.candidate.registered).toBe(false);
    expect(rejected.candidate.providerSupplierId).not.toBe(OTP_SUPPLIER_ID);

    const forged = {
      ...candidate,
      otpSupplierId: OTP_SUPPLIER_ID,
    } as OndcNormalizedCandidate;
    const admitted = admitOndcCandidateToRfqAuthority(forged, SCOPE, emptyOndcRfqAuthorityState());
    expect(admitted.admission.entered).toBe(false);
    expect(admitted.admission.reason).toBe('supplier_activation_rejected');
    expect(admitted.state.participants).toHaveLength(0);
  });

  it('fails closed on a cross-provider id collision', () => {
    const shared = 'shared-provider-token';
    const googleKey = providerIdentityKey(SupplierNetworkProviderKind.GOOGLE_PLACES, shared);
    const ondcKey = providerIdentityKey(
      SupplierNetworkProviderKind.ONDC,
      encodeOndcProviderSupplierId({
        participantId: 'participant-foundation-a',
        sellerId: shared,
        locationId: 'location-foundation-a',
      }) ?? '',
    );
    expect(googleKey).not.toBe(ondcKey);
    expect(ondcKey).not.toBe(OTP_SUPPLIER_ID);
    const ondc = mustCandidate({ sellerId: shared });
    const google: NormalizedProviderSupplierCandidate = {
      provider: SupplierNetworkProviderKind.GOOGLE_PLACES,
      providerSupplierId: shared,
      displayName: 'Reported Seller A',
    };
    expect(dedupeProviderNeutralCandidates([google, ondc])).toHaveLength(2);
  });

  it('does not substitute the seller PIN for the buyer PIN or invent geography', () => {
    const candidate = mustCandidate({
      sellerPin: '641001',
      sellerCity: 'Coimbatore',
      sellerState: 'Tamil Nadu',
      coordinates: undefined,
    });
    const rejected = rejectClientOndcOverrides(candidate, { pinCode: '560048', sellerPin: '560048', city: 'Bengaluru' });
    expect(rejected.candidate.requestedPin).toBe('560048');
    expect(rejected.candidate.location?.pinCode).toBe('641001');
    expect(rejected.candidate.location?.city).toBe('Coimbatore');
    expect(rejected.candidate.location?.coordinates).toBeUndefined();

    const geography = evaluateOndcDiscoveryGeography({
      requestedPin: rejected.candidate.requestedPin,
      sellerPin: rejected.candidate.location?.pinCode,
      sellerCity: rejected.candidate.location?.city,
      sellerState: rejected.candidate.location?.state,
    });
    expect(geography.normalization).toBe('RETAINED');
    expect(geography.sellerPinRelation).toBe('differs_from_requested_pin');
    expect(geography.requestedPin).toBe('560048');
    expect(geography.sellerPin).toBe('641001');

    const admitted = admitOndcCandidateToRfqAuthority(rejected.candidate, SCOPE, emptyOndcRfqAuthorityState());
    expect(admitted.admission.reason).not.toBe('normalization_failed');
    expect(rejected.candidate.location?.pinCode).toBe('641001');
    expect(rejected.candidate.requestedPin).toBe('560048');

    const missing = mustCandidate({
      sellerPin: undefined,
      sellerCity: undefined,
      sellerState: undefined,
      formattedAddress: undefined,
      coordinates: undefined,
    });
    expect(missing.requestedPin).toBe('560048');
    expect(missing.location).toBeUndefined();
    const goa = mustCandidate({ sellerState: 'Goa', sellerCity: 'Panaji', sellerPin: '403001' });
    expect(goa.location?.state).toBe('Goa');
  });

  it('fails closed on an invalid domain and an unsupported category without a heuristic escape', () => {
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
    expect(invalid.categoryClassification.support).toBe(OndcCategorySupport.NOT_SUPPORTED);
    expect(invalid.categoryClassification.providerDomain).toBe('ONDC:SRV11');
    const invalidAdmission = admitOndcCandidateToRfqAuthority(invalid, SCOPE, emptyOndcRfqAuthorityState());
    expect(invalidAdmission.admission.entered).toBe(false);
    expect(invalidAdmission.admission.reason).toBe('category_not_supported');
    expect(invalidAdmission.state.invitations).toHaveLength(0);

    const rejected = rejectClientOndcOverrides(labelOnly, { category: 'cctv', domain: 'ONDC:RET14' });
    expect(rejected.candidate.category).toBe('cotton yarn');
    expect(rejected.candidate.ondc.domain).toBe('ONDC:RET12');
  });

  it('fails closed when correlation or provenance is missing', () => {
    const missingCorrelation = normalizeOndcOnSearchRecord(
      reportedRecord({ correlationId: undefined }),
      DISCOVERY_SCOPE,
    );
    expect(missingCorrelation.ok).toBe(false);
    if (!missingCorrelation.ok) expect(missingCorrelation.reason).toBe('missing_correlation_id');

    const missingTime = normalizeOndcOnSearchRecord(
      reportedRecord({ observedAt: undefined, contextTimestamp: undefined }),
      DISCOVERY_SCOPE,
    );
    expect(missingTime.ok).toBe(false);
    if (!missingTime.ok) expect(missingTime.reason).toBe('missing_discovery_timestamp');

    const candidate = mustCandidate();
    expect(candidate.provenance).toBe('ONDC_ON_SEARCH');
    expect(candidate.provider).toBe(SupplierNetworkProviderKind.ONDC);
    expect(candidate.correlationId).toBe('tx-foundation-a');
    expect(candidate.discoveredAt).toBe('2026-10-01T05:31:00.000Z');
  });
});
