import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  PLACES_SEARCH_TEXT_FIELD_MASK,
  selectGooglePlacesSearchPhone,
} from '../gis/google-places-discovery-adapter';
import {
  evaluateGooglePlacesQuality,
  extractSupplierPostalPin,
  isOperationalBusinessStatus,
  observeRfqInvitationDispatch,
} from './google-places-quality-gate';

const COMPLETE_GOOGLE = {
  channel: 'GOOGLE_PLACES' as const,
  displayName: 'Hoodi Switchgear',
  formattedAddress: '12 Industrial Road, Bengaluru 560048',
  phone: '+91 98765 43210',
  lat: 12.97,
  lng: 77.71,
  placeId: 'ChIJ_quality_ok',
  googleMapsUri: 'https://maps.google.com/?cid=quality',
  businessStatus: 'OPERATIONAL',
};

describe('Google Places quality gate', () => {
  it('accepts a phone-only Google row when every mandatory field is present and email stays null', () => {
    const decision = evaluateGooglePlacesQuality({ ...COMPLETE_GOOGLE, website: null, rating: null });
    expect(decision.rfqAddressable).toBe(true);
    expect(decision.invite).toBe(true);
    expect(decision.storeDiscoveryIdentity).toBe(true);
    expect(decision.reportRfqSent).toBe(false);
    expect(decision.email).toBeNull();
    expect(decision.website).toBeNull();
    expect(decision.rating).toBeNull();
    expect(decision.otpRegistered).toBe(false);
    expect(decision.otpVerified).toBe(false);
    expect(decision.verificationStage).toBe('DISCOVERED_IN_AREA');
  });

  it('keeps website and rating only when explicitly present', () => {
    const decision = evaluateGooglePlacesQuality({
      ...COMPLETE_GOOGLE,
      website: ' https://shop.example ',
      rating: 4.2,
    });
    expect(decision.website).toBe('https://shop.example');
    expect(decision.rating).toBe(4.2);
    expect(decision.email).toBeNull();
  });

  it('rejects a fabricated or Google-inferred email and does not let it replace the phone gate', () => {
    const withPhone = evaluateGooglePlacesQuality({
      ...COMPLETE_GOOGLE,
      email: 'sales@shop.example.com',
      emailSource: 'GOOGLE_OR_INFERRED',
      website: 'https://shop.example.com',
    });
    expect(withPhone.fabricatedEmailRejected).toBe(true);
    expect(withPhone.email).toBeNull();
    expect(withPhone.rfqAddressable).toBe(true);

    const emailInsteadOfPhone = evaluateGooglePlacesQuality({
      ...COMPLETE_GOOGLE,
      phone: null,
      email: 'sales@shop.example.com',
      website: 'https://shop.example.com',
    });
    expect(emailInsteadOfPhone.fabricatedEmailRejected).toBe(true);
    expect(emailInsteadOfPhone.email).toBeNull();
    expect(emailInsteadOfPhone.rfqAddressable).toBe(false);
    expect(emailInsteadOfPhone.invite).toBe(false);
    expect(emailInsteadOfPhone.reportRfqSent).toBe(false);
    expect(emailInsteadOfPhone.storeDiscoveryIdentity).toBe(false);
    expect(emailInsteadOfPhone.reasons).toContain('missing_phone');
  });

  it('rejects a Google row from SNE when phone is missing', () => {
    const decision = evaluateGooglePlacesQuality({ ...COMPLETE_GOOGLE, phone: '   ' });
    expect(decision.storeDiscoveryIdentity).toBe(false);
    expect(decision.rfqAddressable).toBe(false);
    expect(decision.invite).toBe(false);
    expect(decision.reportRfqSent).toBe(false);
    expect(decision.reasons).toContain('missing_phone');
  });

  it('rejects each missing mandatory Google field from SNE and allows absent website, rating, and email', () => {
    const cases: Array<[string, Partial<typeof COMPLETE_GOOGLE>]> = [
      ['missing_display_name', { displayName: '' }],
      ['missing_formatted_address', { formattedAddress: '' }],
      ['missing_phone', { phone: null }],
      ['missing_lat', { lat: null }],
      ['missing_lng', { lng: null }],
      ['missing_place_id', { placeId: '' }],
      ['missing_google_maps_uri', { googleMapsUri: '' }],
      ['missing_business_status', { businessStatus: null }],
    ];
    for (const [reason, patch] of cases) {
      const decision = evaluateGooglePlacesQuality({ ...COMPLETE_GOOGLE, ...patch });
      expect(decision.storeDiscoveryIdentity).toBe(false);
      expect(decision.rfqAddressable).toBe(false);
      expect(decision.invite).toBe(false);
      expect(decision.reasons).toContain(reason);
    }
    const closed = evaluateGooglePlacesQuality({ ...COMPLETE_GOOGLE, businessStatus: 'CLOSED_TEMPORARILY' });
    expect(closed.storeDiscoveryIdentity).toBe(false);
    expect(closed.reasons).toContain('business_not_operational');
  });

  it('does not treat missing or closed business status as operational', () => {
    expect(isOperationalBusinessStatus(null)).toBe(false);
    expect(isOperationalBusinessStatus('CLOSED_PERMANENTLY')).toBe(false);
    expect(isOperationalBusinessStatus('CLOSED_TEMPORARILY')).toBe(false);
    expect(evaluateGooglePlacesQuality({ ...COMPLETE_GOOGLE, businessStatus: null }).rfqAddressable).toBe(false);
    expect(evaluateGooglePlacesQuality({ ...COMPLETE_GOOGLE, businessStatus: 'CLOSED_PERMANENTLY' }).reasons).toContain(
      'business_not_operational',
    );
    expect(evaluateGooglePlacesQuality({ ...COMPLETE_GOOGLE, businessStatus: 'CLOSED_TEMPORARILY' }).rfqAddressable).toBe(
      false,
    );
  });

  it('addressable email-only contact is limited to an explicit non-Google approved field', () => {
    const approved = evaluateGooglePlacesQuality({
      channel: 'NON_GOOGLE',
      displayName: 'Registry Metals',
      email: 'desk@registry.example',
      emailSource: 'APPROVED_NON_GOOGLE',
    });
    expect(approved.rfqAddressable).toBe(true);
    expect(approved.email).toBe('desk@registry.example');
    expect(approved.phone).toBeNull();

    const guessed = evaluateGooglePlacesQuality({
      channel: 'NON_GOOGLE',
      displayName: 'Registry Metals',
      email: 'desk@registry.example',
      emailSource: 'GOOGLE_OR_INFERRED',
      website: 'https://registry.example',
    });
    expect(guessed.fabricatedEmailRejected).toBe(true);
    expect(guessed.email).toBeNull();
    expect(guessed.rfqAddressable).toBe(false);
  });

  it('does not register or verify from Place ID alone', () => {
    const decision = evaluateGooglePlacesQuality({
      channel: 'GOOGLE_PLACES',
      placeId: 'ChIJ_only',
    });
    expect(decision.otpRegistered).toBe(false);
    expect(decision.otpVerified).toBe(false);
    expect(decision.verificationStage).toBe('DISCOVERED_IN_AREA');
    expect(decision.rfqAddressable).toBe(false);
    expect(decision.storeDiscoveryIdentity).toBe(false);
    expect(decision.invite).toBe(false);
  });

  it('keeps supplier postal PIN distinct from a discovery PIN that is not in the address', () => {
    expect(extractSupplierPostalPin('Shop 4, Industrial Estate, Mumbai 400001')).toBe('400001');
    expect(extractSupplierPostalPin('No postal code listed')).toBeNull();
    const decision = evaluateGooglePlacesQuality({
      ...COMPLETE_GOOGLE,
      formattedAddress: 'Shop 4, Industrial Estate, Mumbai 400001',
    });
    expect(decision.supplierPostalPincode).toBe('400001');
    expect(decision.supplierPostalPincode).not.toBe('560048');
  });
});

