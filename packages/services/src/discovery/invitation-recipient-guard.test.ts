import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { isInvitationRecipientMatch } from './invitation-recipient-guard';

describe('invitation recipient guard', () => {
  const requested = { rfqId: 'rfq-target', supplierId: 'supplier-target' };

  it('accepts only the supplier attached to the requested invitation and RFQ', () => {
    expect(isInvitationRecipientMatch({ rfq_id: 'rfq-target', supplier_id: 'supplier-target' }, requested)).toBe(true);
  });

  it('fails closed for missing invitations and client-supplied RFQ or supplier substitutions', () => {
    expect(isInvitationRecipientMatch(null, requested)).toBe(false);
    expect(isInvitationRecipientMatch({ rfq_id: 'rfq-other', supplier_id: 'supplier-target' }, requested)).toBe(false);
    expect(isInvitationRecipientMatch({ rfq_id: 'rfq-target', supplier_id: 'supplier-other' }, requested)).toBe(false);
  });

  it('authenticates the outbound Edge request before parsing client recipient IDs', () => {
    const source = readFileSync(
      fileURLToPath(new URL('../../../../supabase/functions/messaging-outbound/index.ts', import.meta.url)),
      'utf8',
    );
    const authGuard = source.indexOf('if (!isExactServiceRoleBearer(');
    const payloadParse = source.indexOf('let payload: DispatchRequest;');
    expect(authGuard).toBeGreaterThanOrEqual(0);
    expect(payloadParse).toBeGreaterThan(authGuard);
    expect(source).toContain('isInvitationRecipientMatch(invitation, { rfqId, supplierId })');
  });
});