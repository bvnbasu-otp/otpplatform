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
 * Error thrown when an unsupported or retired buyer persona is requested.
 */
export class UnsupportedPersonaError extends Error {
  public readonly personaName: string;

  constructor(personaName: string, message?: string) {
    super(
      message ??
        `Unsupported or retired buyer persona: '${personaName}'. Supported personas are strictly INDIVIDUAL, RWA, and MSME (FAIL_CLOSED).`,
    );
    this.name = 'UnsupportedPersonaError';
    this.personaName = personaName;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

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
 * Strictly enforces canonical personas (INDIVIDUAL, RWA, MSME).
 * Fails closed on retired ENTERPRISE variants or unknown persona claims.
 */
export function resolveBuyerPersona(orgType?: string | null): BuyerPersona {
  if (orgType === null || orgType === undefined || orgType === '') {
    return 'INDIVIDUAL';
  }

  const raw = String(orgType);
  const trimmed = raw.trim();
  const upper = trimmed.toUpperCase();

  // Explicit Fail-Closed: ENTERPRISE is retired and strictly unsupported
  if (
    upper === 'ENTERPRISE' ||
    upper.includes('ENTERPRISE') ||
    upper === 'COMMERCIAL_ENTERPRISE' ||
    upper.startsWith('ENTERPRISE_') ||
    upper.endsWith('_ENTERPRISE')
  ) {
    throw new UnsupportedPersonaError(
      raw,
      `Unsupported buyer persona: '${raw}' is retired and cannot be resolved (FAIL_CLOSED).`,
    );
  }

  if (['INDIVIDUAL', 'PERSONAL', 'SOLO', 'BUYER'].includes(upper)) {
    return 'INDIVIDUAL';
  }

  if (['RWA', 'COMMUNITY', 'RESIDENTIAL_RWA', 'HOUSING_SOCIETY', 'SOCIETY'].includes(upper)) {
    return 'RWA';
  }

  if (['MSME', 'BUSINESS', 'PROPRIETORSHIP', 'PARTNERSHIP', 'PVT_LTD'].includes(upper)) {
    return 'MSME';
  }

  // Any other unknown/unsupported persona string fails closed
  throw new UnsupportedPersonaError(
    raw,
    `Unsupported buyer persona: '${raw}' is invalid or unsupported (FAIL_CLOSED).`,
  );
}

/**
 * Safely resolves buyer persona from organization type without throwing, returning null on rejection.
 */
export function tryResolveBuyerPersona(orgType?: string | null): BuyerPersona | null {
  try {
    return resolveBuyerPersona(orgType);
  } catch {
    return null;
  }
}
