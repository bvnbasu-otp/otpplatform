import { describe, it, expect } from 'vitest';
import {
  evaluateAuthorizationChain,
  validateContextSwitch,
  isIndividualBuyerContext,
  isRwaCommitteeMember,
  isRwaOperationalManager,
  isMsmePrimaryOwner,
  CANONICAL_RWA_ROLES,
  CANONICAL_MSME_ROLES,
  type AuthorizationContext,
  type AuthorizationActionRequest,
} from './authorization-chain';
import type { OrgRoleAssignment } from '../types/org-role-lifecycle';
import type { OrganizationDelegation } from '../types/buyer-governance';

describe('13-Stage Canonical Authorization Chain Domain Engine', () => {
  const PERSON_ALICE = 'person-uuid-alice-101';
  const PERSON_BOB = 'person-uuid-bob-102';
  const ORG_RWA_PALM_GROVE = 'org-rwa-palm-grove-201';
  const ORG_MSME_TECH_CORP = 'org-msme-tech-corp-301';

  // ---------------------------------------------------------------------------
  // 1. Stage 1 & 2: Person & Identity Authentication
  // ---------------------------------------------------------------------------
  it('fails at Stage 1 (Person) if personId is missing or empty', () => {
    const context: AuthorizationContext = {
      personId: '',
      isAuthenticated: true,
      persona: 'INDIVIDUAL',
    };
    const action: AuthorizationActionRequest = { action: 'CREATE_RFQ' };

    const result = evaluateAuthorizationChain(context, action);
    expect(result.authorized).toBe(false);
    expect(result.failedStage).toBe('STAGE_01_PERSON');
    expect(result.failureReason).toContain('Actor person ID is required');
  });

  it('fails at Stage 2 (Identity) if actor is unauthenticated', () => {
    const context: AuthorizationContext = {
      personId: PERSON_ALICE,
      isAuthenticated: false,
      persona: 'INDIVIDUAL',
    };
    const action: AuthorizationActionRequest = { action: 'CREATE_RFQ' };

    const result = evaluateAuthorizationChain(context, action);
    expect(result.authorized).toBe(false);
    expect(result.failedStage).toBe('STAGE_02_IDENTITY');
    expect(result.failureReason).toContain('authenticated identity verification');
  });

  // ---------------------------------------------------------------------------
  // 2. Individual Buyer Model (Stage 3 & 4: organization_id = NULL)
  // ---------------------------------------------------------------------------
  it('authorizes Individual Buyer with organization_id = NULL and zero committee overhead', () => {
    const context: AuthorizationContext = {
      personId: PERSON_ALICE,
      isAuthenticated: true,
      persona: 'INDIVIDUAL',
      organizationId: null,
      fullName: 'Alice Resident',
      email: 'alice@example.com',
    };
    const action: AuthorizationActionRequest = {
      action: 'CREATE_RFQ',
      spendAmount: 25000,
    };

    const result = evaluateAuthorizationChain(context, action);
    expect(result.authorized).toBe(true);
    expect(result.signatureMode).toBe('INDIVIDUAL_DIRECT');
    expect(result.effectiveRole).toBe('Personal Buyer');
    expect(result.auditAttribution).toBeDefined();
    expect(result.auditAttribution?.organizationId).toBe('00000000-0000-0000-0000-000000000000');
    expect(isIndividualBuyerContext(context)).toBe(true);
  });

  it('fails at Stage 4 (Organization) if Individual Buyer has an external corporate orgId attached', () => {
    const context: AuthorizationContext = {
      personId: PERSON_ALICE,
      isAuthenticated: true,
      persona: 'INDIVIDUAL',
      organizationId: ORG_MSME_TECH_CORP, // Pollution
    };
    const action: AuthorizationActionRequest = { action: 'CREATE_RFQ' };

    const result = evaluateAuthorizationChain(context, action);
    expect(result.authorized).toBe(false);
    expect(result.failedStage).toBe('STAGE_04_ORGANIZATION');
    expect(result.failureReason).toContain('cannot be bound to an external corporate organization ID');
  });

  it('fails at Stage 10 (Authority) if Individual Buyer attempts committee ballot voting', () => {
    const context: AuthorizationContext = {
      personId: PERSON_ALICE,
      isAuthenticated: true,
      persona: 'INDIVIDUAL',
      organizationId: null,
    };
    const action: AuthorizationActionRequest = { action: 'CAST_COMMITTEE_VOTE' };

    const result = evaluateAuthorizationChain(context, action);
    expect(result.authorized).toBe(false);
    expect(result.failedStage).toBe('STAGE_10_AUTHORITY');
    expect(result.failureReason).toContain('zero committee voting overhead');
  });

  // ---------------------------------------------------------------------------
  // 3. RWA Model: 7 Canonical Roles & Estate Manager Zero Voting Authority
  // ---------------------------------------------------------------------------
  it('verifies the 7 Canonical RWA Roles taxonomy', () => {
    expect(CANONICAL_RWA_ROLES).toEqual([
      'PRESIDENT',
      'VICE_PRESIDENT',
      'SECRETARY',
      'JOINT_SECRETARY',
      'TREASURER',
      'ESTATE_MANAGER',
      'COMMITTEE_MEMBER',
    ]);
  });

  it('authorizes RWA President to cast committee vote and issue POs', () => {
    const roleAssignment: OrgRoleAssignment = {
      id: 'assign-pres-01',
      organizationId: ORG_RWA_PALM_GROVE,
      personId: PERSON_ALICE,
      roleId: 'PRESIDENT',
      roleName: 'President',
      roleCategory: 'RWA_GOVERNANCE',
      responsibilityScope: 'EXECUTIVE',
      authorityScope: { permissions: ['VOTE', 'ISSUE_PO', 'RELEASE_PAYMENT'], canVote: true },
      effectiveFrom: new Date(Date.now() - 30 * 86400000).toISOString(),
      effectiveTo: new Date(Date.now() + 335 * 86400000).toISOString(),
      termDurationDays: 365,
      status: 'ACTIVE',
      appointmentEvent: 'ANNUAL_AGM_ELECTION',
      createdAt: new Date().toISOString(),
    };

    const context: AuthorizationContext = {
      personId: PERSON_ALICE,
      isAuthenticated: true,
      persona: 'RWA',
      organizationId: ORG_RWA_PALM_GROVE,
      roleAssignment,
    };

    const voteAction: AuthorizationActionRequest = {
      action: 'CAST_COMMITTEE_VOTE',
      organizationId: ORG_RWA_PALM_GROVE,
      targetEntityId: 'rfq-elevator-repair-01',
    };

    const voteResult = evaluateAuthorizationChain(context, voteAction);
    expect(voteResult.authorized).toBe(true);
    expect(voteResult.effectiveRole).toBe('President');
    expect(voteResult.effectiveResponsibility).toBe('EXECUTIVE');
    expect(isRwaCommitteeMember(context)).toBe(true);
    expect(isRwaOperationalManager(context)).toBe(false);
  });

  it('strictly FORBIDS RWA Estate Manager from casting committee votes (canVote = false)', () => {
    const estateManagerRole: OrgRoleAssignment = {
      id: 'assign-estate-mgr-01',
      organizationId: ORG_RWA_PALM_GROVE,
      personId: PERSON_BOB,
      roleId: 'ESTATE_MANAGER',
      roleName: 'Estate Manager',
      roleCategory: 'RWA_GOVERNANCE',
      responsibilityScope: 'OPERATIONS',
      authorityScope: { permissions: ['READ', 'WRITE', 'PROPOSE', 'ISSUE_PO'], canVote: false, spendCapAmount: 500000 },
      effectiveFrom: new Date(Date.now() - 30 * 86400000).toISOString(),
      effectiveTo: new Date(Date.now() + 335 * 86400000).toISOString(),
      termDurationDays: 365,
      status: 'ACTIVE',
      appointmentEvent: 'MANAGEMENT_CONTRACT',
      createdAt: new Date().toISOString(),
    };

    const context: AuthorizationContext = {
      personId: PERSON_BOB,
      isAuthenticated: true,
      persona: 'RWA',
      organizationId: ORG_RWA_PALM_GROVE,
      roleAssignment: estateManagerRole,
    };

    expect(isRwaOperationalManager(context)).toBe(true);
    expect(isRwaCommitteeMember(context)).toBe(false);

    // Operational action: Allowed
    const poAction: AuthorizationActionRequest = {
      action: 'ISSUE_PO',
      organizationId: ORG_RWA_PALM_GROVE,
      spendAmount: 250000,
    };
    const poResult = evaluateAuthorizationChain(context, poAction);
    expect(poResult.authorized).toBe(true);

    // Voting action: Strictly BLOCKED at Stage 10
    const voteAction: AuthorizationActionRequest = {
      action: 'CAST_COMMITTEE_VOTE',
      organizationId: ORG_RWA_PALM_GROVE,
    };
    const voteResult = evaluateAuthorizationChain(context, voteAction);
    expect(voteResult.authorized).toBe(false);
    expect(voteResult.failedStage).toBe('STAGE_10_AUTHORITY');
    expect(voteResult.failureReason).toContain('strictly an operational non-voting role');
  });

  it('recuses RWA Committee Member on Conflict of Interest (COI)', () => {
    const roleAssignment: OrgRoleAssignment = {
      id: 'assign-treas-01',
      organizationId: ORG_RWA_PALM_GROVE,
      personId: PERSON_ALICE,
      roleId: 'TREASURER',
      roleName: 'Treasurer',
      roleCategory: 'RWA_GOVERNANCE',
      responsibilityScope: 'FINANCIAL',
      authorityScope: { permissions: ['VOTE', 'RELEASE_PAYMENT'], canVote: true },
      effectiveFrom: new Date(Date.now() - 10 * 86400000).toISOString(),
      effectiveTo: new Date(Date.now() + 355 * 86400000).toISOString(),
      status: 'ACTIVE',
      appointmentEvent: 'AGM',
      createdAt: new Date().toISOString(),
    };

    const context: AuthorizationContext = {
      personId: PERSON_ALICE,
      isAuthenticated: true,
      persona: 'RWA',
      organizationId: ORG_RWA_PALM_GROVE,
      roleAssignment,
    };

    const actionWithCoi: AuthorizationActionRequest = {
      action: 'CAST_COMMITTEE_VOTE',
      organizationId: ORG_RWA_PALM_GROVE,
      coiDeclared: true,
    };

    const result = evaluateAuthorizationChain(context, actionWithCoi);
    expect(result.authorized).toBe(false);
    expect(result.failedStage).toBe('STAGE_10_AUTHORITY');
    expect(result.failureReason).toContain('Conflict of Interest (COI)');
  });

  // ---------------------------------------------------------------------------
  // 4. MSME Model & Anti-Self-Approval Invariant (PA-09)
  // ---------------------------------------------------------------------------
  it('authorizes MSME Primary Owner for 1-click spend approval', () => {
    const roleAssignment: OrgRoleAssignment = {
      id: 'assign-msme-owner-01',
      organizationId: ORG_MSME_TECH_CORP,
      personId: PERSON_ALICE,
      roleId: 'PRIMARY_OWNER',
      roleName: 'Primary MSME / Owner',
      roleCategory: 'MSME_MANAGEMENT',
      responsibilityScope: 'EXECUTIVE',
      authorityScope: { permissions: ['ALL'], canVote: true, canIssuePo: true, canReleasePayment: true },
      effectiveFrom: new Date(Date.now() - 30 * 86400000).toISOString(),
      status: 'ACTIVE',
      appointmentEvent: 'FOUNDER_REGISTRATION',
      createdAt: new Date().toISOString(),
    };

    const context: AuthorizationContext = {
      personId: PERSON_ALICE,
      isAuthenticated: true,
      persona: 'MSME',
      organizationId: ORG_MSME_TECH_CORP,
      roleAssignment,
      statutoryGstin: '29ABCDE1234F1Z5',
    };

    expect(isMsmePrimaryOwner(context)).toBe(true);

    const approveAction: AuthorizationActionRequest = {
      action: 'APPROVE_SPEND',
      organizationId: ORG_MSME_TECH_CORP,
      spendAmount: 7500000, // 75 Lakhs
    };

    const result = evaluateAuthorizationChain(context, approveAction);
    expect(result.authorized).toBe(true);
    expect(result.signatureMode).toBe('DIRECT');
  });

  it('enforces Anti-Self-Approval invariant (PA-09) on delegated proxies', () => {
    const delegation: OrganizationDelegation = {
      id: 'del-proxy-01',
      organizationId: ORG_MSME_TECH_CORP,
      delegatorId: PERSON_ALICE,
      delegateeId: PERSON_BOB,
      permissions: ['APPROVE_TIER_1', 'APPROVE_TIER_2'],
      spendCapAmount: 1000000,
      startsAt: new Date(Date.now() - 2 * 86400000).toISOString(),
      expiresAt: new Date(Date.now() + 30 * 86400000).toISOString(),
      isActive: true,
      createdAt: new Date().toISOString(),
    };

    const context: AuthorizationContext = {
      personId: PERSON_BOB,
      isAuthenticated: true,
      persona: 'MSME',
      organizationId: ORG_MSME_TECH_CORP,
      activeDelegation: delegation,
      statutoryGstin: '29ABCDE1234F1Z5',
    };

    // Case A: Bob approving third-party RFQ (creator = Charlie) within spend cap -> ALLOWED
    const validApproval: AuthorizationActionRequest = {
      action: 'APPROVE_SPEND',
      organizationId: ORG_MSME_TECH_CORP,
      creatorPersonId: 'person-charlie-999',
      spendAmount: 450000,
    };
    const validRes = evaluateAuthorizationChain(context, validApproval);
    expect(validRes.authorized).toBe(true);
    expect(validRes.signatureMode).toBe('DELEGATED');

    // Case B: Bob attempting to approve RFQ he created himself -> BLOCKED (Anti-Self-Approval PA-09)
    const selfApproval: AuthorizationActionRequest = {
      action: 'APPROVE_SPEND',
      organizationId: ORG_MSME_TECH_CORP,
      creatorPersonId: PERSON_BOB, // Self creator
      spendAmount: 450000,
    };
    const selfRes = evaluateAuthorizationChain(context, selfApproval);
    expect(selfRes.authorized).toBe(false);
    expect(selfRes.failedStage).toBe('STAGE_09_DELEGATION');
    expect(selfRes.failureReason).toContain('Anti-Self-Approval invariant (PA-09)');

    // Case C: Bob attempting to approve amount exceeding spend cap -> BLOCKED at Stage 11
    const overCapApproval: AuthorizationActionRequest = {
      action: 'APPROVE_SPEND',
      organizationId: ORG_MSME_TECH_CORP,
      creatorPersonId: 'person-charlie-999',
      spendAmount: 1500000, // Exceeds 10 Lakhs cap
    };
    const overCapRes = evaluateAuthorizationChain(context, overCapApproval);
    expect(overCapRes.authorized).toBe(false);
    expect(overCapRes.failedStage).toBe('STAGE_11_TRANSACTION');
    expect(overCapRes.failureReason).toContain('exceeds delegated cap');
  });

  it('prevents Anti-Self-Delegation (delegating authority to oneself)', () => {
    const invalidDelegation: OrganizationDelegation = {
      id: 'del-self-01',
      organizationId: ORG_MSME_TECH_CORP,
      delegatorId: PERSON_BOB,
      delegateeId: PERSON_BOB, // Self delegation
      permissions: ['APPROVE_TIER_1'],
      startsAt: new Date(Date.now() - 86400000).toISOString(),
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
      isActive: true,
      createdAt: new Date().toISOString(),
    };

    const context: AuthorizationContext = {
      personId: PERSON_BOB,
      isAuthenticated: true,
      persona: 'MSME',
      organizationId: ORG_MSME_TECH_CORP,
      activeDelegation: invalidDelegation,
    };

    const action: AuthorizationActionRequest = {
      action: 'APPROVE_SPEND',
      organizationId: ORG_MSME_TECH_CORP,
      spendAmount: 50000,
    };

    const result = evaluateAuthorizationChain(context, action);
    expect(result.authorized).toBe(false);
    expect(result.failedStage).toBe('STAGE_09_DELEGATION');
    expect(result.failureReason).toContain('Anti-Self-Delegation invariant');
  });

  // ---------------------------------------------------------------------------
  // 5. Universal Role Lifecycle: 365-day Expiry (PA-03)
  // ---------------------------------------------------------------------------
  it('strictly blocks expired role assignments at Stage 12 (Effective Date)', () => {
    const expiredAssignment: OrgRoleAssignment = {
      id: 'assign-expired-01',
      organizationId: ORG_RWA_PALM_GROVE,
      personId: PERSON_ALICE,
      roleId: 'SECRETARY',
      roleName: 'Secretary',
      roleCategory: 'RWA_GOVERNANCE',
      responsibilityScope: 'SECRETARIAL',
      authorityScope: { permissions: ['VOTE', 'ISSUE_PO'], canVote: true },
      effectiveFrom: new Date(Date.now() - 400 * 86400000).toISOString(),
      effectiveTo: new Date(Date.now() - 35 * 86400000).toISOString(), // Expired 35 days ago
      termDurationDays: 365,
      status: 'ACTIVE',
      appointmentEvent: 'OLD_ELECTION',
      createdAt: new Date().toISOString(),
    };

    const context: AuthorizationContext = {
      personId: PERSON_ALICE,
      isAuthenticated: true,
      persona: 'RWA',
      organizationId: ORG_RWA_PALM_GROVE,
      roleAssignment: expiredAssignment,
    };

    const voteAction: AuthorizationActionRequest = {
      action: 'CAST_COMMITTEE_VOTE',
      organizationId: ORG_RWA_PALM_GROVE,
    };

    const result = evaluateAuthorizationChain(context, voteAction);
    expect(result.authorized).toBe(false);
    expect(result.failedStage).toBe('STAGE_12_EFFECTIVE_DATE');
    expect(result.failureReason).toContain('Universal Role Lifecycle: Role \'Secretary\' expired');
  });

  // ---------------------------------------------------------------------------
  // 6. Multi-Context Switching & Zero Authority Bleed
  // ---------------------------------------------------------------------------
  it('validates context switching with zero authority bleed across personas', () => {
    const individualContext: AuthorizationContext = {
      personId: PERSON_ALICE,
      isAuthenticated: true,
      persona: 'INDIVIDUAL',
      organizationId: null,
    };

    const rwaContext: AuthorizationContext = {
      personId: PERSON_ALICE,
      isAuthenticated: true,
      persona: 'RWA',
      organizationId: ORG_RWA_PALM_GROVE,
    };

    const msmeContext: AuthorizationContext = {
      personId: PERSON_ALICE,
      isAuthenticated: true,
      persona: 'MSME',
      organizationId: ORG_MSME_TECH_CORP,
    };

    // Valid transitions
    const toRwa = validateContextSwitch(individualContext, rwaContext);
    expect(toRwa.valid).toBe(true);

    const toMsme = validateContextSwitch(rwaContext, msmeContext);
    expect(toMsme.valid).toBe(true);

    const backToInd = validateContextSwitch(msmeContext, individualContext);
    expect(backToInd.valid).toBe(true);

    // Invalid transition: Person ID mismatch
    const hijackedTarget: AuthorizationContext = {
      personId: PERSON_BOB, // Different person
      isAuthenticated: true,
      persona: 'INDIVIDUAL',
    };
    const hijackSwitch = validateContextSwitch(individualContext, hijackedTarget);
    expect(hijackSwitch.valid).toBe(false);
    expect(hijackSwitch.reason).toContain('Cannot switch context across different person IDs');
  });
});
