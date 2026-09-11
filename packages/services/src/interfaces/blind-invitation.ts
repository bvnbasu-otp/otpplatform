import type { InviteStatus } from '@otp/domain';

export interface BlindInvitation {
  invitationId: string;
  rfqId: string;
  anonymousLabel: string;
  status: InviteStatus;
  invitedAt: string;
  viewedAt: string | null;
  declinedAt: string | null;
}
