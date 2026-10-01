import { describe, expect, it } from 'vitest';
import { assertIdentityProtectedPayloadSafe } from '@otp/domain';
import { ManagedSupplierNetworkService } from '../services/managed-supplier-network-service';
import { InMemoryLocationPinCoverageStore } from './location-pin-coverage-store';
import { observeRfqInvitationDispatch, evaluateGooglePlacesQuality } from './google-places-quality-gate';
import { PLACES_SEARCH_TEXT_FIELD_MASK } from '../gis/google-places-discovery-adapter';
import { isSuperAdminProfile, resolveForceRefreshAuthorization } from './location-pin-coverage-request-auth';
import {
  buyerMaySeeSupplierContact,
  coveragePhoneVisibleToViewer,
  redactOperationalPhone,
} from './supplier-phone-visibility';
import type { PersistedCoverageSupplier } from './location-pin-coverage-store';

const PHONE = '918041239999';
const PLACE_ID = 'ChIJ_secretplace99';

const scope = {
  state: 'Karnataka',
  city: 'Bengaluru',
  pincode: '560048',
  category: 'Painting & Waterproofing',
  discoveryContext: 'SUPERADMIN_PREPARE' as const,
};

function row(partial: Partial<PersistedCoverageSupplier> & Pick<PersistedCoverageSupplier, 'placeId' | 'businessName'>): PersistedCoverageSupplier {
  return {
    verificationStage: 'DISCOVERED_IN_AREA',
    provenanceProviders: ['GOOGLE_PLACES'],
    locations: [
      {
        pincode: '560048',
        city: 'Bengaluru',
        state: 'Karnataka',
        isPrimary: true,
        addressLine: 'Hoodi, Bengaluru',
      },
    ],
    categories: [{ categoryName: 'Painting & Waterproofing', isPrimary: true, confidenceScore: 75 }],
    observationsCount: 1,
    isOtpRegistered: false,
    isGstVerified: false,
    complianceStandards: [],
    ...partial,
  };
}

async function seededManager(suppliers: PersistedCoverageSupplier[]) {
  const store = new InMemoryLocationPinCoverageStore();
  await store.upsertSuppliers(scope, suppliers);
  const manager = new ManagedSupplierNetworkService(undefined, undefined, undefined, undefined, {
    allowLegacyMockDiscovery: false,
    coverageStore: store,
  });
  return manager;
}

