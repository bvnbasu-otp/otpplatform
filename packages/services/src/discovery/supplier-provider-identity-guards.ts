import {
  ONDC_SUPPLIER_NETWORK_CONTRACT_STATUS,
  OndcIntegrationState,
  SupplierNetworkProviderKind,
  type ContactabilityClassification,
  type NormalizedProviderSupplierCandidate,
} from '@otp/domain';
import { evaluateGooglePlacesQuality, type GooglePlacesQualityInput } from './google-places-quality-gate.ts';

export { ONDC_SUPPLIER_NETWORK_CONTRACT_STATUS };

export function classifyGooglePlacesContactability(phone?: string | null): ContactabilityClassification {
  const normalized = phone?.replace(/\D/g, '') ?? '';
  if (normalized.length >= 10) {
    return 'CONTACTABLE';
  }
  return 'NO_CONTACT_CHANNEL';
}

export function assertGooglePlacesInviteEligible(
  input: Partial<GooglePlacesQualityInput> & { placeId?: string | null; phone?: string | null },
): { ok: true } | { ok: false; reason: string } {
  const decision = evaluateGooglePlacesQuality({
    channel: 'GOOGLE_PLACES',
    displayName: input.displayName,
    formattedAddress: input.formattedAddress,
    phone: input.phone,
    lat: input.lat,
    lng: input.lng,
    placeId: input.placeId,
    googleMapsUri: input.googleMapsUri,
    businessStatus: input.businessStatus,
    website: input.website,
    rating: input.rating,
    email: input.email,
    emailSource: input.emailSource,
  });
  if (!decision.rfqAddressable) {
    const reason = decision.reasons.find((r) => r !== 'fabricated_email_rejected') ?? decision.reasons[0] ?? 'not_addressable';
    return { ok: false, reason };
  }
  return { ok: true };
}

/** Mirrors private.insert_ondc_provider_identity_guarded — no row unless live success + ids. */
export function assertOndcProviderIdentityInsertAllowed(input: {
  integrationState: OndcIntegrationState;
  providerSupplierId?: string | null;
  providerParticipantId?: string | null;
  liveSuccess?: boolean;
}): { ok: true; candidate: NormalizedProviderSupplierCandidate } | { ok: false; reason: string } {
  if (!input.liveSuccess) {
    return { ok: false, reason: 'provider_not_live_or_no_seller' };
  }
  if (input.integrationState === OndcIntegrationState.NOT_CONFIGURED) {
    return { ok: false, reason: 'not_configured' };
  }
  if (!input.providerSupplierId?.trim()) {
    return { ok: false, reason: 'missing_seller_id' };
  }
  if (!input.providerParticipantId?.trim()) {
    return { ok: false, reason: 'missing_participant_id' };
  }
  return {
    ok: true,
    candidate: {
      provider: SupplierNetworkProviderKind.ONDC,
      providerSupplierId: input.providerSupplierId.trim(),
      providerParticipantId: input.providerParticipantId.trim(),
      displayName: 'ONDC seller',
    },
  };
}
