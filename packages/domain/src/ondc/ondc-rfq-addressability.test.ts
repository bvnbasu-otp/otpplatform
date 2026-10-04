import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SupplierNetworkProviderKind, providerIdentityKey } from '../types/supplier-provider-identity';
import {
  OndcObservationSource,
  OndcRuntimeEnvironment,
  type OndcEnvironmentConfigInput,
} from './ondc-environment';
import { OndcLifecycleCapability } from './ondc-category-mapping';
import { OndcGeographyMatch, ONDC_APPROVED_PROXIMITY_RADIUS_KM } from './ondc-geography';
import { encodeOndcProviderSupplierId, OndcNetworkReachabilityState } from './ondc-provider-foundation';
import {
  ONDC_SOURCING_GEOGRAPHY_ADMISSION,
  OndcSourcingAdmissionReason,
  evaluateOndcSourcingAddressability,
  evaluateOndcSourcingAddressabilitySet,
  evaluateProviderSourcingAdmission,
  toOndcSourcingAdmissionBuyerView,
  type OndcSourcingParticipant,
  type OndcSourcingRequest,
} from './ondc-rfq-addressability';

const OBSERVED_AT = '2026-10-04T01:00:00.000Z';
const CORRELATION_ID = 'corr-ondc-05-local';
const PHONE = '9876543210';
const EMAIL = 'seller@seller.in';
const ADDRESS = '12 Market Road, Indiranagar';
const ENDPOINT = 'https://bpp.seller.in/ondc';

function identity(participantId: string, sellerId: string, locationId = 'loc-1'): string {
  const encoded = encodeOndcProviderSupplierId({ participantId, sellerId, locationId });
  if (!encoded) throw new Error('fixture identity was rejected');
  return encoded;
}

function request(overrides: Partial<OndcSourcingRequest> = {}): OndcSourcingRequest {
  return {
    buyerRequestedPin: '560001',
    subcategoryCode: 'cotton_yarn',
    otpCategory: 'Cotton Yarn',
    requirementMode: 'COMMERCIAL_ORDER',
    correlationId: CORRELATION_ID,
    observedAt: OBSERVED_AT,
    ...overrides,
  };
}

function participant(overrides: Partial<OndcSourcingParticipant> = {}): OndcSourcingParticipant {
  return {
    provider: SupplierNetworkProviderKind.ONDC,
    providerSupplierId: identity('bpp.seller.in', 'seller-1'),
    providerParticipantId: 'bpp.seller.in',
    endpoint: ENDPOINT,
    sellerPin: '560001',
    displayName: 'Sri Textiles',
    phone: PHONE,
    email: EMAIL,
    formattedAddress: ADDRESS,
    canReceiveRfq: true,
    supplierExists: true,
    ...overrides,
  };
}

function localEnvironment(overrides: Partial<OndcEnvironmentConfigInput> = {}): OndcEnvironmentConfigInput {
  return {
    environmentRaw: 'LOCAL',
    preprod: {},
    production: {},
    ...overrides,
  };
}

function slot(prefix: string, subscriberId: string) {
  return {
    gatewayUrl: `https://${prefix}.example.test/gateway`,
    subscriberId,
    uniqueKeyId: `${prefix}-key`,
    signingPrivateKey: `${prefix}-signing-material`,
    registryUrl: `https://${prefix}.example.test/registry`,
    callbackUrl: `https://${prefix}.example.test/callback`,
  };
}