describe('GAP-01 supplier phone propagation and buyer visibility', () => {
  it('propagates the persisted phone onto the admin coverage report and in-memory entity', async () => {
    const manager = await seededManager([
      row({
        placeId: PLACE_ID,
        businessName: 'Hoodi Waterproofing',
        phone: PHONE,
        locations: [
          {
            pincode: '560048',
            city: 'Bengaluru',
            state: 'Karnataka',
            isPrimary: true,
            phone: PHONE,
          },
        ],
      }),
    ]);

    const admin = await manager.checkLocationCoverage(scope);
    expect(admin.externalCallsExecuted).toBe(0);
    expect(admin.report.suppliers).toHaveLength(1);
    expect(admin.report.suppliers[0]?.contactPhone).toBe(PHONE);
    expect(admin.report.suppliers[0]?.contactPhone).not.toBe('Phone on File');
    expect(admin.report.suppliers[0]?.verificationStage).toBe('DISCOVERED_IN_AREA');
    expect(admin.report.suppliers[0]?.isOtpRegistered).toBe(false);

    const internal = manager.generateCoverageReport(scope);
    expect(internal.suppliers[0]?.contactPhone).toBe(PHONE);
  });

  it('leaves contactPhone empty when the persisted row has no phone and does not fabricate one', async () => {
    const manager = await seededManager([
      row({ placeId: 'ChIJ_nophone', businessName: 'No Phone Painters' }),
    ]);
    const admin = await manager.checkLocationCoverage(scope);
    expect(admin.report.suppliers[0]?.contactPhone).toBe('');
    expect(JSON.stringify(admin.report.suppliers[0])).not.toContain('Phone on File');
    expect(JSON.stringify(admin.report)).not.toContain(PHONE);
  });

  it('hides supplier phone, place id, and provider phone fields from the buyer RFQ roster', async () => {
    const manager = await seededManager([
      row({
        placeId: PLACE_ID,
        businessName: 'Hoodi Waterproofing',
        phone: PHONE,
        googleMapsUri: 'https://maps.google.com/?cid=secretplace',
        locations: [
          {
            pincode: '560048',
            city: 'Bengaluru',
            state: 'Karnataka',
            isPrimary: true,
            phone: PHONE,
            nationalPhoneNumber: '08041239999',
          },
        ],
      }),
    ]);
    await manager.checkLocationCoverage(scope);

    const buyer = await manager.discoverForBuyerRfq(scope);
    expect(buyer.externalCallsUsed).toBe(0);
    expect(buyer.reusedExistingNetwork).toBe(true);
    const payload = JSON.stringify(buyer.suppliers);
    expect(payload).not.toContain(PHONE);
    expect(payload).not.toContain(PLACE_ID);
    expect(payload).not.toContain('contactPhone');
    expect(payload).not.toContain('nationalPhoneNumber');
    expect(payload).not.toContain('internationalPhoneNumber');
    expect(payload).not.toContain('supplierPhone');
    expect(payload).not.toContain('googleMapsUri');
    expect(buyer.suppliers[0]?.businessName).toBe('Hoodi Waterproofing');

    const protectedQuote = {
      quoteId: 'q-1',
      anonymousLabel: 'Supplier #01',
      totalCost: 120000,
    };
    expect(() => assertIdentityProtectedPayloadSafe(protectedQuote)).not.toThrow();
    expect(() =>
      assertIdentityProtectedPayloadSafe({ ...protectedQuote, contact_phone: PHONE }),
    ).toThrow();
    expect(() =>
      assertIdentityProtectedPayloadSafe({ ...protectedQuote, contactPhone: PHONE }),
    ).toThrow();
  });

  it('treats an invitation row as not a buyer phone disclosure and not a message send', () => {
    const dispatch = observeRfqInvitationDispatch({
      invitationRowCreated: true,
      messagingHttpAttempted: false,
    });
    expect(dispatch.invitation).toBe('CREATED');
    expect(dispatch.rfqSent).toBe(false);
    expect(dispatch.dispatch).toBe('NOT_ATTEMPTED');
  });

  it('exposes buyer contact only for the existing REVEALED contract, not closed lifecycle labels', () => {
    expect(buyerMaySeeSupplierContact('PROTECTED')).toBe(false);
    expect(buyerMaySeeSupplierContact('BLIND')).toBe(false);
    expect(buyerMaySeeSupplierContact('AWARDED')).toBe(false);
    expect(buyerMaySeeSupplierContact('SETTLED')).toBe(false);
    expect(buyerMaySeeSupplierContact('INVOICED')).toBe(false);
    expect(buyerMaySeeSupplierContact('COMPLETED')).toBe(false);
    expect(buyerMaySeeSupplierContact('STALLED')).toBe(false);
    expect(buyerMaySeeSupplierContact(null)).toBe(false);
    expect(buyerMaySeeSupplierContact('REVEALED')).toBe(true);
    expect(coveragePhoneVisibleToViewer({ isSuperAdmin: true })).toBe(true);
    expect(coveragePhoneVisibleToViewer({ isSuperAdmin: false })).toBe(false);

    const leaked = redactOperationalPhone({
      businessName: 'Hoodi Waterproofing',
      contactPhone: PHONE,
      phone: PHONE,
      nationalPhoneNumber: '08041239999',
      locations: [{ phone: PHONE, city: 'Bengaluru' }],
    });
    expect(leaked.businessName).toBe('Hoodi Waterproofing');
    expect(JSON.stringify(leaked)).not.toContain(PHONE);
    expect('contactPhone' in leaked).toBe(false);
  });

  it('keeps the Google search field mask and phone-required quality gate unchanged', () => {
    expect(PLACES_SEARCH_TEXT_FIELD_MASK).toContain('places.nationalPhoneNumber');
    expect(PLACES_SEARCH_TEXT_FIELD_MASK).toContain('places.internationalPhoneNumber');
    expect(PLACES_SEARCH_TEXT_FIELD_MASK).toContain('places.businessStatus');
    expect(PLACES_SEARCH_TEXT_FIELD_MASK).not.toContain('*');

    const dropped = evaluateGooglePlacesQuality({
      channel: 'GOOGLE_PLACES',
      displayName: 'No Phone',
      formattedAddress: 'Hoodi, Bengaluru 560048',
      lat: 12.97,
      lng: 77.71,
      placeId: PLACE_ID,
      googleMapsUri: 'https://maps.google.com/?cid=x',
      businessStatus: 'OPERATIONAL',
    });
    expect(dropped.storeDiscoveryIdentity).toBe(false);
    expect(dropped.reasons).toContain('missing_phone');
  });
});

