export function isInvitationRecipientMatch(
  invitation: { rfq_id?: unknown; supplier_id?: unknown } | null,
  requested: { rfqId: string; supplierId: string },
): boolean {
  return Boolean(
    invitation &&
    invitation.rfq_id === requested.rfqId &&
    invitation.supplier_id === requested.supplierId,
  );
}