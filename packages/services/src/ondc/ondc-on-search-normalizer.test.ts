import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { OndcCategorySupport, SupplierNetworkProviderKind, SupplierNetworkProviderOperationalStatus } from '@otp/domain';
import type { OndcCatalog, OndcPayload } from './types/ondc-beckn';
import { normalizeBecknOnSearchCatalog } from './ondc-on-search-normalizer';

const SCOPE = {
  requestedPin: '560048',
  requestedCategory: 'cotton yarn',
  requestedSubcategoryCode: 'cotton_yarn',
  requirementMode: 'PRODUCT_MATERIAL',
};

function payload(overrides?: {
  bppId?: string;
  bppUri?: string;
  action?: 'search' | 'on_search' | 'select';
  domain?: string;
  locations?: Array<Record<string, unknown>>;
  provider?: Record<string, unknown>;
  transactionId?: string;
  timestamp?: string;
}): OndcPayload<{ catalog?: OndcCatalog }> {
  const provider = {
    id: 'seller-foundation-a',
    descriptor: { name: 'Reported Seller A' },
    categories: [{ id: 'cotton', descriptor: { name: 'cotton yarn' } }],
    items: [{ id: 'item-foundation-a', descriptor: { name: 'Yarn' }, category_id: 'cotton' }],
    locations: overrides?.locations ?? [
      {
        id: 'location-foundation-a',
        gps: '12.97,77.71',
        address: {
          street: 'Industrial layout',
          locality: 'Mahadevapura',
          city: 'Bengaluru',
          state: 'Karnataka',
          country: 'IND',
          area_code: '560048',
        },
        city: { name: 'Bengaluru', code: 'std:080' },
      },
    ],
    ...overrides?.provider,
  };
  return {
    context: {
      domain: overrides?.domain ?? 'ONDC:RET12',
      country: 'IND',
      city: 'std:080',
      action: overrides?.action ?? 'on_search',
      core_version: '1.2.0',
      bap_id: 'bap.invalid',
      bap_uri: 'https://bap.invalid/ondc',
      bpp_id: overrides && 'bppId' in overrides ? overrides.bppId : 'participant-foundation-a',
      bpp_uri: overrides && 'bppUri' in overrides ? overrides.bppUri : 'https://bpp.invalid/on_search',
      transaction_id: overrides && 'transactionId' in overrides ? overrides.transactionId : 'tx-foundation-a',
      message_id: 'msg-foundation-a',
      timestamp: overrides && 'timestamp' in overrides ? overrides.timestamp : '2026-10-01T05:30:00.000Z',
    },
    message: {
      catalog: {
        id: 'catalogue-foundation-a',
        providers: [provider],
      },
    },
  } as unknown as OndcPayload<{ catalog?: OndcCatalog }>;
}