describe('searchText phone acquisition', () => {
  it('requests phone and businessStatus on the existing searchText mask without a star', () => {
    expect(PLACES_SEARCH_TEXT_FIELD_MASK).toContain('places.nationalPhoneNumber');
    expect(PLACES_SEARCH_TEXT_FIELD_MASK).toContain('places.internationalPhoneNumber');
    expect(PLACES_SEARCH_TEXT_FIELD_MASK).toContain('places.businessStatus');
    expect(PLACES_SEARCH_TEXT_FIELD_MASK).not.toContain('*');
    expect(PLACES_SEARCH_TEXT_FIELD_MASK.split(',').every((part) => part.startsWith('places.'))).toBe(true);
  });

  it('normalizes Indian phone punctuation and does not invent digits', () => {
    expect(selectGooglePlacesSearchPhone('080 4123 4567', '+91 80 4123 4567')).toBe('918041234567');
    expect(selectGooglePlacesSearchPhone('98765 43210', '   ')).toBe('9876543210');
    expect(selectGooglePlacesSearchPhone('123', '12-34')).toBeUndefined();
    expect(selectGooglePlacesSearchPhone(null, null)).toBeUndefined();
  });
});

describe('invitation is not an RFQ send', () => {
  it('keeps invitation and dispatch distinct', () => {
    expect(
      observeRfqInvitationDispatch({ invitationRowCreated: false, messagingHttpAttempted: false }),
    ).toEqual({ invitation: 'NOT_CREATED', dispatch: 'NOT_ATTEMPTED', rfqSent: false });
    expect(
      observeRfqInvitationDispatch({ invitationRowCreated: true, messagingHttpAttempted: false }),
    ).toEqual({ invitation: 'CREATED', dispatch: 'NOT_ATTEMPTED', rfqSent: false });
    expect(
      observeRfqInvitationDispatch({
        invitationRowCreated: true,
        messagingHttpAttempted: true,
        messagingHttpSucceeded: false,
      }),
    ).toEqual({ invitation: 'CREATED', dispatch: 'FAILED', rfqSent: false });
    expect(
      observeRfqInvitationDispatch({
        invitationRowCreated: true,
        messagingHttpAttempted: true,
        messagingHttpSucceeded: true,
      }),
    ).toEqual({ invitation: 'CREATED', dispatch: 'ATTEMPTED', rfqSent: true });
  });
});