const EXACT_SUPERADMIN_EMAILS = [
  'admin@otp.test',
  'bvnbasu@gmail.com',
  'ops@otp.test',
  'superadmin@otp.test',
  'admin@otp.ai',
  'ops@otp.ai',
  'admin@procureos.test',
  'founder@otp.test',
] as const;

function coveragePayloadForViewer<T>(viewer: { isSuperAdmin: boolean }, payload: T): T {
  return coveragePhoneVisibleToViewer(viewer) ? payload : redactOperationalPhone(payload);
}

describe('operational phone visibility predicate', () => {
  const buyerProfile = {
    is_founder: false,
    is_platform_admin: false,
    email: 'buyer@example.com',
  };

  it('keeps phone for a platform-admin flag and for an exact allowlist email', () => {
    const byFlag = isSuperAdminProfile({
      is_founder: false,
      is_platform_admin: true,
      email: 'buyer@example.com',
    });
    expect(byFlag).toBe(true);
    expect(coveragePhoneVisibleToViewer({ isSuperAdmin: byFlag })).toBe(true);
    const flagged = coveragePayloadForViewer(
      { isSuperAdmin: byFlag },
      { businessName: 'Hoodi Waterproofing', contactPhone: PHONE },
    );
    expect(flagged.contactPhone).toBe(PHONE);

    for (const email of EXACT_SUPERADMIN_EMAILS) {
      const byEmail = isSuperAdminProfile(
        { is_founder: false, is_platform_admin: false, email: email.toUpperCase() },
        'buyer@example.com',
      );
      expect(byEmail, email).toBe(true);
      expect(coveragePhoneVisibleToViewer({ isSuperAdmin: byEmail })).toBe(true);
    }

    const byJwtEmail = isSuperAdminProfile(
      { is_founder: false, is_platform_admin: false },
      '  ops@otp.test  ',
    );
    expect(byJwtEmail).toBe(true);
    const allowed = coveragePayloadForViewer(
      { isSuperAdmin: byJwtEmail },
      { businessName: 'Hoodi Waterproofing', contactPhone: PHONE },
    );
    expect(allowed.contactPhone).toBe(PHONE);
  });

  it('keeps phone for is_founder and still authorizes forceRefresh for that flag', () => {
    const founder = isSuperAdminProfile({
      is_founder: true,
      is_platform_admin: false,
      email: 'ordinary-founder-like@example.com',
    });
    expect(founder).toBe(true);
    expect(coveragePhoneVisibleToViewer({ isSuperAdmin: founder })).toBe(true);
    const visible = coveragePayloadForViewer(
      { isSuperAdmin: founder },
      { contactPhone: PHONE },
    );
    expect(visible.contactPhone).toBe(PHONE);
    expect(
      resolveForceRefreshAuthorization({
        requestedForceRefresh: true,
        isAuthenticated: true,
        isSuperAdmin: founder,
      }).ok,
    ).toBe(true);
  });

  it('hides phone from an ordinary authenticated buyer', () => {
    const buyer = isSuperAdminProfile(buyerProfile, 'buyer@example.com');
    expect(buyer).toBe(false);
    expect(coveragePhoneVisibleToViewer({ isSuperAdmin: buyer })).toBe(false);
    const hidden = coveragePayloadForViewer(
      { isSuperAdmin: buyer },
      { businessName: 'Hoodi Waterproofing', contactPhone: PHONE, phone: PHONE },
    );
    expect(JSON.stringify(hidden)).not.toContain(PHONE);
    expect('contactPhone' in hidden).toBe(false);
    expect('phone' in hidden).toBe(false);
  });

  it('omits phone when the viewer is unauthenticated', () => {
    expect(isSuperAdminProfile(null, null)).toBe(false);
    expect(isSuperAdminProfile(undefined, undefined)).toBe(false);
    const hidden = coveragePayloadForViewer(
      { isSuperAdmin: false },
      { businessName: 'Hoodi Waterproofing', contactPhone: PHONE },
    );
    expect(JSON.stringify(hidden)).not.toContain(PHONE);
    expect(hidden).not.toHaveProperty('contactPhone');
  });

  it('does not treat an email that merely contains founder as SuperAdmin', () => {
    const spoofed = isSuperAdminProfile(
      {
        is_founder: false,
        is_platform_admin: false,
        email: 'ordinary-founder-like@example.com',
      },
      'ordinary-founder-like@example.com',
    );
    expect(spoofed).toBe(false);
    expect(isSuperAdminProfile(null, 'thefounder@otp.test')).toBe(false);
    expect(isSuperAdminProfile(null, 'founder@otp.test.evil')).toBe(false);
    expect(isSuperAdminProfile(null, 'cofounder@example.com')).toBe(false);
    expect(isSuperAdminProfile({ is_founder: false, is_platform_admin: false }, 'founder@otp.test')).toBe(true);
    const hidden = coveragePayloadForViewer(
      { isSuperAdmin: spoofed },
      { contactPhone: PHONE, supplier_phone: PHONE },
    );
    expect(JSON.stringify(hidden)).not.toContain(PHONE);
  });

  it('does not consult a forged isAdmin or forceRefresh request body', () => {
    const forgedRequest = { isAdmin: true, forceRefresh: true };
    expect(isSuperAdminProfile(forgedRequest)).toBe(false);
    expect(isSuperAdminProfile({ ...buyerProfile, ...forgedRequest })).toBe(false);
    expect(
      coveragePhoneVisibleToViewer({ isSuperAdmin: false, ...forgedRequest }),
    ).toBe(false);
    const hidden = coveragePayloadForViewer(
      { isSuperAdmin: isSuperAdminProfile(forgedRequest) },
      { contactPhone: PHONE },
    );
    expect(hidden).not.toHaveProperty('contactPhone');
    expect(JSON.stringify(hidden)).not.toContain(PHONE);
  });

  it('strips every operational phone alias at every depth, and skips redaction when authorized', () => {
    const nested = {
      businessName: 'Hoodi Waterproofing',
      email: 'buyer@example.com',
      gstin: '29AAAAA0000A1Z5',
      phone: PHONE,
      contactPhone: PHONE,
      contact_phone: PHONE,
      supplierPhone: PHONE,
      supplier_phone: PHONE,
      supplierContactPhone: PHONE,
      contact_phone_number: PHONE,
      nationalPhoneNumber: PHONE,
      internationalPhoneNumber: PHONE,
      locations: [{ city: 'Bengaluru', phone: PHONE, supplier_phone: PHONE, contact_phone_number: PHONE }],
      report: {
        suppliers: [{ contactPhone: PHONE, locations: [{ phone: PHONE, nationalPhoneNumber: PHONE }] }],
      },
    };

    const redacted = redactOperationalPhone(nested);
    expect(redacted.businessName).toBe('Hoodi Waterproofing');
    expect(redacted.email).toBe('buyer@example.com');
    expect(redacted.gstin).toBe('29AAAAA0000A1Z5');
    expect(redacted.locations[0]?.city).toBe('Bengaluru');
    expect(JSON.stringify(redacted)).not.toContain(PHONE);
    for (const key of [
      'phone',
      'contactPhone',
      'contact_phone',
      'supplierPhone',
      'supplier_phone',
      'supplierContactPhone',
      'contact_phone_number',
      'nationalPhoneNumber',
      'internationalPhoneNumber',
    ]) {
      expect(redacted).not.toHaveProperty(key);
    }
    expect(redacted.locations[0]).not.toHaveProperty('phone');
    expect(redacted.locations[0]).not.toHaveProperty('supplier_phone');
    expect(redacted.locations[0]).not.toHaveProperty('contact_phone_number');
    expect(redacted.report.suppliers[0]).not.toHaveProperty('contactPhone');
    expect(redacted.report.suppliers[0]?.locations[0]).not.toHaveProperty('phone');

    const authorized = coveragePayloadForViewer({ isSuperAdmin: true }, nested);
    expect(authorized.contactPhone).toBe(PHONE);
    expect(authorized).toBe(nested);
  });
});