describe('ONDC-05 sourcing addressability (MOCK/LOCAL)', () => {
  it('admits an exact-pin textile participant without creating procurement', () => {
    const decision = evaluateOndcSourcingAddressability(participant(), request(), localEnvironment(), 'true');
    expect(decision.admissible).toBe(true);
    expect(decision.reason).toBe(OndcSourcingAdmissionReason.ADMISSIBLE);
    expect(decision.provider).toBe(SupplierNetworkProviderKind.ONDC);
    expect(decision.providerSupplierId).toBe(identity('bpp.seller.in', 'seller-1'));
    expect(decision.domain).toBe('ONDC:RET12');
    expect(decision.category).toBe('cotton_yarn');
    expect(decision.lifecycleCapability).toBe(OndcLifecycleCapability.DISCOVERY_ONLY);
    expect(decision.buyerRequestedPin).toBe('560001');
    expect(decision.sellerGeography?.match).toBe(OndcGeographyMatch.EXACT_PIN);
    expect(decision.sellerGeography?.sellerPin).toBe('560001');
    expect(decision.addressability).toBe(OndcNetworkReachabilityState.NETWORK_ADDRESSABLE);
    expect(decision.networkAddressable).toBe(true);
    expect(decision.addressability).not.toBe('NETWORK_REACHABLE');
    expect(decision.environment).toBe(OndcRuntimeEnvironment.LOCAL);
    expect(decision.observationSource).toBe(OndcObservationSource.MOCK);
    expect(decision.observationSource).not.toBe(OndcObservationSource.REAL_NETWORK);
    expect(decision.credentialSlot).toBe('NONE');
    expect(decision.timestamp).toBe(OBSERVED_AT);
    expect(decision.correlationId).toBe(CORRELATION_ID);
    expect(decision.stage).toBe('DISCOVERED');
    expect(decision.canReceiveRfq).toBe(false);
    expect(decision.quotation).toBe(false);
    expect(decision.otpRegistered).toBe(false);
    expect(decision.otpVerified).toBe(false);
    expect(decision.gstVerified).toBe(false);
    expect(decision.verifiedSupplierLabel).toBeNull();
    expect(decision.invitationCreated).toBe(false);
    expect(decision.networkCallAttempted).toBe(false);
    expect(JSON.stringify(decision)).not.toContain(PHONE);
    expect(JSON.stringify(decision)).not.toContain(EMAIL);
    expect(JSON.stringify(decision)).not.toContain(ENDPOINT);
  });

  it('maps non-project CCTV to RET14 and rejects project CCTV and other categories', () => {
    const cctv = evaluateOndcSourcingAddressability(
      participant(),
      request({ subcategoryCode: 'cctv_surveillance', otpCategory: 'CCTV', requirementMode: 'COMMERCIAL_ORDER' }),
      localEnvironment(),
    );
    expect(cctv.admissible).toBe(true);
    expect(cctv.domain).toBe('ONDC:RET14');
    expect(cctv.lifecycleCapability).toBe(OndcLifecycleCapability.DISCOVERY_ONLY);

    const project = evaluateOndcSourcingAddressability(
      participant(),
      request({
        subcategoryCode: 'cctv_surveillance',
        requirementMode: 'PROJECT_CONTRACT',
        client: { ondcDomain: 'ONDC:RET14', title: 'CCTV installation' },
      }),
      localEnvironment(),
    );
    expect(project.admissible).toBe(false);
    expect(project.reason).toBe(OndcSourcingAdmissionReason.UNSUPPORTED_CATEGORY);
    expect(project.domain).toBeNull();

    const other = evaluateOndcSourcingAddressability(
      participant(),
      request({ subcategoryCode: 'general_products', otpCategory: 'Cotton Yarn' }),
      localEnvironment(),
    );
    expect(other.admissible).toBe(false);
    expect(other.reason).toBe(OndcSourcingAdmissionReason.UNSUPPORTED_CATEGORY);
    expect(other.domain).toBeNull();
  });

  it('refuses title heuristics and client domain or taxonomy injection', () => {
    const titleOnly = evaluateOndcSourcingAddressability(
      participant(),
      request({
        subcategoryCode: null,
        otpCategory: 'Cotton Yarn',
        client: {
          title: 'Cotton Yarn camera CCTV shirt',
          ondcDomain: 'ONDC:RET12',
          taxonomy: { subcategoryCode: 'cotton_yarn', ondcDomain: 'ONDC:RET12' },
        },
      }),
      localEnvironment(),
    );
    expect(titleOnly.admissible).toBe(false);
    expect(titleOnly.reason).toBe(OndcSourcingAdmissionReason.MISSING_DOMAIN);
    expect(titleOnly.domain).toBeNull();

    const injected = evaluateOndcSourcingAddressability(
      participant(),
      request({
        subcategoryCode: 'cotton_yarn',
        client: { ondcDomain: 'ONDC:RET14', ondcCategory: 'RET14', title: 'CCTV camera' },
      }),
      localEnvironment(),
    );
    expect(injected.admissible).toBe(true);
    expect(injected.domain).toBe('ONDC:RET12');
    expect(injected.lifecycleCapability).toBe(OndcLifecycleCapability.DISCOVERY_ONLY);
  });

  it('does not treat a phone, a flag, supplier existence, or provider kind as addressability', () => {
    const missing = evaluateOndcSourcingAddressability(
      participant({ endpoint: '   ', canReceiveRfq: true, supplierExists: true, phone: PHONE }),
      request(),
      localEnvironment(),
    );
    expect(missing.networkAddressable).toBe(false);
    expect(missing.addressability).toBe(OndcNetworkReachabilityState.ENDPOINT_MISSING);
    expect(missing.reason).toBe(OndcSourcingAdmissionReason.ENDPOINT_MISSING);
    expect(missing.admissible).toBe(false);
    expect(missing.canReceiveRfq).toBe(false);
    expect(JSON.stringify(missing)).not.toContain('NETWORK_REACHABLE');

    for (const endpoint of ['not a url', 'ftp://bpp.seller.in/ondc', 'NETWORK', 'https://unknown-bpp/callback', 'https://example/on_search']) {
      const rejected = evaluateOndcSourcingAddressability(participant({ endpoint }), request(), localEnvironment());
      expect(rejected.reason).toBe(OndcSourcingAdmissionReason.ENDPOINT_INVALID);
      expect(rejected.networkAddressable).toBe(false);
      expect(rejected.admissible).toBe(false);
    }

    const unavailable = evaluateOndcSourcingAddressability(
      participant({ unavailable: true }),
      request(),
      localEnvironment(),
    );
    expect(unavailable.reason).toBe(OndcSourcingAdmissionReason.NETWORK_UNREACHABLE);
    expect(unavailable.networkAddressable).toBe(false);
  });

  it('keeps synthetic hosts addressable in mock and invalid in a real pre-prod context', () => {
    const localHost = evaluateOndcSourcingAddressability(
      participant({ endpoint: 'https://localhost/on_search' }),
      request(),
      localEnvironment(),
    );
    expect(localHost.admissible).toBe(true);
    expect(localHost.observationSource).toBe(OndcObservationSource.MOCK);
    expect(localHost.addressability).toBe(OndcNetworkReachabilityState.NETWORK_ADDRESSABLE);

    const preprod = localEnvironment({
      environmentRaw: 'PRE_PROD',
      preprod: slot('preprod', 'preprod-subscriber'),
      production: slot('production', 'production-subscriber'),
    });
    const synthetic = evaluateOndcSourcingAddressability(
      participant({ endpoint: 'https://bpp.example.test/ondc' }),
      request(),
      preprod,
    );
    expect(synthetic.observationSource).toBe(OndcObservationSource.REAL_NETWORK);
    expect(synthetic.credentialSlot).toBe('PRE_PROD');
    expect(synthetic.reason).toBe(OndcSourcingAdmissionReason.ENDPOINT_INVALID);
    expect(synthetic.admissible).toBe(false);
    expect(synthetic.networkCallAttempted).toBe(false);
  });

  it('records geography and rejects it only for an invalid or missing buyer PIN', () => {
    expect(ONDC_APPROVED_PROXIMITY_RADIUS_KM).toBeNull();
    expect(ONDC_SOURCING_GEOGRAPHY_ADMISSION.radiusKm).toBeNull();
    expect(ONDC_SOURCING_GEOGRAPHY_ADMISSION.outOfAreaMeans).toBe('seller_pin_differs');
    expect(ONDC_SOURCING_GEOGRAPHY_ADMISSION.rejectsOn).toEqual(['invalid_buyer_pin', 'missing_buyer_pin']);
    expect(ONDC_SOURCING_GEOGRAPHY_ADMISSION).not.toHaveProperty('passesOn');
    expect(Object.values(OndcGeographyMatch)).not.toContain('NEARBY');

    const exact = evaluateOndcSourcingAddressability(participant(), request(), localEnvironment());
    expect(exact.admissible).toBe(true);
    expect(exact.reason).toBe(OndcSourcingAdmissionReason.ADMISSIBLE);
    expect(exact.sellerGeography?.match).toBe(OndcGeographyMatch.EXACT_PIN);
    expect(exact.buyerRequestedPin).toBe('560001');
    expect(exact.sellerGeography?.sellerPin).toBe('560001');

    const outOfArea = evaluateOndcSourcingAddressability(
      participant({
        sellerPin: '560048',
        sellerCity: 'Bengaluru',
        sellerLocality: 'Indiranagar',
      }),
      request({
        client: { buyerPin: '560048', dropdownCity: 'Bengaluru', dropdownTown: 'Indiranagar' },
      }),
      localEnvironment(),
    );
    expect(outOfArea.admissible).toBe(true);
    expect(outOfArea.reason).toBe(OndcSourcingAdmissionReason.ADMISSIBLE);
    expect(outOfArea.reason).not.toBe(OndcSourcingAdmissionReason.OUT_OF_AREA);
    expect(outOfArea.buyerRequestedPin).toBe('560001');
    expect(outOfArea.sellerGeography?.buyerRequestedPin).toBe('560001');
    expect(outOfArea.sellerGeography?.sellerPin).toBe('560048');
    expect(outOfArea.sellerGeography?.dropdownUsed).toBe(false);
    expect(outOfArea.sellerGeography?.match).toBe(OndcGeographyMatch.OUT_OF_AREA);
    expect(outOfArea.sellerGeography?.match).not.toBe(OndcGeographyMatch.EXACT_PIN);
    expect(toOndcSourcingAdmissionBuyerView(outOfArea).geographyMatch).toBe(OndcGeographyMatch.OUT_OF_AREA);
    expect(toOndcSourcingAdmissionBuyerView(outOfArea).admissible).toBe(true);
    expect(JSON.stringify(outOfArea)).not.toContain('NEARBY');

    const eligibleOutOfArea = evaluateOndcSourcingAddressabilitySet({
      participants: [participant({ sellerPin: '560048' })],
      request: request(),
      environment: localEnvironment(),
    });
    expect(eligibleOutOfArea.eligible).toHaveLength(1);
    expect(eligibleOutOfArea.eligible[0]?.sellerGeography?.match).toBe(OndcGeographyMatch.OUT_OF_AREA);
    expect(eligibleOutOfArea.procurement.invitations).toBe(0);

    const missingSellerPin = evaluateOndcSourcingAddressability(
      participant({ sellerPin: null, sellerLocality: null, sellerCity: null, sellerState: null }),
      request(),
      localEnvironment(),
    );
    expect(missingSellerPin.admissible).toBe(true);
    expect(missingSellerPin.reason).toBe(OndcSourcingAdmissionReason.ADMISSIBLE);
    expect(missingSellerPin.sellerGeography?.sellerPin).toBeNull();
    expect(missingSellerPin.sellerGeography?.match).toBe(OndcGeographyMatch.UNKNOWN);
    expect(missingSellerPin.buyerRequestedPin).toBe('560001');

    const unknown = evaluateOndcSourcingAddressability(
      participant({ sellerPin: 'not-a-pin', sellerLocality: null, sellerCity: null, sellerState: null }),
      request(),
      localEnvironment(),
    );
    expect(unknown.admissible).toBe(true);
    expect(unknown.reason).toBe(OndcSourcingAdmissionReason.ADMISSIBLE);
    expect(unknown.reason).not.toBe(OndcSourcingAdmissionReason.GEOGRAPHY_UNKNOWN);
    expect(unknown.sellerGeography?.sellerPin).toBe('not-a-pin');
    expect(unknown.sellerGeography?.match).toBe(OndcGeographyMatch.UNKNOWN);
    expect(unknown.sellerGeography?.match).not.toBe(OndcGeographyMatch.EXACT_PIN);

    const sameLocality = evaluateOndcSourcingAddressability(
      participant({ sellerPin: null, sellerLocality: 'Indiranagar' }),
      request({ requestedLocality: 'indiranagar' }),
      localEnvironment(),
    );
    expect(sameLocality.admissible).toBe(true);
    expect(sameLocality.reason).toBe(OndcSourcingAdmissionReason.ADMISSIBLE);
    expect(sameLocality.reason).not.toBe(OndcSourcingAdmissionReason.SAME_LOCALITY);
    expect(sameLocality.sellerGeography?.match).toBe(OndcGeographyMatch.SAME_LOCALITY);
    expect(sameLocality.sellerGeography?.sellerPin).toBeNull();
    expect(sameLocality.buyerRequestedPin).toBe('560001');

    const providerArea = evaluateOndcSourcingAddressability(
      participant({ sellerPin: null, sellerCity: 'Bengaluru' }),
      request(),
      localEnvironment(),
    );
    expect(providerArea.admissible).toBe(true);
    expect(providerArea.reason).toBe(OndcSourcingAdmissionReason.ADMISSIBLE);
    expect(providerArea.reason).not.toBe(OndcSourcingAdmissionReason.PROVIDER_AREA);
    expect(providerArea.sellerGeography?.match).toBe(OndcGeographyMatch.PROVIDER_AREA);
    expect(providerArea.sellerGeography?.sellerPin).toBeNull();

    const mismatchStillEndpoint = evaluateOndcSourcingAddressability(
      participant({ sellerPin: '560048', endpoint: '   ' }),
      request(),
      localEnvironment(),
    );
    expect(mismatchStillEndpoint.admissible).toBe(false);
    expect(mismatchStillEndpoint.reason).toBe(OndcSourcingAdmissionReason.ENDPOINT_MISSING);
    expect(mismatchStillEndpoint.sellerGeography?.match).toBe(OndcGeographyMatch.OUT_OF_AREA);

    const missingPin = evaluateOndcSourcingAddressability(
      participant({ sellerPin: '560001' }),
      request({ buyerRequestedPin: null }),
      localEnvironment(),
    );
    expect(missingPin.admissible).toBe(false);
    expect(missingPin.reason).toBe(OndcSourcingAdmissionReason.GEOGRAPHY_NOT_APPLICABLE);
    expect(missingPin.buyerRequestedPin).toBeNull();
    expect(missingPin.sellerGeography?.sellerPin).toBe('560001');
    expect(missingPin.sellerGeography?.match).not.toBe(OndcGeographyMatch.EXACT_PIN);

    const invalidPin = evaluateOndcSourcingAddressability(
      participant(),
      request({ buyerRequestedPin: '123', client: { buyerPin: '560001' } }),
      localEnvironment(),
    );
    expect(invalidPin.reason).toBe(OndcSourcingAdmissionReason.INVALID_BUYER_PIN);
    expect(invalidPin.buyerRequestedPin).toBeNull();
    expect(invalidPin.sellerGeography?.buyerPinStatus).toBe('REJECTED');
    expect(invalidPin.sellerGeography?.sellerPin).toBe('560001');
    expect(invalidPin.admissible).toBe(false);
  });

  it('keeps separate identities and rejects client identity injection', () => {
    const shared = {
      displayName: 'Sri Textiles',
      phone: PHONE,
      email: EMAIL,
      formattedAddress: ADDRESS,
    };
    const first = participant(shared);
    const second = participant({
      ...shared,
      providerSupplierId: identity('bpp.other.in', 'seller-2', 'loc-2'),
      providerParticipantId: 'bpp.other.in',
    });
    const batch = evaluateOndcSourcingAddressabilitySet(
      { participants: [first, second, first], request: request(), environment: localEnvironment() },
    );
    expect(batch.eligible).toHaveLength(2);
    expect(batch.decisions).toHaveLength(3);
    expect(batch.eligible.map((row) => row.providerSupplierId)).toEqual([
      first.providerSupplierId,
      second.providerSupplierId,
    ]);
    expect(providerIdentityKey('ONDC', first.providerSupplierId ?? '')).not.toBe(
      providerIdentityKey('ONDC', second.providerSupplierId ?? ''),
    );
    expect(batch.procurement).toEqual({
      invitations: 0,
      quotes: 0,
      awards: 0,
      purchaseOrders: 0,
      payments: 0,
      cashback: 0,
    });

    const injected = evaluateOndcSourcingAddressability(
      participant(),
      request({ client: { participantId: 'client-injected-bpp', otpSupplierId: 'otp-supplier-99' } }),
      localEnvironment(),
    );
    expect(injected.reason).toBe(OndcSourcingAdmissionReason.IDENTITY_CONFLICT);
    expect(injected.admissible).toBe(false);
    expect(JSON.stringify(injected)).not.toContain('client-injected-bpp');
    expect(JSON.stringify(injected)).not.toContain('otp-supplier-99');

    const linked = evaluateOndcSourcingAddressability(
      participant({ otpSupplierId: 'otp-supplier-77' }),
      request(),
      localEnvironment(),
    );
    expect(linked.reason).toBe(OndcSourcingAdmissionReason.IDENTITY_CONFLICT);
    expect(JSON.stringify(linked)).not.toContain('otp-supplier-77');

    const mismatch = evaluateOndcSourcingAddressability(
      participant({ providerParticipantId: 'other-participant' }),
      request(),
      localEnvironment(),
    );
    expect(mismatch.reason).toBe(OndcSourcingAdmissionReason.IDENTITY_CONFLICT);

    const phoneIdentity = evaluateOndcSourcingAddressability(
      participant({ providerSupplierId: PHONE }),
      request(),
      localEnvironment(),
    );
    expect(phoneIdentity.reason).toBe(OndcSourcingAdmissionReason.IDENTITY_CONFLICT);

    const placeId = evaluateOndcSourcingAddressability(
      participant({ providerSupplierId: 'ChIJgoogleplace', providerParticipantId: null }),
      request(),
      localEnvironment(),
    );
    expect(placeId.reason).toBe(OndcSourcingAdmissionReason.INVALID_CANDIDATE);

    const missingIdentity = evaluateOndcSourcingAddressability(
      participant({ providerSupplierId: '  ' }),
      request(),
      localEnvironment(),
    );
    expect(missingIdentity.reason).toBe(OndcSourcingAdmissionReason.MISSING_PROVIDER_IDENTITY);

    const named = evaluateOndcSourcingAddressability(
      participant({ displayName: 'seller-1' }),
      request(),
      localEnvironment(),
    );
    expect(named.reason).toBe(OndcSourcingAdmissionReason.BUSINESS_NAME_IDENTITY);

    const fabricated = evaluateOndcSourcingAddressability(
      participant({ displayName: 'ONDC Verified Supplier' }),
      request(),
      localEnvironment(),
    );
    expect(fabricated.reason).toBe(OndcSourcingAdmissionReason.FABRICATED_DISPLAY_NAME);
    expect(fabricated.verifiedSupplierLabel).toBeNull();
    const fabricatedView = JSON.stringify(toOndcSourcingAdmissionBuyerView(fabricated));
    expect(fabricatedView).not.toContain('ONDC Verified Supplier');
    expect(fabricatedView).not.toContain('verified supplier');
  });

  it('labels LOCAL and CI as mock and never as a real network', () => {
    for (const environmentRaw of ['LOCAL', 'CI', 'MOCK']) {
      const decision = evaluateOndcSourcingAddressability(
        participant(),
        request(),
        localEnvironment({
          environmentRaw,
          providerEnabled: 'true',
          networkEnabled: 'true',
          preprod: slot('preprod', 'preprod-subscriber'),
          production: slot('production', 'production-subscriber'),
        }),
        'true',
      );
      expect(decision.admissible).toBe(true);
      expect(decision.observationSource).toBe(OndcObservationSource.MOCK);
      expect(decision.observationSource).not.toBe(OndcObservationSource.REAL_NETWORK);
      expect(decision.credentialSlot).toBe('NONE');
      expect(decision.environment).not.toBe(OndcRuntimeEnvironment.PRODUCTION);
      expect(decision.environment).not.toBe(OndcRuntimeEnvironment.PRE_PROD);
    }
    expect(
      evaluateOndcSourcingAddressability(participant(), request(), localEnvironment({ environmentRaw: 'CI' })).environment,
    ).toBe(OndcRuntimeEnvironment.CI);
  });

  it('does not cross credential slots, call the network, or admit production', () => {
    const originalFetch = globalThis.fetch;
    const fetchCalls: unknown[] = [];
    globalThis.fetch = ((...args: unknown[]) => {
      fetchCalls.push(args);
      throw new Error('addressability must not perform network I/O');
    }) as typeof fetch;

    try {
      const gated = evaluateOndcSourcingAddressabilitySet({
        participants: [participant()],
        request: request(),
        environment: localEnvironment({
          environmentRaw: 'PRE_PROD',
          production: slot('production', 'production-subscriber'),
        }),
        ondcEnabled: 'true',
      });
      expect(gated.decisions[0]?.reason).toBe(OndcSourcingAdmissionReason.CREDENTIAL_GATED);
      expect(gated.decisions[0]?.admissible).toBe(false);
      expect(gated.decisions[0]?.observationSource).toBeNull();
      expect(gated.decisions[0]?.credentialSlot).toBe('NONE');
      expect(gated.eligible).toHaveLength(0);
      expect(JSON.stringify(gated)).not.toContain('production-subscriber');
      expect(JSON.stringify(gated)).not.toContain('production-signing-material');

      const ready = evaluateOndcSourcingAddressabilitySet({
        participants: [participant()],
        request: request(),
        environment: localEnvironment({
          environmentRaw: 'PRE_PROD',
          preprod: slot('preprod', 'preprod-subscriber'),
          production: slot('production', 'production-subscriber'),
        }),
        ondcEnabled: 'true',
      });
      expect(ready.decisions[0]?.admissible).toBe(true);
      expect(ready.decisions[0]?.observationSource).toBe(OndcObservationSource.REAL_NETWORK);
      expect(ready.decisions[0]?.credentialSlot).toBe('PRE_PROD');
      expect(ready.decisions[0]?.networkCallAttempted).toBe(false);
      expect(ready.networkCallAttempted).toBe(false);
      expect(ready.procurement.invitations).toBe(0);
      expect(JSON.stringify(ready)).not.toContain('preprod-signing-material');
      expect(JSON.stringify(ready)).not.toContain('production-subscriber');
      expect(JSON.stringify(ready)).not.toContain(ENDPOINT);

      const disabled = evaluateOndcSourcingAddressability(
        participant(),
        request(),
        localEnvironment({
          environmentRaw: 'PRE_PROD',
          providerEnabled: 'false',
          preprod: slot('preprod', 'preprod-subscriber'),
        }),
        'true',
      );
      expect(disabled.reason).toBe(OndcSourcingAdmissionReason.ENVIRONMENT_DISABLED);
      expect(disabled.observationSource).not.toBe(OndcObservationSource.REAL_NETWORK);

      const unknownEnvironment = evaluateOndcSourcingAddressability(
        participant(),
        request(),
        localEnvironment({ environmentRaw: 'NOPE' }),
        'true',
      );
      expect(unknownEnvironment.reason).toBe(OndcSourcingAdmissionReason.ENVIRONMENT_DISABLED);
      expect(unknownEnvironment.observationSource).toBeNull();

      const production = evaluateOndcSourcingAddressabilitySet({
        participants: [participant()],
        request: request(),
        environment: localEnvironment({
          environmentRaw: 'PRODUCTION',
          productionEnabled: 'true',
          providerEnabled: 'true',
          networkEnabled: 'true',
          preprod: slot('preprod', 'preprod-subscriber'),
          production: slot('production', 'production-subscriber'),
        }),
        ondcEnabled: 'true',
      });
      expect(production.decisions[0]?.reason).toBe(OndcSourcingAdmissionReason.PRODUCTION_DISABLED);
      expect(production.decisions[0]?.admissible).toBe(false);
      expect(production.decisions[0]?.environment).toBe(OndcRuntimeEnvironment.PRODUCTION);
      expect(production.decisions[0]?.observationSource).not.toBe(OndcObservationSource.REAL_NETWORK);
      expect(production.decisions[0]?.credentialSlot).toBe('NONE');
      expect(production.decisions[0]?.networkAddressable).toBe(true);
      expect(production.eligible).toHaveLength(0);
      expect(production.procurement).toEqual({
        invitations: 0,
        quotes: 0,
        awards: 0,
        purchaseOrders: 0,
        payments: 0,
        cashback: 0,
      });
      expect(JSON.stringify(production)).not.toContain('preprod-subscriber');
      expect(JSON.stringify(production)).not.toContain('production-subscriber');
      expect(JSON.stringify(production)).not.toContain('signing-material');
    } finally {
      globalThis.fetch = originalFetch;
    }
    expect(fetchCalls).toHaveLength(0);
  });

  it('hides endpoint, phone, and email on the buyer-safe view and leaves other providers unsupported', () => {
    const decision = evaluateOndcSourcingAddressability(participant(), request(), localEnvironment());
    const view = toOndcSourcingAdmissionBuyerView(decision);
    expect(view.provider).toBe(SupplierNetworkProviderKind.ONDC);
    expect(view.domain).toBe('ONDC:RET12');
    expect(view.geographyMatch).toBe(OndcGeographyMatch.EXACT_PIN);
    expect(view.admissible).toBe(true);
    expect(view.otpVerified).toBe(false);
    expect(view.gstVerified).toBe(false);
    expect(view).not.toHaveProperty('providerSupplierId');
    expect(view).not.toHaveProperty('phone');
    expect(view).not.toHaveProperty('email');
    const serialized = JSON.stringify(view);
    expect(serialized).not.toContain('https://');
    expect(serialized).not.toContain(PHONE);
    expect(serialized).not.toContain(EMAIL);
    expect(serialized).not.toContain('bpp.seller.in');

    const google = evaluateProviderSourcingAdmission({
      provider: SupplierNetworkProviderKind.GOOGLE_PLACES,
      participants: [participant({ provider: SupplierNetworkProviderKind.GOOGLE_PLACES, endpoint: ENDPOINT, phone: PHONE })],
      request: request(),
      environment: localEnvironment(),
      ondcEnabled: 'true',
    });
    expect(google.decisions[0]?.reason).toBe(OndcSourcingAdmissionReason.UNSUPPORTED_PROVIDER);
    expect(google.decisions[0]?.domain).toBeNull();
    expect(google.decisions[0]?.networkAddressable).toBe(false);
    expect(google.eligible).toHaveLength(0);
    expect(google.procurement.invitations).toBe(0);
    expect(google.procurement.quotes).toBe(0);
    expect(JSON.stringify(google)).not.toContain(ENDPOINT);
    expect(JSON.stringify(google)).not.toContain(PHONE);
  });

  it('rejects a malformed request envelope and does not invent a participant', () => {
    const missingCorrelation = evaluateOndcSourcingAddressability(
      participant(),
      request({ correlationId: '  ' }),
      localEnvironment(),
    );
    expect(missingCorrelation.reason).toBe(OndcSourcingAdmissionReason.INVALID_CANDIDATE);
    expect(missingCorrelation.admissible).toBe(false);

    const empty = evaluateOndcSourcingAddressabilitySet({
      participants: [],
      request: request(),
      environment: localEnvironment(),
    });
    expect(empty.decisions[0]?.reason).toBe(OndcSourcingAdmissionReason.MISSING_PROVIDER_IDENTITY);
    expect(empty.eligible).toHaveLength(0);
    expect(empty.procurement.invitations).toBe(0);
    expect(JSON.stringify(empty)).not.toContain('ONDC Verified Supplier');
  });

  it('stays inside the addressability module and does not dispatch procurement', () => {
    const source = readFileSync(new URL('./ondc-rfq-addressability.ts', import.meta.url), 'utf8');
    expect(source).toContain('mapOndcDiscoveryCategory');
    expect(source).not.toContain('mapExplicitSubcategoryToOndcDomain');
    expect(source).not.toContain('shouldUseCategoryTitleHeuristicsForOndc');
    expect(source).not.toContain('discover_and_invite_for_rfq');
    expect(source).not.toContain('rfq_invitations');
    expect(source).not.toContain('RFQ_CAPABLE');
    expect(source).not.toContain('ORDER_CAPABLE');
    expect(source).not.toContain('NEARBY');
    expect(source).not.toContain('passesOn');
    expect(source).not.toMatch(/\bfetch\s*\(/);
    expect(source).not.toMatch(/\b(?:dns|net|tls|https?)\.(?:lookup|resolve|connect|request|get)\b/);
    expect(source).not.toMatch(/radiusKm\s*[:=]\s*[1-9]/);
  });
});