describe('00229 drop unreachable Google SNE rows', () => {
  const sql = readFileSync(
    resolve(__dirname, '../../../../supabase/migrations/00229_google_places_drop_unreachable_sne.sql'),
    'utf8',
  );
  const prior = readFileSync(
    resolve(__dirname, '../../../../supabase/migrations/00228_google_places_rfq_quality_gate.sql'),
    'utf8',
  );

  it('invites only after the quality predicate and does not send from SQL', () => {
    const invite = sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION public.discover_and_invite_for_rfq'));
    const gatePos = invite.indexOf('google_places_pin_coverage_rfq_addressable');
    const ensurePos = invite.indexOf('ensure_supplier_from_pin_coverage');
    expect(gatePos).toBeGreaterThan(-1);
    expect(ensurePos).toBeGreaterThan(gatePos);
    expect(sql).toContain('retire_unreachable_google_places_placeholder');
    expect(sql).toContain('pin_coverage_dropped');
    expect(sql).not.toContain('pin_coverage_stored_no_contact');
    expect(sql).toContain('private.rank_discovery_candidates');
    expect(sql).toContain('location_pin_coverage_assess(v_scope_key, 30)');
    expect(sql).toContain("s.status = 'ACTIVE'");
    expect(sql).not.toContain('dispatch_supplier_invitation_notification');
    expect(sql).not.toMatch(/lifecycle_state\s*=\s*'VERIFIED'/);
    expect(sql).not.toMatch(/->> 'email'/);
    expect(sql).not.toMatch(/contact_email/);
    expect(sql).not.toMatch(/X-Goog-FieldMask/);
    expect(sql).not.toContain("'*'");
    expect(prior).toContain('private.google_places_pin_coverage_rfq_addressable');
  });
});
