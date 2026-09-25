import { describe, it, expect } from 'vitest';
import {
  BUYER_PERSONA_CONFIGS,
  canTransitionMemberClaimState,
  resolveBuyerPersona,
  tryResolveBuyerPersona,
  UnsupportedPersonaError,
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

  it('resolves canonical personas from valid organization type codes', () => {
    expect(resolveBuyerPersona('INDIVIDUAL')).toBe('INDIVIDUAL');
    expect(resolveBuyerPersona('COMMUNITY')).toBe('RWA');
    expect(resolveBuyerPersona('RESIDENTIAL_RWA')).toBe('RWA');
    expect(resolveBuyerPersona('RWA')).toBe('RWA');
    expect(resolveBuyerPersona('HOUSING_SOCIETY')).toBe('RWA');
    expect(resolveBuyerPersona('MSME')).toBe('MSME');
    expect(resolveBuyerPersona('BUSINESS')).toBe('MSME');
    expect(resolveBuyerPersona(null)).toBe('INDIVIDUAL');
    expect(resolveBuyerPersona(undefined)).toBe('INDIVIDUAL');
    expect(resolveBuyerPersona('')).toBe('INDIVIDUAL');
  });

  it('fails closed on retired ENTERPRISE and unmapped personas (never normalizes to MSME)', () => {
    expect(() => resolveBuyerPersona('ENTERPRISE')).toThrow(UnsupportedPersonaError);
    expect(() => resolveBuyerPersona('enterprise')).toThrow(UnsupportedPersonaError);
    expect(() => resolveBuyerPersona('Enterprise')).toThrow(UnsupportedPersonaError);
    expect(() => resolveBuyerPersona(' ENTERPRISE ')).toThrow(UnsupportedPersonaError);
    expect(() => resolveBuyerPersona('enterprise_user')).toThrow(UnsupportedPersonaError);
    expect(() => resolveBuyerPersona('enterprise_buyer')).toThrow(UnsupportedPersonaError);
    expect(() => resolveBuyerPersona('commercial_enterprise')).toThrow(UnsupportedPersonaError);
    expect(() => resolveBuyerPersona('INSTITUTION')).toThrow(UnsupportedPersonaError);

    // tryResolveBuyerPersona returns null safely on failure
    expect(tryResolveBuyerPersona('ENTERPRISE')).toBeNull();
    expect(tryResolveBuyerPersona('MSME')).toBe('MSME');
    expect(tryResolveBuyerPersona('INDIVIDUAL')).toBe('INDIVIDUAL');
  });
});
