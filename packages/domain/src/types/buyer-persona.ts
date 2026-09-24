/**
 * Buyer Persona Matrix & Governance Taxonomy
 *
 * Distinct Buyer Models:
 * 1. INDIVIDUAL: Personal profile + primary delivery/billing address. Zero committee overhead.
 * 2. RWA (Residential Welfare Association / Housing Society):
 *    Committee governance, Secretary/President/Treasurer roles, merit voting weights, quorum, COI, delegation.
 * 3. MSME (Micro, Small & Medium Enterprise):
 *    Corporate identity (Legal Name, GSTIN, PAN), team roles (Owner, Manager, Lead, Approver), spend caps, delegation.
 */

export type BuyerPersona = 'INDIVIDUAL' | 'RWA' | 'MSME';

export type OrgMemberClaimState =
  | 'INVITED'
  | 'CLAIMED'
  | 'PROFILE_COMPLETE'
  | 'ACTIVE'
  | 'INACTIVE';

export interface BuyerPersonaConfiguration {
  persona: BuyerPersona;
  displayName: string;
  description: string;
  requiresGovernanceCommittee: boolean;
  requiresTaxRegistration: boolean;
  defaultQuorum: number;
  availableRoles: string[];
  intakeMode: 'FAST_TRACK' | 'FULL_GOVERNANCE';
}

export const BUYER_PERSONA_CONFIGS: Record<BuyerPersona, BuyerPersonaConfiguration> = {
  INDIVIDUAL: {
    persona: 'INDIVIDUAL',
    displayName: 'Individual Buyer',
    description: 'Personal procurement with fast-track intake, primary address inheritance, and zero committee overhead.',
    requiresGovernanceCommittee: false,
    requiresTaxRegistration: false,
    defaultQuorum: 1,
    availableRoles: ['OWNER'],
    intakeMode: 'FAST_TRACK',
  },
  RWA: {
    persona: 'RWA',
    displayName: 'Residential Welfare Association / Society',
    description: 'Governed committee procurement with Secretary/President roles, weighted ballots, quorum, and COI disclosure.',
    requiresGovernanceCommittee: true,
    requiresTaxRegistration: false,
    defaultQuorum: 2,
    availableRoles: ['OWNER', 'MANAGER', 'COMMITTEE_MEMBER', 'APPROVER', 'VIEWER'],
    intakeMode: 'FULL_GOVERNANCE',
  },
  MSME: {
    persona: 'MSME',
    displayName: 'MSME Business Enterprise',
    description: 'Commercial procurement with statutory GSTIN/PAN identity, multi-tier spend limits, team signoffs, and delegation.',
    requiresGovernanceCommittee: false,
    requiresTaxRegistration: true,
    defaultQuorum: 1,
    availableRoles: ['OWNER', 'MANAGER', 'BUYER', 'APPROVER', 'VIEWER'],
    intakeMode: 'FAST_TRACK',
  },
};

/**
 * Validates member claim state transitions.
 */
export function canTransitionMemberClaimState(
  from: OrgMemberClaimState,
  to: OrgMemberClaimState,
): boolean {
  const allowedTransitions: Record<OrgMemberClaimState, OrgMemberClaimState[]> = {
    INVITED: ['CLAIMED', 'INACTIVE'],
    CLAIMED: ['PROFILE_COMPLETE', 'INACTIVE'],
    PROFILE_COMPLETE: ['ACTIVE', 'INACTIVE'],
    ACTIVE: ['INACTIVE'],
    INACTIVE: ['ACTIVE'],
  };
  return allowedTransitions[from]?.includes(to) ?? false;
}

/**
 * Resolves buyer persona from organization type string.
 */
export function resolveBuyerPersona(orgType?: string | null): BuyerPersona {
  if (!orgType) return 'INDIVIDUAL';
  const upper = orgType.toUpperCase();
  if (upper === 'INDIVIDUAL') return 'INDIVIDUAL';
  if (['RWA', 'COMMUNITY', 'RESIDENTIAL_RWA', 'HOUSING_SOCIETY'].includes(upper)) return 'RWA';
  if (['MSME', 'ENTERPRISE', 'INSTITUTION', 'COMMERCIAL'].includes(upper)) return 'MSME';
  return 'INDIVIDUAL';
}
