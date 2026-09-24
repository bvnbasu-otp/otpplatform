import { describe, it, expect } from 'vitest';
import {
  BUYER_PERSONA_CONFIGS,
  canTransitionMemberClaimState,
  resolveBuyerPersona,
  type OrgMemberClaimState,
} from './buyer-persona';

describe('Buyer Persona Matrix & Governance Taxonomy', () => {
  it('correctly provides configuration for INDIVIDUAL, RWA, and MSME personas', () => {
    const individual = BUYER_PERSONA_CONFIGS.INDIVIDUAL;
    expect(individual.requiresGovernanceCommittee).toBe(false);
    expect(individual.requiresTaxRegistration).toBe(false);
    expect(individual.defaultQuorum).toBe(1);
    expect(individual.intakeMode).toBe('FAST_TRACK');

    const rwa = BUYER_PERSONA_CONFIGS.RWA;
    expect(rwa.requiresGovernanceCommittee).toBe(true);
    expect(rwa.defaultQuorum).toBe(2);
    expect(rwa.intakeMode).toBe('FULL_GOVERNANCE');

    const msme = BUYER_PERSONA_CONFIGS.MSME;
    expect(msme.requiresGovernanceCommittee).toBe(false);
    expect(msme.requiresTaxRegistration).toBe(true);
    expect(msme.intakeMode).toBe('FAST_TRACK');
  });

  it('validates member claim state transitions', () => {
    expect(canTransitionMemberClaimState('INVITED', 'CLAIMED')).toBe(true);
    expect(canTransitionMemberClaimState('CLAIMED', 'PROFILE_COMPLETE')).toBe(true);
    expect(canTransitionMemberClaimState('PROFILE_COMPLETE', 'ACTIVE')).toBe(true);
    expect(canTransitionMemberClaimState('ACTIVE', 'INACTIVE')).toBe(true);
    expect(canTransitionMemberClaimState('INACTIVE', 'ACTIVE')).toBe(true);

    // Invalid jumps
    expect(canTransitionMemberClaimState('INVITED', 'ACTIVE')).toBe(false);
    expect(canTransitionMemberClaimState('INVITED', 'PROFILE_COMPLETE')).toBe(false);
  });

  it('resolves persona from organization type codes', () => {
    expect(resolveBuyerPersona('INDIVIDUAL')).toBe('INDIVIDUAL');
    expect(resolveBuyerPersona('COMMUNITY')).toBe('RWA');
    expect(resolveBuyerPersona('RESIDENTIAL_RWA')).toBe('RWA');
    expect(resolveBuyerPersona('RWA')).toBe('RWA');
    expect(resolveBuyerPersona('MSME')).toBe('MSME');
    expect(resolveBuyerPersona('ENTERPRISE')).toBe('MSME');
    expect(resolveBuyerPersona('INSTITUTION')).toBe('MSME');
    expect(resolveBuyerPersona(null)).toBe('INDIVIDUAL');
  });
});
