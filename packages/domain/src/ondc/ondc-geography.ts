/**
 * Buyer requested PIN is the discovery geography authority.
 * State, city, and town dropdowns are not consulted.
 * Seller PIN is retained beside the buyer PIN and is never copied over it.
 * No proximity radius is approved for ONDC discovery, so this module has no NEARBY label.
 */

export const ONDC_APPROVED_PROXIMITY_RADIUS_KM = null;

const INDIAN_PIN = /^[1-9]\d{5}$/;

export const OndcGeographyMatch = {
  EXACT_PIN: 'EXACT_PIN',
  SAME_LOCALITY: 'SAME_LOCALITY',
  PROVIDER_AREA: 'PROVIDER_AREA',
  OUT_OF_AREA: 'OUT_OF_AREA',
  UNKNOWN: 'UNKNOWN',
} as const;

export type OndcGeographyMatch = (typeof OndcGeographyMatch)[keyof typeof OndcGeographyMatch];

export type OndcBuyerPinStatus = 'ACCEPTED' | 'MISSING' | 'REJECTED';

export interface OndcGeographyClassification {
  buyerRequestedPin: string | null;
  sellerPin: string | null;
  sellerLocality: string | null;
  sellerCity: string | null;
  sellerState: string | null;
  match: OndcGeographyMatch;
  buyerPinStatus: OndcBuyerPinStatus;
  dropdownUsed: false;
  /** Equal PIN strings are EXACT_PIN. That is not a claim that the seller sits inside the buyer PIN. */
  sellerClaimedInBuyerPin: false;
}

export type OndcGeographyResult =
  | { ok: true; geography: OndcGeographyClassification }
  | { ok: false; reason: 'invalid_buyer_pin'; geography: OndcGeographyClassification };

export function acceptBuyerRequestedPin(value?: string | null):
  | { ok: true; buyerRequestedPin: string | null }
  | { ok: false; reason: 'invalid_buyer_pin' } {
  const pin = clean(value);
  if (!pin) return { ok: true, buyerRequestedPin: null };
  if (!INDIAN_PIN.test(pin)) return { ok: false, reason: 'invalid_buyer_pin' };
  return { ok: true, buyerRequestedPin: pin };
}

/**
 * SAME_LOCALITY is only an explicit buyer locality string equal to the seller locality.
 * It is never derived from a dropdown, a PIN, or a radius.
 * A different valid seller PIN is OUT_OF_AREA even when the locality text matches.
 */
export function classifyOndcBuyerSellerGeography(input: {
  buyerRequestedPin?: string | null;
  sellerPin?: string | null;
  sellerLocality?: string | null;
  sellerCity?: string | null;
  sellerState?: string | null;
  requestedLocality?: string | null;
  dropdownCity?: string | null;
  dropdownState?: string | null;
  dropdownTown?: string | null;
}): OndcGeographyResult {
  void input.dropdownCity;
  void input.dropdownState;
  void input.dropdownTown;

  const pinGate = acceptBuyerRequestedPin(input.buyerRequestedPin);
  const sellerPin = clean(input.sellerPin);
  const sellerLocality = clean(input.sellerLocality);
  const sellerCity = clean(input.sellerCity);
  const sellerState = clean(input.sellerState);
  const base = {
    sellerPin,
    sellerLocality,
    sellerCity,
    sellerState,
    dropdownUsed: false as const,
    sellerClaimedInBuyerPin: false as const,
  };

  if (!pinGate.ok) {
    return {
      ok: false,
      reason: 'invalid_buyer_pin',
      geography: {
        ...base,
        buyerRequestedPin: null,
        match: sellerAreaOrUnknown(sellerLocality, sellerCity, sellerState),
        buyerPinStatus: 'REJECTED',
      },
    };
  }

  const buyerRequestedPin = pinGate.buyerRequestedPin;
  const sellerPinValid = sellerPin !== null && INDIAN_PIN.test(sellerPin);

  let match: OndcGeographyMatch;
  if (buyerRequestedPin && sellerPinValid && sellerPin === buyerRequestedPin) {
    match = OndcGeographyMatch.EXACT_PIN;
  } else if (buyerRequestedPin && sellerPinValid && sellerPin !== buyerRequestedPin) {
    match = OndcGeographyMatch.OUT_OF_AREA;
  } else if (localitiesMatch(input.requestedLocality, sellerLocality)) {
    match = OndcGeographyMatch.SAME_LOCALITY;
  } else {
    match = sellerAreaOrUnknown(sellerLocality, sellerCity, sellerState);
  }

  return {
    ok: true,
    geography: {
      ...base,
      buyerRequestedPin,
      match,
      buyerPinStatus: buyerRequestedPin ? 'ACCEPTED' : 'MISSING',
    },
  };
}

function sellerAreaOrUnknown(
  sellerLocality: string | null,
  sellerCity: string | null,
  sellerState: string | null,
): OndcGeographyMatch {
  if (sellerLocality || sellerCity || sellerState) return OndcGeographyMatch.PROVIDER_AREA;
  return OndcGeographyMatch.UNKNOWN;
}

function localitiesMatch(requestedLocality: string | null | undefined, sellerLocality: string | null): boolean {
  const buyer = normalizeLocality(requestedLocality);
  const seller = normalizeLocality(sellerLocality);
  return buyer !== null && seller !== null && buyer === seller;
}

function normalizeLocality(value?: string | null): string | null {
  const trimmed = clean(value);
  if (!trimmed) return null;
  return trimmed.toLowerCase().replace(/\s+/g, ' ');
}

function clean(value?: string | null): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
