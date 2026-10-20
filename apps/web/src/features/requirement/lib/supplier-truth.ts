import type { MatchedSupplier } from '../types/discovery';

/** OTP platform registration — requires explicit match_reason, not GST alone. */
export function hasOtpRegistration(supplier: MatchedSupplier): boolean {
  if (supplier.otpRegistered === true) return true;
  return supplier.matchReasons.includes('otp_registered');
}

export function hasGstVerification(supplier: MatchedSupplier): boolean {
  return supplier.gstVerified === true || supplier.matchReasons.includes('gst_verified');
}

export function isGooglePlacesDiscovery(supplier: MatchedSupplier): boolean {
  return (
    supplier.network === 'GOOGLE_PLACES' ||
    supplier.matchReasons.includes('discovered_in_area') ||
    supplier.matchReasons.includes('pin_coverage')
  );
}

export function isDirectInvitation(supplier: MatchedSupplier): boolean {
  return supplier.network === 'DIRECT' || supplier.matchReasons.includes('direct_invite');
}

export type InvitationUiStatus =
  | 'CANDIDATE'
  | 'INVITED'
  | 'VIEWED'
  | 'QUOTED'
  | 'DECLINED';

export function normalizeInvitationStatus(status: string): InvitationUiStatus {
  const upper = status.toUpperCase();
  if (upper === 'QUOTED') return 'QUOTED';
  if (upper === 'DECLINED') return 'DECLINED';
  if (upper === 'VIEWED') return 'VIEWED';
  if (upper === 'INVITED') return 'INVITED';
  return 'CANDIDATE';
}

export function invitationStatusPresentation(supplier: MatchedSupplier): {
  label: string;
  detail: string | null;
  tone: 'neutral' | 'positive' | 'warning' | 'negative';
} {
  const state = normalizeInvitationStatus(supplier.status);
  switch (state) {
    case 'QUOTED':
      return { label: 'Responded — quote submitted', detail: null, tone: 'positive' };
    case 'DECLINED':
      return {
        label: 'Declined invitation',
        detail: supplier.declineReason?.trim() || null,
        tone: 'negative',
      };
    case 'VIEWED':
      return { label: 'Viewed invitation', detail: supplier.viewedAt ? null : null, tone: 'neutral' };
    case 'INVITED':
      return {
        label: supplier.invitedAt ? 'Invitation recorded' : 'Invitation pending confirmation',
        detail: null,
        tone: 'neutral',
      };
    default:
      return {
        label: 'Matched — not yet invited',
        detail: 'Selection does not send invitations until you broadcast or invite.',
        tone: 'warning',
      };
  }
}

/** Display order: OTP-registered & direct before area discovery candidates. */
export function discoveryDisplayRank(supplier: MatchedSupplier): number {
  if (hasOtpRegistration(supplier)) return 0;
  if (isDirectInvitation(supplier)) return 1;
  if (supplier.network === 'OTP_REGISTERED') return 2;
  if (isGooglePlacesDiscovery(supplier)) return 4;
  return 3;
}

export function sortSuppliersForDisplay(list: MatchedSupplier[]): MatchedSupplier[] {
  return [...list].sort((a, b) => {
    const rank = discoveryDisplayRank(a) - discoveryDisplayRank(b);
    if (rank !== 0) return rank;
    return (b.matchScore ?? 0) - (a.matchScore ?? 0);
  });
}
