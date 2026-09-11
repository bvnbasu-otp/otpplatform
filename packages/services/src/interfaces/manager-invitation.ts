import type { InviteStatus } from '@otp/domain';

export interface ManagerInvitation {
  invitationId: string;
  rfqId: string;
  anonymousLabel: string;
  status: InviteStatus;
  matchScore: number | null;
  matchReasons: string[] | null;
  invitedAt: string;
  viewedAt: string | null;
  declinedAt: string | null;
  supplierId: string | null;
}