describe('Beckn on_search normalization', () => {
  it('does not import the fabricated receiver path or the title heuristic', () => {
    const source = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), 'ondc-on-search-normalizer.ts'),
      'utf8',
    );
    expect(source).not.toContain('ondc-bap-receiver');
    expect(source).not.toContain('mapCategoryToOndcDomain');
    expect(source).not.toContain('unknown-bpp');
    expect(source).not.toContain('ONDC Verified Supplier');
  });

  it('maps a reported catalog without inventing phone, PIN, rating, or a live status', () => {
    const [candidate] = normalizeBecknOnSearchCatalog(payload(), '2026-10-01T05:31:00.000Z', SCOPE);
    expect(candidate).toBeDefined();
    expect(candidate?.provider).toBe(SupplierNetworkProviderKind.ONDC);
    expect(candidate?.ondc.participantId).toBe('participant-foundation-a');
    expect(candidate?.ondc.participantId).not.toBe('bap.invalid');
    expect(candidate?.ondc.sellerId).toBe('seller-foundation-a');
    expect(candidate?.ondc.catalogueId).toBe('catalogue-foundation-a');
    expect(candidate?.ondc.itemIds).toEqual(['item-foundation-a']);
    expect(candidate?.ondc.providerSubcategory).toBe('cotton');
    expect(candidate?.requestedPin).toBe('560048');
    expect(candidate?.location?.pinCode).toBe('560048');
    expect(candidate?.location?.locality).toBe('Mahadevapura');
    expect(candidate?.location?.city).toBe('Bengaluru');
    expect(candidate?.location?.coordinates).toEqual({ lat: 12.97, lng: 77.71 });
    expect(candidate?.phone).toBeUndefined();
    expect(candidate?.integrationStatus).toBe(SupplierNetworkProviderOperationalStatus.CREDENTIAL_GATED);
    expect(candidate?.liveIntegrationCertified).toBe(false);
    expect(candidate?.providerStatus).not.toBe(SupplierNetworkProviderOperationalStatus.LIVE);
    expect(candidate?.categoryClassification.support).toBe(OndcCategorySupport.MAPPED);
    expect(candidate?.categoryClassification.allowListedDomain).toBe('ONDC:RET12');
    expect(candidate).not.toHaveProperty('rating');
    expect(candidate).not.toHaveProperty('placeId');
    expect(candidate?.provenance).toBe('ONDC_ON_SEARCH');
    expect(candidate?.correlationId).toBe('tx-foundation-a');
    expect(candidate?.otpSupplierId).toBeUndefined();
  });

  it('keeps a seller when coordinates are absent and does not copy the buyer city code or PIN', () => {
    const [candidate] = normalizeBecknOnSearchCatalog(
      payload({
        locations: [
          {
            id: 'location-foundation-a',
            address: { area_code: '641001', city: 'Coimbatore', state: 'Tamil Nadu' },
          },
        ],
      }),
      '2026-10-01T05:31:00.000Z',
      SCOPE,
    );
    expect(candidate?.location?.coordinates).toBeUndefined();
    expect(candidate?.requestedPin).toBe('560048');
    expect(candidate?.location?.pinCode).toBe('641001');
    expect(candidate?.location?.pinCode).not.toBe(candidate?.requestedPin);
    expect(candidate?.ondc.cityCode).toBeUndefined();
    expect(candidate?.ondc.country).toBeUndefined();
    expect(candidate?.location?.city).toBe('Coimbatore');
  });

  it('leaves seller geography missing when the provider omits it', () => {
    const [candidate] = normalizeBecknOnSearchCatalog(
      payload({ locations: [{ id: 'location-foundation-a' }] }),
      '2026-10-01T05:31:00.000Z',
      SCOPE,
    );
    expect(candidate).toBeDefined();
    expect(candidate?.requestedPin).toBe('560048');
    expect(candidate?.location).toBeUndefined();
    expect(candidate?.location?.pinCode).toBeUndefined();
    expect(candidate?.location?.coordinates).toBeUndefined();
    expect(candidate?.location?.city).toBeUndefined();
    expect(candidate?.location?.state).toBeUndefined();
  });

  it('does not fabricate a display name, rating, phone, or network endpoint', () => {
    const rated = normalizeBecknOnSearchCatalog(
      payload({ provider: { rating: '4.5' } }),
      '2026-10-01T05:31:00.000Z',
      SCOPE,
    );
    expect(rated[0]).not.toHaveProperty('rating');
    expect(JSON.stringify(rated[0])).not.toContain('4.5');
    expect(rated[0]?.displayName).toBe('Reported Seller A');

    const unnamed = normalizeBecknOnSearchCatalog(
      payload({ provider: { descriptor: {} } }),
      '2026-10-01T05:31:00.000Z',
      SCOPE,
    );
    expect(unnamed).toEqual([]);
    expect(JSON.stringify(unnamed)).not.toContain('ONDC Verified Supplier');

    const noEndpoint = normalizeBecknOnSearchCatalog(
      payload({ bppUri: undefined }),
      '2026-10-01T05:31:00.000Z',
      SCOPE,
    );
    expect(noEndpoint[0]?.ondc.endpoint).toBeUndefined();
    expect(noEndpoint[0]?.phone).toBeUndefined();
    expect(noEndpoint[0]?.reachability.some((channel) => channel.kind === 'NETWORK')).toBe(false);
    expect(noEndpoint[0]?.providerSupplierId).toBeTruthy();
  });

  it('marks an invalid domain unsupported and does not escape to SRV11', () => {
    const [invalid] = normalizeBecknOnSearchCatalog(
      payload({ domain: 'ONDC:SRV11' }),
      '2026-10-01T05:31:00.000Z',
      SCOPE,
    );
    expect(invalid?.ondc.domain).toBe('ONDC:SRV11');
    expect(invalid?.categoryClassification.support).toBe(OndcCategorySupport.NOT_SUPPORTED);
    expect(invalid?.categoryClassification.providerDomain).toBe('ONDC:SRV11');
    expect(invalid?.categoryClassification.allowListedDomain).toBe('ONDC:RET12');

    const [unmapped] = normalizeBecknOnSearchCatalog(
      payload({ domain: 'ONDC:RET12' }),
      '2026-10-01T05:31:00.000Z',
      { requestedPin: '560048', requestedCategory: 'Domestic RO Water Purifiers' },
    );
    expect(unmapped?.categoryClassification.support).toBe(OndcCategorySupport.UNMAPPED);
    expect(unmapped?.categoryClassification.allowListedDomain).toBeNull();
    expect(JSON.stringify(unmapped?.categoryClassification)).not.toContain('SRV11');
  });

  it('keeps a reported phone and ignores a missing one', () => {
    const [withPhone] = normalizeBecknOnSearchCatalog(
      payload({ provider: { contact: { phone: '9876543210', email: 'seller@example.com' } } }),
      '2026-10-01T05:31:00.000Z',
      SCOPE,
    );
    expect(withPhone?.phone).toBe('9876543210');
    expect(withPhone?.ondc.reportedEmail).toBe('seller@example.com');

    const [withoutPhone] = normalizeBecknOnSearchCatalog(payload(), '2026-10-01T05:31:00.000Z', SCOPE);
    expect(withoutPhone?.phone).toBeUndefined();
    expect(withoutPhone?.ondc.reportedEmail).toBeUndefined();
  });

  it('keeps two reported locations distinct and drops catalogs that are not on_search', () => {
    const candidates = normalizeBecknOnSearchCatalog(
      payload({
        locations: [
          { id: 'location-foundation-a', address: { area_code: '560048', city: 'Bengaluru' } },
          { id: 'location-foundation-b', address: { area_code: '641001', city: 'Coimbatore' } },
        ],
      }),
      '2026-10-01T05:31:00.000Z',
      SCOPE,
    );
    expect(candidates).toHaveLength(2);
    expect(candidates[0]?.providerSupplierId).not.toBe(candidates[1]?.providerSupplierId);
    expect(candidates[0]?.requestedPin).toBe('560048');
    expect(candidates[1]?.requestedPin).toBe('560048');
    expect(candidates[0]?.location?.pinCode).toBe('560048');
    expect(candidates[1]?.location?.pinCode).toBe('641001');

    expect(normalizeBecknOnSearchCatalog(payload({ bppId: undefined }), '2026-10-01T05:31:00.000Z')).toEqual([]);
    expect(normalizeBecknOnSearchCatalog(payload({ bppId: 'unknown-bpp' }), '2026-10-01T05:31:00.000Z')).toEqual([]);
    expect(normalizeBecknOnSearchCatalog(payload({ action: 'search' }), '2026-10-01T05:31:00.000Z')).toEqual([]);
    expect(normalizeBecknOnSearchCatalog(payload({ action: 'select' }), '2026-10-01T05:31:00.000Z')).toEqual([]);
    expect(normalizeBecknOnSearchCatalog(payload({ transactionId: undefined }), '2026-10-01T05:31:00.000Z')).toEqual([]);
    const [observed] = normalizeBecknOnSearchCatalog(
      payload({ timestamp: undefined }),
      '2026-10-01T05:31:00.000Z',
      SCOPE,
    );
    expect(observed?.discoveredAt).toBe('2026-10-01T05:31:00.000Z');
    expect(normalizeBecknOnSearchCatalog(payload({ timestamp: undefined }), '   ', SCOPE)).toEqual([]);
  });
});
