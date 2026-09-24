import { describe, it, expect } from 'vitest';
import {
  canTransitionMemberClaimState,
  OrgMemberClaimState,
  BUYER_PERSONA_CONFIGS,
  BuyerPersona,
} from '@otp/domain';

describe('Committee / Team Builder & Claim Lifecycle Tests', () => {
  it('validates explicit invitation claim state transitions', () => {
    // Valid forward transitions
    expect(canTransitionMemberClaimState('INVITED', 'CLAIMED')).toBe(true);
    expect(canTransitionMemberClaimState('CLAIMED', 'PROFILE_COMPLETE')).toBe(true);
    expect(canTransitionMemberClaimState('PROFILE_COMPLETE', 'ACTIVE')).toBe(true);
    expect(canTransitionMemberClaimState('ACTIVE', 'INACTIVE')).toBe(true);
    expect(canTransitionMemberClaimState('INACTIVE', 'ACTIVE')).toBe(true);

    // Invalid skip transitions (fail-closed)
    expect(canTransitionMemberClaimState('INVITED', 'ACTIVE')).toBe(false);
    expect(canTransitionMemberClaimState('CLAIMED', 'ACTIVE')).toBe(false);
  });

  it('validates persona configurations for RWA and MSME governance models', () => {
    const rwaConfig = BUYER_PERSONA_CONFIGS['RWA'];
    expect(rwaConfig.requiresGovernanceCommittee).toBe(true);
    expect(rwaConfig.defaultQuorum).toBeGreaterThanOrEqual(2);
    expect(rwaConfig.availableRoles).toContain('COMMITTEE_MEMBER');
    expect(rwaConfig.intakeMode).toBe('FULL_GOVERNANCE');

    const msmeConfig = BUYER_PERSONA_CONFIGS['MSME'];
    expect(msmeConfig.requiresGovernanceCommittee).toBe(false);
    expect(msmeConfig.requiresTaxRegistration).toBe(true);
    expect(msmeConfig.availableRoles).toContain('APPROVER');

    const indConfig = BUYER_PERSONA_CONFIGS['INDIVIDUAL'];
    expect(indConfig.requiresGovernanceCommittee).toBe(false);
    expect(indConfig.requiresTaxRegistration).toBe(false);
  });
});
