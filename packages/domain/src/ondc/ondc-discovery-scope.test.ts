/**
 * ONDC-04 geography, category, reachability, identity, trust, and environment.
 * LOCAL/CI/MOCK. These tests do not call a live ONDC network.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  ProviderReachabilityKind,
  SupplierNetworkProviderKind,
  SupplierNetworkProviderOperationalStatus,
  providerIdentityKey,
} from '../types/supplier-provider-identity';
import { admitOndcOnSearchCallback } from './ondc-callback-guard';
import {
  ONDC_CATEGORY_MAPPING_SOURCE,
  ONDC_CATEGORY_MAPPING_VERSION,
  OndcDiscoverySupportStatus,
  OndcLifecycleCapability,
  mapOndcDiscoveryCategory,
} from './ondc-category-mapping';
import {
  createOndcDiscoveryStore,
  ondcDiscoveryRfqCapability,
  retainOndcDiscoveryObservation,
  toOndcDiscoveryBuyerView,
} from './ondc-discovery-persistence';
import {
  googlePlaceIdAsOndcProviderSupplierId,
  ondcDiscoveryTrustClaims,
  ondcIdentitySeparatesPlaceId,
  ondcProviderIdentitiesStaySeparate,
} from './ondc-discovery-scope';
import {
  OndcObservationSource,
  OndcRuntimeEnvironment,
  resolveOndcEnvironmentGate,
  type OndcSlotConfigInput,
} from './ondc-environment';
import {
  ONDC_APPROVED_PROXIMITY_RADIUS_KM,
  OndcGeographyMatch,
  acceptBuyerRequestedPin,
  classifyOndcBuyerSellerGeography,
} from './ondc-geography';
import {
  ONDC_REACHABILITY_PROVIDER_STATUS,
  OndcNetworkReachabilityState,
  classifyOndcNetworkReachability,
  encodeOndcProviderSupplierId,
  normalizeOndcOnSearchRecord,
  type OndcOnSearchRecord,
} from './ondc-provider-foundation';

const TEXTILE_CODES = [
  'cotton_yarn',
  'synthetic_yarn',
  'fabric_woven',
  'fabric_knitted',
  'garments',
  'dyeing_processing',
  'knitting_job_work',
  'embroidery_printing',
  'textile_machinery',
  'textile_accessories',
] as const;

function slot(prefix: string): OndcSlotConfigInput {
  return {
    gatewayUrl: `https://${prefix}.example.test/gateway`,
    subscriberId: `${prefix}-subscriber`,
    uniqueKeyId: `${prefix}-key`,
    signingPrivateKey: `${prefix}-signing-material`,
    registryUrl: `https://${prefix}.example.test/registry`,
    callbackUrl: `https://${prefix}.example.test/callback`,
  };
}

function record(overrides: Partial<OndcOnSearchRecord> = {}): OndcOnSearchRecord {
  return {
    participantId: 'participant-scope-a',
    sellerId: 'seller-scope-a',
    sellerName: 'Reported Scope Seller',
    locationId: 'location-scope-a',
    endpoint: 'https://bpp.example.test/ondc',
    sellerPin: '560037',
    sellerCity: 'Bengaluru',
    correlationId: 'tx-scope-a',
    messageId: 'msg-scope-a',
    contextTimestamp: '2026-10-01T05:30:00.000Z',
    domain: 'ONDC:RET12',
    category: 'cotton yarn',
    ...overrides,
  };
}

describe('ONDC-04 discovery scope (LOCAL/CI/MOCK)', () => {
  it('keeps the buyer PIN and does not invent a proximity radius', () => {
    expect(ONDC_APPROVED_PROXIMITY_RADIUS_KM).toBeNull();
    expect(Object.values(OndcGeographyMatch)).not.toContain('NEARBY');

    const decision = classifyOndcBuyerSellerGeography({
      buyerRequestedPin: '560048',
      sellerPin: '560037',
      sellerCity: 'Bengaluru',
      dropdownCity: 'Bengaluru',
      dropdownTown: 'Koramangala',
    });
    expect(decision.ok).toBe(true);
    if (!decision.ok) return;
    expect(decision.geography.buyerRequestedPin).toBe('560048');
    expect(decision.geography.sellerPin).toBe('560037');
    expect(decision.geography.match).toBe(OndcGeographyMatch.OUT_OF_AREA);
    expect(decision.geography.dropdownUsed).toBe(false);
    expect(decision.geography.sellerClaimedInBuyerPin).toBe(false);

    const normalized = normalizeOndcOnSearchRecord(record(), {
      requestedPin: '560048',
      requestedCategory: 'cotton yarn',
      requestedSubcategoryCode: 'cotton_yarn',
    });
    expect(normalized.ok).toBe(true);
    if (!normalized.ok) return;
    expect(normalized.candidate.requestedPin).toBe('560048');
    expect(normalized.candidate.location?.pinCode).toBe('560037');
    expect(normalized.candidate.geography.buyerRequestedPin).not.toBe(normalized.candidate.geography.sellerPin);
  });

  it('rejects an invalid buyer PIN and accepts a valid PIN the dropdown does not list', () => {
    expect(acceptBuyerRequestedPin('56004').ok).toBe(false);
    expect(acceptBuyerRequestedPin('012345').ok).toBe(false);
    const rejected = classifyOndcBuyerSellerGeography({
      buyerRequestedPin: '5600',
      sellerPin: '560037',
      dropdownCity: 'Bengaluru',
    });
    expect(rejected.ok).toBe(false);
    if (rejected.ok) return;
    expect(rejected.reason).toBe('invalid_buyer_pin');
    expect(rejected.geography.buyerRequestedPin).toBeNull();
    expect(rejected.geography.sellerPin).toBe('560037');

    const normalized = normalizeOndcOnSearchRecord(record(), { requestedPin: '56' });
    expect(normalized.ok).toBe(false);
    if (!normalized.ok) expect(normalized.reason).toBe('invalid_buyer_pin');

    const accepted = classifyOndcBuyerSellerGeography({
      buyerRequestedPin: '560048',
      sellerPin: '560048',
      sellerCity: 'NotADropdownTown',
      dropdownCity: 'Mumbai',
      dropdownState: 'Maharashtra',
      dropdownTown: 'Imaginary Town',
    });
    expect(accepted.ok).toBe(true);
    if (!accepted.ok) return;
    expect(accepted.geography.buyerPinStatus).toBe('ACCEPTED');
    expect(accepted.geography.match).toBe(OndcGeographyMatch.EXACT_PIN);
    expect(accepted.geography.buyerRequestedPin).toBe('560048');
    expect(accepted.geography.dropdownUsed).toBe(false);
  });

  it('uses PROVIDER_AREA or UNKNOWN when seller geography is not an exact PIN', () => {
    const area = classifyOndcBuyerSellerGeography({
      buyerRequestedPin: '560048',
      sellerCity: 'Bengaluru',
      sellerLocality: 'Indiranagar',
    });
    expect(area.ok && area.geography.match).toBe(OndcGeographyMatch.PROVIDER_AREA);
    expect(area.ok && area.geography.sellerPin).toBeNull();

    const missing = classifyOndcBuyerSellerGeography({ buyerRequestedPin: '560048' });
    expect(missing.ok && missing.geography.match).toBe(OndcGeographyMatch.UNKNOWN);
    expect(missing.ok && missing.geography.sellerPin).toBeNull();

    const locality = classifyOndcBuyerSellerGeography({
      buyerRequestedPin: '560048',
      requestedLocality: 'Indiranagar',
      sellerLocality: 'indiranagar',
    });
    expect(locality.ok && locality.geography.match).toBe(OndcGeographyMatch.SAME_LOCALITY);

    const pinWins = classifyOndcBuyerSellerGeography({
      buyerRequestedPin: '560048',
      sellerPin: '560037',
      requestedLocality: 'Indiranagar',
      sellerLocality: 'Indiranagar',
      dropdownCity: 'Bengaluru',
    });
    expect(pinWins.ok && pinWins.geography.match).toBe(OndcGeographyMatch.OUT_OF_AREA);
  });

  it('keeps the verified category allow-list and ignores titles, domains, and injected taxonomy', () => {
    for (const code of TEXTILE_CODES) {
      const mapping = mapOndcDiscoveryCategory({
        otpCategory: 'shirt camera textile',
        subcategoryCode: code,
        ondcDomain: 'ONDC:SRV11',
        title: 'camera shirt',
        taxonomy: { subcategoryCode: 'cctv_surveillance', domain: 'ONDC:RET14' },
      });
      expect(mapping.supportStatus).toBe(OndcDiscoverySupportStatus.SUPPORTED);
      expect(mapping.ondcDomain).toBe('ONDC:RET12');
      expect(mapping.ondcCategory).toBeNull();
      expect(mapping.lifecycleCapability).toBe(OndcLifecycleCapability.DISCOVERY_ONLY);
      expect(mapping.lifecycleCapability).not.toBe(OndcLifecycleCapability.ORDER_CAPABLE);
      expect(mapping.mappingVersion).toBe(ONDC_CATEGORY_MAPPING_VERSION);
      expect(mapping.mappingSource).toBe(ONDC_CATEGORY_MAPPING_SOURCE);
    }

    const cctv = mapOndcDiscoveryCategory({
      subcategoryCode: 'cctv_surveillance',
      requirementMode: 'PRODUCT_MATERIAL',
      title: 'shirt',
      ondcDomain: 'ONDC:RET12',
    });
    expect(cctv.ondcDomain).toBe('ONDC:RET14');
    expect(cctv.supportStatus).toBe(OndcDiscoverySupportStatus.SUPPORTED);
    expect(cctv.lifecycleCapability).toBe(OndcLifecycleCapability.DISCOVERY_ONLY);

    const project = mapOndcDiscoveryCategory({
      subcategoryCode: 'cctv_surveillance',
      requirementMode: 'PROJECT_CONTRACT',
      ondcDomain: 'ONDC:RET14',
      taxonomy: { subcategoryCode: 'cotton_yarn' },
    });
    expect(project.supportStatus).toBe(OndcDiscoverySupportStatus.NOT_SUPPORTED);
    expect(project.ondcDomain).toBeNull();

    for (const subcategoryCode of ['paints_coatings', 'groceries', 'general_products', 'custom_requirement', '']) {
      const mapping = mapOndcDiscoveryCategory({
        otpCategory: subcategoryCode,
        subcategoryCode,
        title: 'Cotton Yarn camera CCTV shirt',
        ondcDomain: 'ONDC:RET12',
        taxonomy: { subcategoryCode: 'cotton_yarn', ondcDomain: 'ONDC:RET14' },
      });
      expect(mapping.supportStatus).toBe(OndcDiscoverySupportStatus.NOT_SUPPORTED);
      expect(mapping.ondcDomain).toBeNull();
    }

    const titleOnly = mapOndcDiscoveryCategory({
      otpCategory: 'Home CCTV & Surveillance',
      title: 'camera shirt',
      ondcDomain: 'ONDC:RET14',
    });
    expect(titleOnly.supportStatus).toBe(OndcDiscoverySupportStatus.NOT_SUPPORTED);
    expect(titleOnly.ondcDomain).toBeNull();

    const source = readFileSync(new URL('./ondc-category-mapping.ts', import.meta.url), 'utf8');
    expect(source).toContain('mapExplicitSubcategoryToOndcDomain');
    expect(source).not.toContain('mapCategoryToOndcDomain');
    expect(source).not.toContain('SRV11');
  });

  it('does not treat a phone, a flag, or a bad URI as network addressability', () => {
    expect(ONDC_REACHABILITY_PROVIDER_STATUS[OndcNetworkReachabilityState.NETWORK_ADDRESSABLE]).toBe(
      SupplierNetworkProviderOperationalStatus.REACHABLE,
    );
    expect(ONDC_REACHABILITY_PROVIDER_STATUS[OndcNetworkReachabilityState.ENDPOINT_MISSING]).toBe(
      SupplierNetworkProviderOperationalStatus.UNAVAILABLE,
    );
    expect(ONDC_REACHABILITY_PROVIDER_STATUS[OndcNetworkReachabilityState.ENDPOINT_INVALID]).toBe(
      SupplierNetworkProviderOperationalStatus.UNAVAILABLE,
    );
    expect(ONDC_REACHABILITY_PROVIDER_STATUS[OndcNetworkReachabilityState.NOT_SUPPORTED]).toBe(
      SupplierNetworkProviderOperationalStatus.NOT_IMPLEMENTED,
    );

    const missing = classifyOndcNetworkReachability({
      endpoint: '   ',
      phone: '9876543210',
      canReceiveRfq: true,
      provider: 'ONDC',
      supplierExists: true,
    });
    expect(missing.state).toBe(OndcNetworkReachabilityState.ENDPOINT_MISSING);
    expect(missing.networkAddressable).toBe(false);
    expect(missing.state).not.toBe('NETWORK_REACHABLE');
    expect(missing.providerStatus).toBe(SupplierNetworkProviderOperationalStatus.UNAVAILABLE);

    for (const endpoint of ['not a url', 'bpp://supplier', 'www.example.com', 'NETWORK', 'fake', 'synthetic', 'placeholder', 'example']) {
      const rejected = classifyOndcNetworkReachability({
        endpoint,
        phone: '9876543210',
        canReceiveRfq: true,
        provider: 'ONDC',
        supplierExists: true,
      });
      expect(rejected.state).toBe(OndcNetworkReachabilityState.ENDPOINT_INVALID);
      expect(rejected.networkAddressable).toBe(false);
      expect(rejected.state).not.toBe('NETWORK_REACHABLE');
    }
    expect(classifyOndcNetworkReachability({ endpoint: 'ftp://bpp.seller.in/ondc' }).state).toBe(
      OndcNetworkReachabilityState.ENDPOINT_INVALID,
    );
    expect(classifyOndcNetworkReachability({ endpoint: 'https://unknown-bpp/callback' }).state).toBe(
      OndcNetworkReachabilityState.ENDPOINT_INVALID,
    );
    for (const endpoint of [
      'https://fake/on_search',
      'https://synthetic/on_search',
      'https://placeholder/on_search',
      'https://example/on_search',
      'https://network/on_search',
    ]) {
      const placeholder = classifyOndcNetworkReachability({ endpoint });
      expect(placeholder.state).toBe(OndcNetworkReachabilityState.ENDPOINT_INVALID);
      expect(placeholder.networkAddressable).toBe(false);
      expect(placeholder.state).not.toBe('NETWORK_REACHABLE');
    }

    const foundationSource = readFileSync(new URL('./ondc-provider-foundation.ts', import.meta.url), 'utf8');
    const classificationSource = foundationSource.slice(
      foundationSource.indexOf('export function classifyOndcNetworkReachability'),
      foundationSource.indexOf('function usablePhone'),
    );
    expect(classificationSource).toContain('NETWORK_ADDRESSABLE');
    expect(classificationSource).not.toContain('NETWORK_REACHABLE');
    expect(classificationSource).not.toMatch(/\bfetch\s*\(/);
    expect(classificationSource).not.toMatch(/\b(?:dns|net|tls|https?)\.(?:lookup|resolve|connect|request|get)\b/);

    const originalFetch = globalThis.fetch;
    const fetchCalls: unknown[] = [];
    globalThis.fetch = ((...args: unknown[]) => {
      fetchCalls.push(args);
      throw new Error('classification must not perform network I/O');
    }) as typeof fetch;
    let addressable: ReturnType<typeof classifyOndcNetworkReachability>;
    try {
      addressable = classifyOndcNetworkReachability({
        endpoint: 'https://bpp.example/on_search',
        phone: '9876543210',
        canReceiveRfq: true,
        provider: 'ONDC',
        supplierExists: true,
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
    expect(fetchCalls).toHaveLength(0);
    expect(addressable.state).toBe(OndcNetworkReachabilityState.NETWORK_ADDRESSABLE);
    expect(addressable.state).toBe('NETWORK_ADDRESSABLE');
    expect(addressable.state).not.toBe('NETWORK_REACHABLE');
    expect(JSON.stringify(addressable)).not.toContain('NETWORK_REACHABLE');
    expect(addressable.networkAddressable).toBe(true);
    expect(addressable).not.toHaveProperty('networkReachable');

    const httpsLocal = classifyOndcNetworkReachability({
      endpoint: 'https://bpp.seller.in/ondc',
      phone: null,
      environment: OndcRuntimeEnvironment.LOCAL,
      source: OndcObservationSource.MOCK,
    });
    expect(httpsLocal.state).toBe(OndcNetworkReachabilityState.NETWORK_ADDRESSABLE);
    expect(httpsLocal.state).not.toBe('NETWORK_REACHABLE');
    expect(httpsLocal.providerStatus).toBe(SupplierNetworkProviderOperationalStatus.REACHABLE);

    const httpLocal = classifyOndcNetworkReachability({
      endpoint: 'http://bpp.seller.in/ondc',
      environment: OndcRuntimeEnvironment.CI,
      source: OndcObservationSource.LOCAL_FIXTURE,
    });
    expect(httpLocal.state).toBe(OndcNetworkReachabilityState.NETWORK_ADDRESSABLE);
    expect(httpLocal.networkAddressable).toBe(true);
    expect(httpLocal.state).not.toBe('NETWORK_REACHABLE');

    const syntheticReal = classifyOndcNetworkReachability({
      endpoint: 'https://bpp.example.test/ondc',
      environment: OndcRuntimeEnvironment.PRE_PROD,
      source: OndcObservationSource.REAL_NETWORK,
      canReceiveRfq: true,
      phone: '9876543210',
    });
    expect(syntheticReal.state).toBe(OndcNetworkReachabilityState.ENDPOINT_INVALID);
    expect(syntheticReal.networkAddressable).toBe(false);
    expect(syntheticReal.endpointHost).toBe('bpp.example.test');

    expect(
      classifyOndcNetworkReachability({
        endpoint: 'http://127.0.0.1/ondc',
        environment: OndcRuntimeEnvironment.PRE_PROD,
        source: OndcObservationSource.REAL_NETWORK,
      }).state,
    ).toBe(OndcNetworkReachabilityState.ENDPOINT_INVALID);
    expect(
      classifyOndcNetworkReachability({
        endpoint: 'https://example.com/bpp',
        environment: OndcRuntimeEnvironment.PRODUCTION,
        source: OndcObservationSource.REAL_NETWORK,
      }).state,
    ).toBe(OndcNetworkReachabilityState.ENDPOINT_INVALID);
    expect(
      classifyOndcNetworkReachability({
        endpoint: 'https://localhost/on_search',
        environment: OndcRuntimeEnvironment.PRE_PROD,
        source: OndcObservationSource.REAL_NETWORK,
      }).state,
    ).toBe(OndcNetworkReachabilityState.ENDPOINT_INVALID);
    expect(
      classifyOndcNetworkReachability({
        endpoint: 'https://bpp.example.org/on_search',
        environment: OndcRuntimeEnvironment.PRODUCTION,
        source: OndcObservationSource.REAL_NETWORK,
      }).state,
    ).toBe(OndcNetworkReachabilityState.ENDPOINT_INVALID);
    expect(
      classifyOndcNetworkReachability({
        endpoint: 'https://bpp.example.invalid/on_search',
        environment: OndcRuntimeEnvironment.PRODUCTION,
        source: OndcObservationSource.REAL_NETWORK,
      }).state,
    ).toBe(OndcNetworkReachabilityState.ENDPOINT_INVALID);

    const localMock = classifyOndcNetworkReachability({
      endpoint: 'https://bpp.example.test/ondc',
      environment: OndcRuntimeEnvironment.LOCAL,
      source: OndcObservationSource.MOCK,
    });
    expect(localMock.state).toBe(OndcNetworkReachabilityState.NETWORK_ADDRESSABLE);
    expect(localMock.state).not.toBe('NETWORK_REACHABLE');
    expect(localMock.networkAddressable).toBe(true);

    const noEndpoint = normalizeOndcOnSearchRecord(record({ endpoint: undefined, phone: '9876543210' }), {
      requestedPin: '560048',
      requestedSubcategoryCode: 'cotton_yarn',
    });
    expect(noEndpoint.ok).toBe(true);
    if (!noEndpoint.ok) return;
    expect(noEndpoint.candidate.providerStatus).toBe(SupplierNetworkProviderOperationalStatus.UNAVAILABLE);
    expect(noEndpoint.candidate.reachability.some((channel) => channel.kind === ProviderReachabilityKind.PHONE)).toBe(true);
    expect(noEndpoint.candidate.reachability.some((channel) => channel.kind === ProviderReachabilityKind.NETWORK)).toBe(false);
    expect(ondcDiscoveryRfqCapability().canReceiveRfq).toBe(false);
  });

  it('keeps Place IDs, display names, and seller ids on separate identities', () => {
    const placeId = 'ChIJnot-an-ondc-seller';
    expect(googlePlaceIdAsOndcProviderSupplierId(placeId)).toBeNull();
    expect(
      ondcIdentitySeparatesPlaceId({
        participantId: 'participant-scope-a',
        sellerId: placeId,
        locationId: 'location-scope-a',
        googlePlaceId: placeId,
      }),
    ).toBeNull();

    const left = { participantId: 'participant-scope-a', sellerId: 'seller-560048', locationId: 'loc-a' };
    const right = { participantId: 'participant-scope-a', sellerId: 'seller-560037', locationId: 'loc-b' };
    expect(ondcProviderIdentitiesStaySeparate(left, right)).toBe(true);
    const leftId = encodeOndcProviderSupplierId(left);
    const rightId = encodeOndcProviderSupplierId(right);
    expect(leftId).not.toBe(rightId);
    expect(providerIdentityKey(SupplierNetworkProviderKind.GOOGLE_PLACES, placeId)).not.toBe(
      providerIdentityKey(SupplierNetworkProviderKind.ONDC, leftId ?? ''),
    );

    const first = normalizeOndcOnSearchRecord(
      record({ sellerId: 'seller-560048', sellerName: 'Same Display Name', sellerPin: '560048' }),
      { requestedPin: '560048' },
    );
    const second = normalizeOndcOnSearchRecord(
      record({ sellerId: 'seller-560037', sellerName: 'Same Display Name', sellerPin: '560037' }),
      { requestedPin: '560048' },
    );
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(first.candidate.displayName).toBe(second.candidate.displayName);
    expect(first.candidate.providerSupplierId).not.toBe(second.candidate.providerSupplierId);
    expect(first.candidate.requestedPin).toBe('560048');
    expect(second.candidate.location?.pinCode).toBe('560037');
    expect(first.candidate.providerSupplierId).not.toContain(placeId);
  });

  it('does not treat discovery or reachability as verification or a quotation', () => {
    const trust = ondcDiscoveryTrustClaims();
    expect(trust.stage).toBe('DISCOVERED');
    expect(trust.otpRegistered).toBe(false);
    expect(trust.otpVerified).toBe(false);
    expect(trust.gstVerified).toBe(false);
    expect(trust.quotation).toBe(false);
    expect(trust.reachabilityIsTrust).toBe(false);

    const normalized = normalizeOndcOnSearchRecord(record(), {
      requestedPin: '560048',
      requestedSubcategoryCode: 'cotton_yarn',
    });
    expect(normalized.ok).toBe(true);
    if (!normalized.ok) return;
    expect(normalized.candidate.registered).toBe(false);
    expect(normalized.candidate.otpVerified).toBe(false);
    expect(normalized.candidate.gstVerified).toBe(false);
    expect(normalized.candidate.discoveryOnly).toBe(true);
    expect(normalized.candidate.integrationStatus).toBe(SupplierNetworkProviderOperationalStatus.CREDENTIAL_GATED);
    expect(normalized.candidate.categoryMapping.lifecycleCapability).toBe('DISCOVERY_ONLY');

    const store = createOndcDiscoveryStore();
    const saved = retainOndcDiscoveryObservation(store, normalized.candidate, {
      source: OndcObservationSource.MOCK,
      environment: OndcRuntimeEnvironment.LOCAL,
    });
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    expect(saved.retained.correlation.quotation).toBe(false);
    expect(saved.retained.correlation.otpVerified).toBe(false);
    expect(saved.retained.correlation.gstVerified).toBe(false);
    expect(saved.retained.correlation.reachabilityIsTrust).toBe(false);
    expect(saved.retained.correlation.source).toBe(OndcObservationSource.MOCK);
    expect(saved.retained.correlation.buyerRequestedPin).toBe('560048');
    expect(saved.retained.correlation.sellerPin).toBe('560037');
    expect(saved.retained.correlation.geographyMatch).toBe(OndcGeographyMatch.OUT_OF_AREA);
    expect(saved.retained.correlation.otpCategory).toBe('cotton_yarn');
    expect(saved.retained.correlation.ondcDomain).toBe('ONDC:RET12');
    expect(saved.retained.correlation.provider).toBe('ONDC');
    expect(saved.retained.correlation.participantId).toBe('participant-scope-a');
    expect(saved.retained.correlation.messageId).toBe('msg-scope-a');
    expect(saved.retained.correlation.transactionId).toBe('tx-scope-a');
    expect(saved.retained.correlation.endpointHost).toBe('bpp.example.test');
    expect(saved.retained.correlation.networkAddressable).toBe(true);
    expect(saved.retained.correlation.reachabilityState).toBe(OndcNetworkReachabilityState.NETWORK_ADDRESSABLE);
    expect(saved.retained.correlation.reachabilityState).not.toBe('NETWORK_REACHABLE');
    expect(saved.retained.correlation).not.toHaveProperty('networkReachable');
    expect(saved.retained.quoteCreated).toBe(false);
    expect(JSON.stringify(saved.retained.correlation)).not.toMatch(/signing|private key|BEGIN /i);
    expect(JSON.stringify(toOndcDiscoveryBuyerView(saved.retained))).not.toContain('bpp.example.test');
    expect(JSON.stringify(toOndcDiscoveryBuyerView(saved.retained))).not.toContain('participant-scope-a');
    expect(store.quotes).toHaveLength(0);
  });

  it('keeps pre-prod credentials from activating production and mock rows from becoming real', () => {
    const preprodOnly = resolveOndcEnvironmentGate({
      environmentRaw: 'PRODUCTION',
      productionEnabled: 'true',
      preprod: slot('preprod'),
      production: {},
    });
    expect(preprodOnly.realClientAllowed).toBe(false);
    expect(preprodOnly.productionActivationSatisfied).toBe(false);
    expect(preprodOnly.credentialSlot).toBe('NONE');
    expect(preprodOnly.client).toBeUndefined();

    const preprodReady = resolveOndcEnvironmentGate({
      environmentRaw: 'PRE_PROD',
      productionEnabled: 'true',
      preprod: slot('preprod'),
      production: slot('production'),
    });
    expect(preprodReady.environment).toBe(OndcRuntimeEnvironment.PRE_PROD);
    expect(preprodReady.productionActivationSatisfied).toBe(false);
    expect(preprodReady.credentialSlot).toBe('PRE_PROD');
    expect(preprodReady.client?.subscriberId).toBe('preprod-subscriber');
    expect(preprodReady.client?.subscriberId).not.toBe('production-subscriber');

    const normalized = normalizeOndcOnSearchRecord(record(), { requestedPin: '560048' });
    expect(normalized.ok).toBe(true);
    if (!normalized.ok) return;
    const store = createOndcDiscoveryStore();
    expect(
      retainOndcDiscoveryObservation(store, normalized.candidate, {
        source: OndcObservationSource.LOCAL_FIXTURE,
        environment: OndcRuntimeEnvironment.PRE_PROD,
      }).ok,
    ).toBe(false);
    expect(
      retainOndcDiscoveryObservation(store, normalized.candidate, {
        source: OndcObservationSource.REAL_NETWORK,
        environment: OndcRuntimeEnvironment.LOCAL,
      }),
    ).toMatchObject({ ok: false, reason: 'rejected_provenance' });
    expect(
      retainOndcDiscoveryObservation(store, normalized.candidate, {
        source: OndcObservationSource.MOCK,
        environment: OndcRuntimeEnvironment.PRODUCTION,
        productionActivated: true,
      }),
    ).toMatchObject({ ok: false, reason: 'rejected_provenance' });

    const realSynthetic = retainOndcDiscoveryObservation(store, normalized.candidate, {
      source: OndcObservationSource.REAL_NETWORK,
      environment: OndcRuntimeEnvironment.PRE_PROD,
    });
    expect(realSynthetic.ok).toBe(true);
    if (!realSynthetic.ok) return;
    expect(realSynthetic.retained.correlation.source).toBe(OndcObservationSource.REAL_NETWORK);
    expect(realSynthetic.retained.correlation.reachabilityState).toBe(OndcNetworkReachabilityState.ENDPOINT_INVALID);
    expect(realSynthetic.retained.correlation.networkAddressable).toBe(false);
    expect(realSynthetic.retained.correlation.reachabilityState).not.toBe('NETWORK_REACHABLE');
    expect(realSynthetic.retained.bppUri).toBeNull();
    expect(realSynthetic.retained.correlation.endpointHost).toBe('bpp.example.test');
    expect(realSynthetic.retained.environment).not.toBe(OndcRuntimeEnvironment.PRODUCTION);
  });

  it('still fail-closes a callback that has no signature', () => {
    expect(
      admitOndcOnSearchCallback({
        authorizationHeader: '',
        publicKeyConfigured: true,
        signatureValid: true,
        payload: { context: { action: 'on_search', transaction_id: 'tx', message_id: 'msg' }, message: {} },
        knownTransactionIds: ['tx'],
        seenMessageKeys: [],
      }),
    ).toEqual({ ok: false, reason: 'missing_signature' });
  });
});
