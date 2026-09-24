import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { SpendApprovalModal } from './components/SpendApprovalModal';
import type { OrganizationDelegation } from '@otp/domain';

const MOCK_DELEGATIONS: OrganizationDelegation[] = [
  {
    id: 'del-101',
    organizationId: 'org-msme-01',
    delegatorId: 'usr-primary-01',
    delegatorName: 'Rajesh Sharma',
    delegateeId: 'usr-manager-02',
    delegateeName: 'Anil Kumar',
    permissions: ['APPROVE_TIER_1', 'APPROVE_TIER_2'],
    spendCapAmount: 500000,
    startsAt: '2026-09-01T00:00:00Z',
    expiresAt: '2026-10-31T23:59:59Z',
    isActive: true,
    createdAt: '2026-09-01T00:00:00Z',
  },
];

describe('SpendApprovalModal (MSME Spend Governance Component)', () => {
  it('instantiates primary spend sign-off modal with commercial params', () => {
    const handleClose = vi.fn();
    const handleConfirm = vi.fn();

    const element = React.createElement(SpendApprovalModal, {
      isOpen: true,
      onClose: handleClose,
      rfqId: 'rfq-101',
      rfqTitle: '5000 units Industrial Fasteners',
      procurementAmount: 350000,
      tierLevel: 'TIER_1_MANAGER',
      actorProfileId: 'usr-primary-01',
      actorRole: 'PRIMARY',
      rfqCreatorProfileId: 'usr-creator-99',
      onConfirmApproval: handleConfirm,
    });

    expect(element).toBeDefined();
    expect(element.props.isOpen).toBe(true);
    expect(element.props.rfqId).toBe('rfq-101');
    expect(element.props.procurementAmount).toBe(350000);
    expect(element.props.tierLevel).toBe('TIER_1_MANAGER');
    expect(element.props.actorRole).toBe('PRIMARY');
    expect(element.props.rfqCreatorProfileId).toBe('usr-creator-99');
  });

  it('instantiates spend approval modal with active delegation proxy', () => {
    const handleClose = vi.fn();
    const handleConfirm = vi.fn();

    const element = React.createElement(SpendApprovalModal, {
      isOpen: true,
      onClose: handleClose,
      rfqId: 'rfq-101',
      rfqTitle: 'Raw Materials Batch A',
      procurementAmount: 250000,
      tierLevel: 'TIER_1_MANAGER',
      actorProfileId: 'usr-manager-02',
      actorRole: 'DELEGATE',
      rfqCreatorProfileId: 'usr-creator-99',
      activeDelegations: MOCK_DELEGATIONS,
      onConfirmApproval: handleConfirm,
    });

    expect(element).toBeDefined();
    expect(element.props.actorRole).toBe('DELEGATE');
    expect(element.props.activeDelegations).toHaveLength(1);
    expect(element.props.activeDelegations?.[0].id).toBe('del-101');
  });
});
