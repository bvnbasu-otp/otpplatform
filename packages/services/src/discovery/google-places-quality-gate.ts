/**
 * Deterministic Google Places quality gate for the coverage → RFQ bridge.
 *
 * RFQ-addressable (Google) only when ALL are present:
 * display name, formatted address, usable phone (>= 10 digits), lat, lng,
 * Place ID, Google Maps URI, and business status OPERATIONAL.
 *
 * Business-status rule:
 * - Missing status is NOT addressable.
 * - Only `OPERATIONAL` is addressable.
 * - `CLOSED_PERMANENTLY` is not addressable.
 * - `CLOSED_TEMPORARILY` is not operational, so it is not addressable.
 * - Any other value is not addressable.
 *
 * Phone and businessStatus are requested on the existing searchText field mask
 * (national/international phone + businessStatus). There is no `*` mask and no
 * Place Details fan-out. A Google row is an SNE candidate only when every
 * mandatory field is present. Missing phone, name, address, coordinates,
 * Place ID, Maps URI, or OPERATIONAL status is not stored and not invited.
 * This gate never reports RFQ sent; an invitation row is not a WhatsApp/SMS send.
 *
 * Email is never inferred from Google, a website, or a domain. It stays null
 * unless `emailSource` is `APPROVED_NON_GOOGLE` on a non-Google channel.
 * A Google row with only an email is not addressable (phone gate).
 * An email-only non-Google candidate with an explicit approved email is addressable.
 *
 * Place ID alone never sets OTP_REGISTERED or OTP_VERIFIED.
 */

export type GooglePlacesQualityChannel = 'GOOGLE_PLACES' | 'NON_GOOGLE';

export type GooglePlacesEmailSource = 'APPROVED_NON_GOOGLE' | 'GOOGLE_OR_INFERRED';

export interface GooglePlacesQualityInput {
  channel: GooglePlacesQualityChannel;
  displayName?: string | null;
  formattedAddress?: string | null;
  phone?: string | null;
  lat?: number | null;
  lng?: number | null;
  placeId?: string | null;
  googleMapsUri?: string | null;
  businessStatus?: string | null;
  website?: string | null;
  rating?: number | null;
  /** Never accepted for GOOGLE_PLACES. Non-Google requires emailSource APPROVED_NON_GOOGLE. */
  email?: string | null;
  emailSource?: GooglePlacesEmailSource | null;
}

