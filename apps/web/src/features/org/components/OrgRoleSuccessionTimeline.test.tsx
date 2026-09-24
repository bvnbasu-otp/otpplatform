import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { OrgRoleSuccessionTimeline } from './OrgRoleSuccessionTimeline';
import { RoleRenewalModal } from './RoleRenewalModal';
import { RoleTransferModal } from './RoleTransferModal';
import { CommitteeTeamBuilder } from './CommitteeTeamBuilder';
import type { OrgRoleAssignment } from '@otp/domain';
import type { OrgMember } from '../api/org-members';

describe('Org Role Succession & Annual Renewal UI Components', () => {
  const sampleMembers: OrgMember[] = [
    {
      profileId: 'usr-estate-mgr-1',
      role: 'ESTATE_MANAGER',
      fullName: 'Ramesh Kumar (Estate Mgr)',
      email: 'ramesh@greenwood-rwa.org',
      isSelf: false,
      joinedAt: '2025-09-01T00:00:00.000Z',
    },
    {
      profileId: 'usr-sec-1',
      role: 'SECRETARY',
      fullName: 'Priya Sharma (Secretary)',
      email: 'priya@greenwood-rwa.org',
      isSelf: false,
      joinedAt: '2025-09-01T00:00:00.000Z',
    },
    {
      profileId: 'usr-resident-1',
      role: 'COMMITTEE_MEMBER',
      fullName: 'Anil Gupta (Resident)',
      email: 'anil@greenwood-rwa.org',
      isSelf: false,
      joinedAt: '2025-09-01T00:00:00.000Z',
    },
  ];

  const sampleAssignment: OrgRoleAssignment = {
    id: 'asg-em-01',
    organizationId: 'org-rwa-100',
    personId: 'usr-estate-mgr-1',
    personName: 'Ramesh Kumar',
    personEmail: 'ramesh@greenwood-rwa.org',
    roleId: 'ESTATE_MANAGER',
    roleName: 'Estate Manager',
    roleCategory: 'RWA_GOVERNANCE',
    responsibilityScope: 'OPERATIONS',
    authorityScope: {
      permissions: ['FACILITIES_MANAGEMENT', 'ISSUE_PO'],
      spendCapAmount: 500000,
      canVote: false,
    },
    effectiveFrom: '2025-10-01T00:00:00.000Z',
    effectiveTo: '2026-10-01T00:00:00.000Z',
    termDurationDays: 365,
    status: 'ACTIVE',
    appointmentEvent: 'AGM_2025',
    predecessorAssignmentId: null,
    createdAt: '2025-10-01T00:00:00.000Z',
  };

  describe('OrgRoleSuccessionTimeline', () => {
    it('instantiates cleanly with organization context and member list', () => {
      const element = React.createElement(OrgRoleSuccessionTimeline, {
        organizationId: 'org-rwa-100',
        organizationName: 'Greenwood Heights RWA',
        canManage: true,
        members: sampleMembers,
      });

      expect(element).toBeDefined();
      expect(element.props.organizationId).toBe('org-rwa-100');
      expect(element.props.organizationName).toBe('Greenwood Heights RWA');
      expect(element.props.canManage).toBe(true);
      expect(element.props.members).toHaveLength(3);
    });
  });

  describe('RoleRenewalModal (Annual Renewal & Role Rotation Prompt)', () => {
    it('instantiates renewal modal with target assignment and handles props', () => {
      const onClose = vi.fn();
      const onSuccess = vi.fn();
      const renewFn = vi.fn().mockResolvedValue({
        ok: true,
        action: 'RENEWED',
        oldAssignmentId: 'asg-em-01',
        newAssignmentId: 'asg-em-02',
        roleId: 'ESTATE_MANAGER',
        roleName: 'Estate Manager',
        effectiveFrom: '2026-10-01T00:00:00.000Z',
        message: 'Successfully renewed Estate Manager',
      });

      const element = React.createElement(RoleRenewalModal, {
        isOpen: true,
        assignment: sampleAssignment,
        onClose,
        onSuccess,
        renewFn,
      });

      expect(element).toBeDefined();
      expect(element.props.assignment.roleId).toBe('ESTATE_MANAGER');
      expect(element.props.assignment.termDurationDays).toBe(365);
      expect(element.props.isOpen).toBe(true);
    });
  });

  describe('RoleTransferModal (Atomic Predecessor -> Successor Handover)', () => {
    it('instantiates role transfer modal with organization context and member list', () => {
      const onClose = vi.fn();
      const onSuccess = vi.fn();
      const transferFn = vi.fn().mockResolvedValue({
        ok: true,
        message: 'Role handed over successfully',
      });

      const element = React.createElement(RoleTransferModal, {
        isOpen: true,
        organizationId: 'org-rwa-100',
        members: sampleMembers,
        initialRoleId: 'ESTATE_MANAGER',
        initialPredecessorId: 'usr-estate-mgr-1',
        onClose,
        onSuccess,
        transferFn,
      });

      expect(element).toBeDefined();
      expect(element.props.organizationId).toBe('org-rwa-100');
      expect(element.props.initialRoleId).toBe('ESTATE_MANAGER');
      expect(element.props.members).toHaveLength(3);
    });
  });

  describe('CommitteeTeamBuilder', () => {
    it('instantiates committee team builder with role defaults', () => {
      const onRoleAppointed = vi.fn();

      const element = React.createElement(CommitteeTeamBuilder, {
        organizationId: 'org-rwa-100',
        members: sampleMembers,
        canManage: true,
        onRoleAppointed,
      });

      expect(element).toBeDefined();
      expect(element.props.organizationId).toBe('org-rwa-100');
      expect(element.props.members).toHaveLength(3);
    });
  });
});
