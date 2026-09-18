import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ENTERPRISE_APPROVAL_TIERS,
  isRfqFullyApproved,
  resolveRequiredApprovalTiers,
  validateApprovalEligibility,
  type OrganizationApprovalPolicy,
  type RfqApprovalStage,
} from './approval-matrix';

describe('OTP Phase 6.6: Multi-Tier Threshold Governance & Enterprise Approval Matrix', () => {
  const samplePolicy: OrganizationApprovalPolicy = {
    id: 'pol-org-001',
    organizationId: 'org-buyer-alpha',
    policyName: 'Alpha Standard Tiered Policy',
    isActive: true,
    tiers: [...DEFAULT_ENTERPRISE_APPROVAL_TIERS],
    preventSelfApproval: true,
    requireDualSignoffAboveAmount: 5000000,
    version: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  describe('Tier Resolution by Procurement Value', () => {
    it('resolves Tier 1 for procurement value < ₹5,00,000 (e.g. ₹2,50,000)', () => {
      const tiers = resolveRequiredApprovalTiers(250000, samplePolicy.tiers);
      expect(tiers).toHaveLength(1);
      expect(tiers[0]?.tierLevel).toBe('TIER_1_MANAGER');
    });

    it('resolves Tier 1 + Tier 2 for procurement value ₹5L - ₹25L (e.g. ₹12,00,000)', () => {
      const tiers = resolveRequiredApprovalTiers(1200000, samplePolicy.tiers);
      expect(tiers).toHaveLength(2);
      expect(tiers[0]?.tierLevel).toBe('TIER_1_MANAGER');
      expect(tiers[1]?.tierLevel).toBe('TIER_2_DEPT_HEAD');
    });

    it('resolves Tier 1 + Tier 2 + Tier 3 for procurement value > ₹25L (e.g. ₹45,00,000)', () => {
      const tiers = resolveRequiredApprovalTiers(4500000, samplePolicy.tiers);
      expect(tiers).toHaveLength(3);
      expect(tiers[0]?.tierLevel).toBe('TIER_1_MANAGER');
      expect(tiers[1]?.tierLevel).toBe('TIER_2_DEPT_HEAD');
      expect(tiers[2]?.tierLevel).toBe('TIER_3_EXECUTIVE');
    });
  });

  describe('Anti-Bypass & Sequential Sign-Off Invariants', () => {
    const stage1: RfqApprovalStage = {
      id: 'stg-01',
      rfqId: 'rfq-001',
      organizationId: 'org-buyer-alpha',
      tierLevel: 'TIER_1_MANAGER',
      stageOrder: 1,
      status: 'PENDING',
      thresholdMinAmount: 0,
      thresholdMaxAmount: 500000,
      procurementAmount: 1200000,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const stage2: RfqApprovalStage = {
      id: 'stg-02',
      rfqId: 'rfq-001',
      organizationId: 'org-buyer-alpha',
      tierLevel: 'TIER_2_DEPT_HEAD',
      stageOrder: 2,
      status: 'PENDING',
      thresholdMinAmount: 500000,
      thresholdMaxAmount: 2500000,
      procurementAmount: 1200000,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    it('prevents self-approval when creator attempts to approve stage 1', () => {
      const result = validateApprovalEligibility({
        policy: samplePolicy,
        stage: stage1,
        previousStages: [],
        actorProfileId: 'usr-creator-id',
        actorRoles: ['MANAGER'],
        rfqCreatorProfileId: 'usr-creator-id', // Same user
      });

      expect(result.eligible).toBe(false);
      expect(result.reason).toContain('Anti-bypass policy violation');
    });

    it('allows distinct authorized manager to approve stage 1', () => {
      const result = validateApprovalEligibility({
        policy: samplePolicy,
        stage: stage1,
        previousStages: [],
        actorProfileId: 'usr-manager-id',
        actorRoles: ['MANAGER'],
        rfqCreatorProfileId: 'usr-creator-id',
      });

      expect(result.eligible).toBe(true);
    });

    it('blocks stage 2 approval if stage 1 is still pending (sequential invariant)', () => {
      const result = validateApprovalEligibility({
        policy: samplePolicy,
        stage: stage2,
        previousStages: [stage1], // stage1 is PENDING
        actorProfileId: 'usr-vp-id',
        actorRoles: ['VP'],
        rfqCreatorProfileId: 'usr-creator-id',
      });

      expect(result.eligible).toBe(false);
      expect(result.reason).toContain('Sequential governance violation');
    });

    it('allows stage 2 approval once stage 1 is approved', () => {
      const approvedStage1 = { ...stage1, status: 'APPROVED' as const };
      const result = validateApprovalEligibility({
        policy: samplePolicy,
        stage: stage2,
        previousStages: [approvedStage1],
        actorProfileId: 'usr-vp-id',
        actorRoles: ['VP'],
        rfqCreatorProfileId: 'usr-creator-id',
      });

      expect(result.eligible).toBe(true);
    });

    it('determines when entire RFQ multi-tier chain is fully approved', () => {
      expect(isRfqFullyApproved([stage1, stage2])).toBe(false);
      expect(
        isRfqFullyApproved([
          { ...stage1, status: 'APPROVED' },
          { ...stage2, status: 'APPROVED' },
        ])
      ).toBe(true);
    });
  });
});
