import { describe, expect, it } from 'vitest';
import {
  isInvitationValid,
  isDelegationActiveForAction,
  checkSegregationOfDuties,
  computeEffectiveAuthority,
  type OrganizationInvitation,
  type OrganizationDelegation,
} from './buyer-governance';

describe('OTP Phase C8.1: Buyer Organization Governance Domain Engine', () => {
  const baseTime = new Date('2026-09-20T12:00:00Z');

  describe('Organization Invitation Validation', () => {
    const validInvitation: OrganizationInvitation = {
      id: 'inv-001',
      organizationId: 'org-alpha',
      invitedEmail: 'newbuyer@enterprise.test',
      role: 'COMMITTEE_MEMBER',
      invitedBy: 'prof-owner',
      status: 'PENDING',
      expiresAt: '2026-09-27T12:00:00Z', // 7 days later
      createdAt: '2026-09-20T12:00:00Z',
      token: 'tok-secret-hex-random-001',
    };

    it('passes for valid pending invitation within 7-day window', () => {
      const res = isInvitationValid(validInvitation, baseTime);
      expect(res.valid).toBe(true);
    });

    it('rejects an accepted invitation token (single-use invariant)', () => {
      const accepted: OrganizationInvitation = { ...validInvitation, status: 'ACCEPTED', acceptedAt: '2026-09-21T08:00:00Z' };
      const res = isInvitationValid(accepted, baseTime);
      expect(res.valid).toBe(false);
      expect(res.reason).toContain('already been accepted');
    });

    it('rejects a revoked invitation', () => {
      const revoked: OrganizationInvitation = { ...validInvitation, status: 'REVOKED', revokedAt: '2026-09-20T14:00:00Z' };
      const res = isInvitationValid(revoked, baseTime);
      expect(res.valid).toBe(false);
      expect(res.reason).toContain('revoked');
    });

    it('rejects an expired invitation past 7 days', () => {
      const pastTime = new Date('2026-09-28T12:00:00Z');
      const res = isInvitationValid(validInvitation, pastTime);
      expect(res.valid).toBe(false);
      expect(res.reason).toContain('expired');
    });
  });

  describe('Delegation Proxy Engine & Spend Caps', () => {
    const sampleDelegation: OrganizationDelegation = {
      id: 'del-001',
      organizationId: 'org-alpha',
      delegatorId: 'prof-cfo',
      delegateeId: 'prof-manager',
      permissions: ['APPROVE_TIER_1', 'APPROVE_TIER_2'],
      spendCapAmount: 1500000, // ₹15 Lakhs
      startsAt: '2026-09-20T00:00:00Z',
      expiresAt: '2026-10-04T00:00:00Z', // 14 days
      isActive: true,
      createdAt: '2026-09-20T00:00:00Z',
    };

    it('permits delegatee to act within spend cap and active time range', () => {
      const res = isDelegationActiveForAction({
        delegation: sampleDelegation,
        permission: 'APPROVE_TIER_2',
        amount: 1200000,
        currentTime: baseTime,
      });
      expect(res.active).toBe(true);
    });

    it('blocks action when procurement amount exceeds spend cap', () => {
      const res = isDelegationActiveForAction({
        delegation: sampleDelegation,
        permission: 'APPROVE_TIER_2',
        amount: 2000000, // ₹20 Lakhs > ₹15 Lakhs cap
        currentTime: baseTime,
      });
      expect(res.active).toBe(false);
      expect(res.reason).toContain('exceeds delegation spend cap');
    });

    it('blocks action when delegation is not granted the requested permission', () => {
      const res = isDelegationActiveForAction({
        delegation: sampleDelegation,
        permission: 'APPROVE_TIER_3',
        amount: 500000,
        currentTime: baseTime,
      });
      expect(res.active).toBe(false);
      expect(res.reason).toContain('does not grant permission APPROVE_TIER_3');
    });

    it('blocks action when delegation is expired', () => {
      const afterExpiry = new Date('2026-10-10T00:00:00Z');
      const res = isDelegationActiveForAction({
        delegation: sampleDelegation,
        permission: 'APPROVE_TIER_1',
        amount: 200000,
        currentTime: afterExpiry,
      });
      expect(res.active).toBe(false);
      expect(res.reason).toContain('expired');
    });
  });

  describe('Segregation of Duties (SoD) Anti-Bypass Rules', () => {
    it('prevents RFQ requester from self-approving or issuing PO', () => {
      const sodCheck = checkSegregationOfDuties({
        action: 'APPROVE',
        actorProfileId: 'prof-requester-01',
        rfqCreatorProfileId: 'prof-requester-01',
      });
      expect(sodCheck.allowed).toBe(false);
      expect(sodCheck.violation).toContain('cannot self-approve');
    });

    it('allows independent manager to approve RFQ created by another user', () => {
      const sodCheck = checkSegregationOfDuties({
        action: 'APPROVE',
        actorProfileId: 'prof-manager-02',
        rfqCreatorProfileId: 'prof-requester-01',
      });
      expect(sodCheck.allowed).toBe(true);
    });

    it('prevents PO Issuer from executing final settlement payout', () => {
      const sodCheck = checkSegregationOfDuties({
        action: 'SETTLE_PAYMENT',
        actorProfileId: 'prof-finance-01',
        rfqCreatorProfileId: 'prof-requester-01',
        poIssuerProfileId: 'prof-finance-01',
      });
      expect(sodCheck.allowed).toBe(false);
      expect(sodCheck.violation).toContain('cannot execute settlement payment release');
    });
  });

  describe('Effective Authority Resolution', () => {
    it('computes combined effective authority including active delegations', () => {
      const del: OrganizationDelegation = {
        id: 'del-002',
        organizationId: 'org-alpha',
        delegatorId: 'prof-cfo',
        delegateeId: 'prof-buyer-01',
        permissions: ['APPROVE_TIER_2'],
        spendCapAmount: 1000000,
        startsAt: '2026-09-20T00:00:00Z',
        expiresAt: '2026-10-04T00:00:00Z',
        isActive: true,
        createdAt: '2026-09-20T00:00:00Z',
      };

      const authority = computeEffectiveAuthority({
        organizationId: 'org-alpha',
        profileId: 'prof-buyer-01',
        baseRole: 'BUYER',
        delegations: [del],
        amount: 800000,
        currentTime: baseTime,
      });

      expect(authority.hasAuthority).toBe(true);
      expect(authority.effectivePermissions).toContain('APPROVE_TIER_1');
      expect(authority.effectivePermissions).toContain('APPROVE_TIER_2'); // Delegated
      expect(authority.activeDelegations).toHaveLength(1);
    });
  });
});