export interface GooglePlacesQualityDecision {
  rfqAddressable: boolean;
  /** True only when the row may be persisted as an SNE candidate. */
  storeDiscoveryIdentity: boolean;
  invite: boolean;
  /** Always false here. A real send is observeRfqInvitationDispatch, not this gate. */
  reportRfqSent: boolean;
  email: string | null;
  website: string | null;
  rating: number | null;
  phone: string | null;
  supplierPostalPincode: string | null;
  reasons: string[];
  fabricatedEmailRejected: boolean;
  verificationStage: 'DISCOVERED_IN_AREA';
  otpRegistered: false;
  otpVerified: false;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function usablePhoneDigits(phone?: string | null): string {
  return (phone ?? '').replace(/\D/g, '');
}

export function isUsablePhone(phone?: string | null): boolean {
  return usablePhoneDigits(phone).length >= 10;
}

/** Supplier postal PIN parsed from a formatted address. Never copied from the discovery PIN. */
export function extractSupplierPostalPin(formattedAddress?: string | null): string | null {
  if (!formattedAddress) return null;
  const matches = formattedAddress.match(/\b([1-9][0-9]{5})\b/g);
  if (!matches || matches.length === 0) return null;
  return matches[matches.length - 1] ?? null;
}

export function isOperationalBusinessStatus(status?: string | null): boolean {
  return (status ?? '').trim().toUpperCase() === 'OPERATIONAL';
}

function cleanText(value?: string | null): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function optionalWebsite(value?: string | null): string | null {
  return cleanText(value);
}

function optionalRating(value?: number | null): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function mapsUriOk(value?: string | null): boolean {
  const uri = cleanText(value);
  if (!uri) return false;
  if (!/^https:\/\//i.test(uri)) return false;
  return /maps|google/i.test(uri);
}

function finiteCoord(value?: number | null): boolean {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * Google channel: email is always null. A non-empty email argument is a fabricated
 * or inferred address and is rejected (it cannot satisfy the phone gate).
 * Non-Google: email is set only for an explicit APPROVED_NON_GOOGLE source.
 */
function resolveEmail(input: GooglePlacesQualityInput): { email: string | null; fabricatedEmailRejected: boolean } {
  const raw = cleanText(input.email);
  if (input.channel === 'GOOGLE_PLACES') {
    return { email: null, fabricatedEmailRejected: Boolean(raw) };
  }
  if (!raw) {
    return { email: null, fabricatedEmailRejected: false };
  }
  if (input.emailSource !== 'APPROVED_NON_GOOGLE' || !EMAIL_RE.test(raw)) {
    return { email: null, fabricatedEmailRejected: true };
  }
  return { email: raw, fabricatedEmailRejected: false };
}

export function evaluateGooglePlacesQuality(input: GooglePlacesQualityInput): GooglePlacesQualityDecision {
  const emailDecision = resolveEmail(input);
  const website = optionalWebsite(input.website);
  const rating = optionalRating(input.rating);
  const phone = cleanText(input.phone);
  const supplierPostalPincode = extractSupplierPostalPin(input.formattedAddress);
  const reasons: string[] = [];
  if (emailDecision.fabricatedEmailRejected) {
    reasons.push('fabricated_email_rejected');
  }

  const base = {
    email: emailDecision.email,
    website,
    rating,
    phone,
    supplierPostalPincode,
    fabricatedEmailRejected: emailDecision.fabricatedEmailRejected,
    verificationStage: 'DISCOVERED_IN_AREA' as const,
    otpRegistered: false as const,
    otpVerified: false as const,
  };

  if (input.channel === 'NON_GOOGLE') {
    const name = cleanText(input.displayName);
    if (!name) reasons.push('missing_display_name');
    const phoneOk = isUsablePhone(phone);
    const emailOk = Boolean(emailDecision.email);
    if (!phoneOk && !emailOk) reasons.push('missing_contact_channel');
    const addressable = Boolean(name) && (phoneOk || emailOk);
    return {
      ...base,
      rfqAddressable: addressable,
      storeDiscoveryIdentity: Boolean(name),
      invite: addressable,
      reportRfqSent: false,
      reasons,
    };
  }

  const placeId = cleanText(input.placeId);
  if (!cleanText(input.displayName)) reasons.push('missing_display_name');
  if (!cleanText(input.formattedAddress)) reasons.push('missing_formatted_address');
  if (!isUsablePhone(phone)) reasons.push('missing_phone');
  if (!finiteCoord(input.lat)) reasons.push('missing_lat');
  if (!finiteCoord(input.lng)) reasons.push('missing_lng');
  if (!placeId) reasons.push('missing_place_id');
  if (!mapsUriOk(input.googleMapsUri)) reasons.push('missing_google_maps_uri');
  const status = cleanText(input.businessStatus);
  if (!status) reasons.push('missing_business_status');
  else if (!isOperationalBusinessStatus(status)) reasons.push('business_not_operational');

  const blocking = reasons.filter((r) => r !== 'fabricated_email_rejected');
  const addressable = blocking.length === 0;
  return {
    ...base,
    rfqAddressable: addressable,
    storeDiscoveryIdentity: addressable,
    invite: addressable,
    reportRfqSent: false,
    reasons,
  };
}

export type RfqInvitationDispatchState = 'NOT_ATTEMPTED' | 'ATTEMPTED' | 'FAILED';

export interface RfqInvitationDispatchObservation {
  invitation: 'CREATED' | 'NOT_CREATED';
  dispatch: RfqInvitationDispatchState;
  /** True only after a messaging HTTP attempt succeeded. An invitation row is never enough. */
  rfqSent: boolean;
}

/**
 * Maps the existing RFQ dispatch path.
 * `trg_dispatch_supplier_invitation_notification` calls
 * `private.dispatch_supplier_invitation_notification`, which returns without HTTP
 * when the supplier-network stub is on, the RFQ is demo, or the supplier has no
 * VERIFIED WhatsApp/SMS channel (NOT_ATTEMPTED). A pg_net POST to messaging-outbound
 * is ATTEMPTED. Provider misconfiguration or a failed HTTP result is FAILED.
 */
export function observeRfqInvitationDispatch(input: {
  invitationRowCreated: boolean;
  messagingHttpAttempted: boolean;
  messagingHttpSucceeded?: boolean;
}): RfqInvitationDispatchObservation {
  if (!input.invitationRowCreated) {
    return { invitation: 'NOT_CREATED', dispatch: 'NOT_ATTEMPTED', rfqSent: false };
  }
  if (!input.messagingHttpAttempted) {
    return { invitation: 'CREATED', dispatch: 'NOT_ATTEMPTED', rfqSent: false };
  }
  if (input.messagingHttpSucceeded === false) {
    return { invitation: 'CREATED', dispatch: 'FAILED', rfqSent: false };
  }
  if (input.messagingHttpSucceeded === true) {
    return { invitation: 'CREATED', dispatch: 'ATTEMPTED', rfqSent: true };
  }
  return { invitation: 'CREATED', dispatch: 'ATTEMPTED', rfqSent: false };
}
