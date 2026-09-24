import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { DelegationProxyManager } from './components/DelegationProxyManager';
import { SpendApprovalModal } from '../award/components/SpendApprovalModal';
import { MsmeRegistrationAgreementModal } from '../portal/components/MsmeRegistrationAgreementModal';
import type { OrganizationDelegation } from '@otp/domain';
import type { OrgMember } from './api/org-members';

const MOCK_MEMBERS: OrgMember[] = [
  {
    profileId: 'usr-primary-001',
    role: 'OWNER',
    email: 'primary@apextools.in',
    fullName: 'Ramesh Sharma (Owner)',
    joinedAt: '2026-01-01T00:00:00Z',
    isSelf: true,
  },
  {
    profileId: 'usr-manager-002',
    role: 'MANAGER',
    email: 'suresh@apextools.in',
    fullName: 'Suresh Kumar (Operations)',
    joinedAt: '2026-01-01T00:00:00Z',
    isSelf: false,
  },
  {
    profileId: 'usr-member-003',
    role: 'BUYER',
    email: 'anita@apextools.in',
    fullName: 'Anita Patel (Procurement Lead)',
    joinedAt: '2026-01-01T00:00:00Z',
    isSelf: false,
  },
];

const MOCK_ACTIVE_DELEGATION: OrganizationDelegation = {
  id: 'del-001',
  organizationId: 'org-msme-001',
  delegatorId: 'usr-primary-001',
  delegatorName: 'Ramesh Sharma',
  delegateeId: 'usr-member-003',
  delegateeName: 'Anita Patel',
  delegateeEmail: 'anita@apextools.in',
  permissions: ['APPROVE_TIER_1', 'APPROVE_TIER_2', 'ISSUE_PO'],
  spendCapAmount: 500000,
  startsAt: '2026-09-01T00:00:00Z',
  expiresAt: '2026-10-31T23:59:59Z',
  isActive: true,
  createdAt: '2026-09-01T00:00:00Z',
};

describe('MSME Spend Governance & Delegation UI Components', () => {
  describe('1. DelegationProxyManager Component', () => {
    it('instantiates cleanly with active delegations and member list', () => {
      const onCreate = vi.fn();
      const onRevoke = vi.fn();

      const element = React.createElement(DelegationProxyManager, {
        organizationId: 'org-msme-001',
        currentActorProfileId: 'usr-primary-001',
        isPrimaryOrAdmin: true,
        members: MOCK_MEMBERS,
        delegations: [MOCK_ACTIVE_DELEGATION],
        onCreateDelegation: onCreate,
        onRevokeDelegation: onRevoke,
      });

      expect(element).toBeDefined();
      expect(element.props.organizationId).toBe('org-msme-001');
      expect(element.props.currentActorProfileId).toBe('usr-primary-001');
      expect(element.props.isPrimaryOrAdmin).toBe(true);
      expect(element.props.delegations).toHaveLength(1);
      expect(element.props.members).toHaveLength(3);
    });
  });

  describe('2. SpendApprovalModal Component', () => {
    it('instantiates spend approval modal with primary actor and commercial RFQ params', () => {
      const onClose = vi.fn();
      const onConfirm = vi.fn();

      const element = React.createElement(SpendApprovalModal, {
        isOpen: true,
        onClose,
        rfqId: 'rfq-101',
        rfqTitle: 'Industrial Boiler Equipment',
        procurementAmount: 1200000,
        tierLevel: 'TIER_2_DEPT_HEAD',
        actorProfileId: 'usr-primary-001',
        actorRole: 'PRIMARY',
        rfqCreatorProfileId: 'usr-creator-999',
        onConfirmApproval: onConfirm,
      });

      expect(element).toBeDefined();
      expect(element.props.isOpen).toBe(true);
      expect(element.props.rfqId).toBe('rfq-101');
      expect(element.props.procurementAmount).toBe(1200000);
      expect(element.props.tierLevel).toBe('TIER_2_DEPT_HEAD');
      expect(element.props.actorRole).toBe('PRIMARY');
    });

    it('instantiates spend approval modal with active delegation proxy', () => {
      const onClose = vi.fn();
      const onConfirm = vi.fn();

      const element = React.createElement(SpendApprovalModal, {
        isOpen: true,
        onClose,
        rfqId: 'rfq-102',
        rfqTitle: 'CNC Tooling Inserts',
        procurementAmount: 350000,
        tierLevel: 'TIER_1_MANAGER',
        actorProfileId: 'usr-member-003',
        actorRole: 'DELEGATE',
        rfqCreatorProfileId: 'usr-creator-999',
        activeDelegations: [MOCK_ACTIVE_DELEGATION],
        onConfirmApproval: onConfirm,
      });

      expect(element).toBeDefined();
      expect(element.props.activeDelegations).toHaveLength(1);
      expect(element.props.actorProfileId).toBe('usr-member-003');
    });
  });

  describe('3. MsmeRegistrationAgreementModal Component', () => {
    it('instantiates legal agreement modal with business and primary administrator details', () => {
      const onClose = vi.fn();
      const onAccept = vi.fn();

      const element = React.createElement(MsmeRegistrationAgreementModal, {
        isOpen: true,
        onClose,
        onAccept,
        businessName: 'Apex Precision Tools Pvt Ltd',
        businessType: 'PRIVATE_LIMITED',
        primaryOfficerName: 'Ramesh Sharma',
        gstin: '29AABCG7890K1Z2',
        pan: 'AABCG7890K',
      });

      expect(element).toBeDefined();
      expect(element.props.isOpen).toBe(true);
      expect(element.props.businessName).toBe('Apex Precision Tools Pvt Ltd');
      expect(element.props.businessType).toBe('PRIVATE_LIMITED');
      expect(element.props.gstin).toBe('29AABCG7890K1Z2');
    });
  });
});
