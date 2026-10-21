import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SpendApprovalModal } from './SpendApprovalModal';

describe('MSME spend approval dialog', () => {
  it('is absent until opened and then exposes a named dialog', () => {
    const closed = renderToStaticMarkup(
      React.createElement(SpendApprovalModal, {
        isOpen: false,
        onClose: () => undefined,
        rfqId: 'rfq-1',
        procurementAmount: 25000,
        tierLevel: 'TIER_1_MANAGER',
        actorProfileId: 'actor',
        actorRole: 'OWNER',
        rfqCreatorProfileId: 'creator',
        onConfirmApproval: async () => ({ ok: false, error: 'not called' }),
      }),
    );
    expect(closed).toBe('');

    const open = renderToStaticMarkup(
      React.createElement(SpendApprovalModal, {
        isOpen: true,
        onClose: () => undefined,
        rfqId: 'rfq-1',
        rfqTitle: 'Motor rewinding',
        procurementAmount: 25000,
        tierLevel: 'TIER_1_MANAGER',
        actorProfileId: 'actor',
        actorRole: 'OWNER',
        rfqCreatorProfileId: 'creator',
        onConfirmApproval: async () => ({ ok: false, error: 'Approval was rejected' }),
      }),
    );
    expect(open).toContain('role="dialog"');
    expect(open).toContain('aria-modal="true"');
    expect(open).toContain('id="msme-spend-approval-title"');
    expect(open).toContain('Close award approval dialog');
    expect(open).toContain('min-h-[44px]');
    expect(open).toContain('MSME Spend Governance Sign-off');
  });
});
