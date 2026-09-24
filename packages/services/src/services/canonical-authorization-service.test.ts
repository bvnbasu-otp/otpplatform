import { describe, it, expect } from 'vitest';
import {
  CanonicalAuthorizationService,
  canonicalAuthService,
} from './canonical-authorization-service';
import type { ActorContext } from '../types/actor-context';
import type { OrgRoleAssignment } from '@otp/domain';
import type { OrganizationDelegation } from '@otp/domain';

describe('CanonicalAuthorizationService & Multi-Context Resolution Battery', () => {
  const service = new CanonicalAuthorizationService();

  const PERSON_ALICE = 'person-alice-id';
  const PERSON_BOB = 'person-bob-id';
  const ORG_RWA_SOCIETY = 'org-rwa-society-uuid';
  const ORG_MSME_ENTERPRISE = 'org-msme-enterprise-uuid';

  // ---------------------------------------------------------------------------
  // 1. Individual Buyer Model (Zero Committee Overhead, organization_id = NULL)
  // ---------------------------------------------------------------------------
  describe('Individual Buyer Model', () => {
    const individualActor: ActorContext = {
      profileId: PERSON_ALICE,
      email: 'alice@personal.test',
      fullName: 'Alice Personal',
      persona: 'INDIVIDUAL',
      organizationId: undefined, // organization_id = NULL
    };

    it('allows Individual Buyer to create requirements and RFQs with zero committee overhead', () => {
      const result = service.canCreateRequirementOrRfq(individualActor, null);
      expect(result.allowed).toBe(true);
      expect(result.reason).toContain('Individual Buyer');
    });

    it('allows Individual Buyer to issue personal purchase orders directly', () => {
      const result = service.canIssuePurchaseOrder(individualActor, null, 45000);
      expect(result.allowed).toBe(true);
      expect(result.reason).toContain('Authorized to issue purchase order');
    });

    it('forbids Individual Buyer from casting RWA committee votes', () => {
      const voteCheck = service.canVoteInRwa(individualActor, ORG_RWA_SOCIETY);
      expect(voteCheck.allowed).toBe(false);
      expect(voteCheck.reason).toContain('Cannot cast RWA committee vote from non-RWA context');
    });
  });

  // ---------------------------------------------------------------------------
  // 2. RWA Governance Model: 7 Canonical Roles & Estate Manager Zero Voting
  // ---------------------------------------------------------------------------
  describe('RWA Governance & 7 Canonical Roles', () => {
    const presidentRole: OrgRoleAssignment = {
      id: 'assign-pres-1',
      organizationId: ORG_RWA_SOCIETY,
      personId: PERSON_ALICE,
      roleId: 'PRESIDENT',
      roleName: 'President',
      roleCategory: 'RWA_GOVERNANCE',
      responsibilityScope: 'EXECUTIVE',
      authorityScope: { permissions: ['VOTE', 'ISSUE_PO', 'RELEASE_PAYMENT'], canVote: true },
      effectiveFrom: new Date(Date.now() - 30 * 86400000).toISOString(),
      effectiveTo: new Date(Date.now() + 335 * 86400000).toISOString(),
      status: 'ACTIVE',
      appointmentEvent: 'AGM_ELECTION',
      createdAt: new Date().toISOString(),
    };

    const estateManagerRole: OrgRoleAssignment = {
      id: 'assign-mgr-1',
      organizationId: ORG_RWA_SOCIETY,
      personId: PERSON_BOB,
      roleId: 'ESTATE_MANAGER',
      roleName: 'Estate Manager',
      roleCategory: 'RWA_GOVERNANCE',
      responsibilityScope: 'OPERATIONS',
      authorityScope: { permissions: ['READ', 'WRITE', 'PROPOSE', 'ISSUE_PO'], canVote: false, spendCapAmount: 500000 },
      effectiveFrom: new Date(Date.now() - 30 * 86400000).toISOString(),
      effectiveTo: new Date(Date.now() + 335 * 86400000).toISOString(),
      status: 'ACTIVE',
      appointmentEvent: 'OPERATIONAL_HIRING',
      createdAt: new Date().toISOString(),
    };

    it('authorizes RWA President to vote on committee RFQs', () => {
      const presidentActor: ActorContext = {
        profileId: PERSON_ALICE,
        persona: 'RWA',
        organizationId: ORG_RWA_SOCIETY,
        roleAssignment: presidentRole,
      };

      const voteCheck = service.canVoteInRwa(presidentActor, ORG_RWA_SOCIETY, { rfqId: 'rfq-solar-01' });
      expect(voteCheck.allowed).toBe(true);
      expect(voteCheck.reason).toContain('Authorized to cast committee vote as President');
    });

    it('strictly forbids RWA Estate Manager from casting committee votes (canVote = false)', () => {
      const estateManagerActor: ActorContext = {
        profileId: PERSON_BOB,
        persona: 'RWA',
        organizationId: ORG_RWA_SOCIETY,
        roleAssignment: estateManagerRole,
      };

      const voteCheck = service.canVoteInRwa(estateManagerActor, ORG_RWA_SOCIETY, { rfqId: 'rfq-solar-01' });
      expect(voteCheck.allowed).toBe(false);
      expect(voteCheck.reason).toContain('strictly an operational non-voting role');
    });

    it('allows RWA Estate Manager to issue operational purchase orders within cap', () => {
      const estateManagerActor: ActorContext = {
        profileId: PERSON_BOB,
        persona: 'RWA',
        organizationId: ORG_RWA_SOCIETY,
        roleAssignment: estateManagerRole,
      };

      const poCheck = service.canIssuePurchaseOrder(estateManagerActor, ORG_RWA_SOCIETY, 300000);
      expect(poCheck.allowed).toBe(true);
      expect(poCheck.reason).toContain('Authorized to issue purchase order as Estate Manager');
    });

    it('forbids RWA Resident Owner without committee appointment from casting votes', () => {
      const residentMemberActor: ActorContext = {
        profileId: 'resident-flat-402',
        persona: 'RWA',
        organizationId: ORG_RWA_SOCIETY,
        roleAssignment: {
          id: 'assign-resident-1',
          organizationId: ORG_RWA_SOCIETY,
          personId: 'resident-flat-402',
          roleId: 'RESIDENT_MEMBER',
          roleName: 'Resident Society Member',
          roleCategory: 'RWA_GOVERNANCE',
          responsibilityScope: 'GENERAL',
          authorityScope: { permissions: ['READ'], canVote: false },
          effectiveFrom: new Date(Date.now() - 30 * 86400000).toISOString(),
          status: 'ACTIVE',
          appointmentEvent: 'FLAT_PURCHASE',
          createdAt: new Date().toISOString(),
        },
      };

      const voteCheck = service.canVoteInRwa(residentMemberActor, ORG_RWA_SOCIETY);
      expect(voteCheck.allowed).toBe(false);
      expect(voteCheck.reason).toContain('not an appointed committee member');
    });
  });

  // ---------------------------------------------------------------------------
  // 3. MSME Model: Spend Delegation, Anti-Self-Approval (PA-09)
  // ---------------------------------------------------------------------------
  describe('MSME Spend Governance & Anti-Self-Approval', () => {
    const primaryOwnerRole: OrgRoleAssignment = {
      id: 'assign-msme-p1',
      organizationId: ORG_MSME_ENTERPRISE,
      personId: PERSON_ALICE,
      roleId: 'PRIMARY_OWNER',
      roleName: 'Primary MSME / Owner',
      roleCategory: 'MSME_MANAGEMENT',
      responsibilityScope: 'EXECUTIVE',
      authorityScope: { permissions: ['ALL'], canVote: true, canIssuePo: true, canReleasePayment: true },
      effectiveFrom: new Date(Date.now() - 30 * 86400000).toISOString(),
      status: 'ACTIVE',
      appointmentEvent: 'FOUNDER',
      createdAt: new Date().toISOString(),
    };

    const activeDelegation: OrganizationDelegation = {
      id: 'del-mgr-bob-1',
      organizationId: ORG_MSME_ENTERPRISE,
      delegatorId: PERSON_ALICE,
      delegateeId: PERSON_BOB,
      permissions: ['APPROVE_TIER_1', 'APPROVE_TIER_2'],
      spendCapAmount: 800000, // 8 Lakhs
      startsAt: new Date(Date.now() - 86400000).toISOString(),
      expiresAt: new Date(Date.now() + 30 * 86400000).toISOString(),
      isActive: true,
      createdAt: new Date().toISOString(),
    };

    it('allows MSME Primary Owner 1-click spend approval for high-value orders', () => {
      const ownerActor: ActorContext = {
        profileId: PERSON_ALICE,
        persona: 'MSME',
        organizationId: ORG_MSME_ENTERPRISE,
        roleAssignment: primaryOwnerRole,
        statutoryGstin: '29ABCDE1234F1Z5',
      };

      const check = service.canApproveMsmeSpend(ownerActor, ORG_MSME_ENTERPRISE, 5000000);
      expect(check.allowed).toBe(true);
      expect(check.reason).toContain('Authorized to approve spend');
    });

    it('allows delegated MSME approver within spend cap for peer transactions', () => {
      const delegateActor: ActorContext = {
        profileId: PERSON_BOB,
        persona: 'MSME',
        organizationId: ORG_MSME_ENTERPRISE,
        activeDelegation,
        statutoryGstin: '29ABCDE1234F1Z5',
      };

      const check = service.canApproveMsmeSpend(delegateActor, ORG_MSME_ENTERPRISE, 500000, {
        creatorPersonId: 'person-charlie-lead',
      });
      expect(check.allowed).toBe(true);
      expect(check.reason).toContain('Authorized to approve spend');
    });

    it('strictly enforces Anti-Self-Approval (PA-09) when creator attempts to approve their own spend', () => {
      const delegateActor: ActorContext = {
        profileId: PERSON_BOB,
        persona: 'MSME',
        organizationId: ORG_MSME_ENTERPRISE,
        activeDelegation,
        statutoryGstin: '29ABCDE1234F1Z5',
      };

      const check = service.canApproveMsmeSpend(delegateActor, ORG_MSME_ENTERPRISE, 300000, {
        creatorPersonId: PERSON_BOB, // Self approval attempt
      });
      expect(check.allowed).toBe(false);
      expect(check.reason).toContain('Anti-Self-Approval invariant (PA-09)');
    });
  });

  // ---------------------------------------------------------------------------
  // 4. Multi-Context Switching & Zero Authority Bleed
  // ---------------------------------------------------------------------------
  describe('Multi-Context Resolution & Context Switching', () => {
    it('simulates Person A holding 3 distinct contexts with ZERO authority bleed', () => {
      // Base Persona: Person A as Individual Buyer
      const baseIndividualActor: ActorContext = {
        profileId: PERSON_ALICE,
        email: 'alice@enterprise-and-society.test',
        fullName: 'Alice MultiContext',
        persona: 'INDIVIDUAL',
        organizationId: undefined,
      };

      // 1. In Individual Context: Cannot vote in RWA or approve MSME spend
      expect(service.canVoteInRwa(baseIndividualActor, ORG_RWA_SOCIETY).allowed).toBe(false);
      expect(service.canApproveMsmeSpend(baseIndividualActor, ORG_MSME_ENTERPRISE, 100000).allowed).toBe(false);
      expect(service.canCreateRequirementOrRfq(baseIndividualActor, null).allowed).toBe(true);

      // 2. Switch Context to RWA Treasurer
      const rwaTreasurerRole: OrgRoleAssignment = {
        id: 'assign-treas-alice',
        organizationId: ORG_RWA_SOCIETY,
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

      const switch1 = service.switchContext(baseIndividualActor, {
        persona: 'RWA',
        organizationId: ORG_RWA_SOCIETY,
        roleAssignment: rwaTreasurerRole,
      });

      expect(switch1.valid).toBe(true);
      const rwaActor = switch1.nextActor!;
      expect(rwaActor.persona).toBe('RWA');
      expect(rwaActor.organizationId).toBe(ORG_RWA_SOCIETY);

      // In RWA Context: Can vote in RWA, but CANNOT approve MSME enterprise spend or access MSME
      expect(service.canVoteInRwa(rwaActor, ORG_RWA_SOCIETY).allowed).toBe(true);
      expect(service.canApproveMsmeSpend(rwaActor, ORG_MSME_ENTERPRISE, 100000).allowed).toBe(false);

      // 3. Switch Context to MSME Primary Owner
      const msmeOwnerRole: OrgRoleAssignment = {
        id: 'assign-msme-alice',
        organizationId: ORG_MSME_ENTERPRISE,
        personId: PERSON_ALICE,
        roleId: 'PRIMARY_OWNER',
        roleName: 'Primary MSME / Owner',
        roleCategory: 'MSME_MANAGEMENT',
        responsibilityScope: 'EXECUTIVE',
        authorityScope: { permissions: ['ALL'], canVote: true, canIssuePo: true, canReleasePayment: true },
        effectiveFrom: new Date(Date.now() - 10 * 86400000).toISOString(),
        status: 'ACTIVE',
        appointmentEvent: 'FOUNDER',
        createdAt: new Date().toISOString(),
      };

      const switch2 = service.switchContext(rwaActor, {
        persona: 'MSME',
        organizationId: ORG_MSME_ENTERPRISE,
        roleAssignment: msmeOwnerRole,
      });

      expect(switch2.valid).toBe(true);
      const msmeActor = switch2.nextActor!;
      expect(msmeActor.persona).toBe('MSME');
      expect(msmeActor.organizationId).toBe(ORG_MSME_ENTERPRISE);

      // In MSME Context: Can approve MSME spend, but CANNOT vote in RWA Society without switching back
      expect(service.canApproveMsmeSpend(msmeActor, ORG_MSME_ENTERPRISE, 2500000).allowed).toBe(true);
      expect(service.canVoteInRwa(msmeActor, ORG_RWA_SOCIETY).allowed).toBe(false);

      // 4. Switch Back to Individual Buyer Context
      const switch3 = service.switchContext(msmeActor, {
        persona: 'INDIVIDUAL',
        organizationId: null,
      });

      expect(switch3.valid).toBe(true);
      const indActor2 = switch3.nextActor!;
      expect(indActor2.persona).toBe('INDIVIDUAL');
      expect(indActor2.organizationId).toBeUndefined();
      expect(service.canVoteInRwa(indActor2, ORG_RWA_SOCIETY).allowed).toBe(false);
      expect(service.canApproveMsmeSpend(indActor2, ORG_MSME_ENTERPRISE, 100000).allowed).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // 5. Security Red-Team Negative Tests
  // ---------------------------------------------------------------------------
  describe('Security Red-Team Negative Test Battery', () => {
    it('rejects cross-tenant organization action attempts', () => {
      const actor: ActorContext = {
        profileId: PERSON_ALICE,
        persona: 'RWA',
        organizationId: ORG_RWA_SOCIETY,
        roleAssignment: {
          id: 'assign-pres-1',
          organizationId: ORG_RWA_SOCIETY,
          personId: PERSON_ALICE,
          roleId: 'PRESIDENT',
          roleName: 'President',
          roleCategory: 'RWA_GOVERNANCE',
          responsibilityScope: 'EXECUTIVE',
          authorityScope: { permissions: ['VOTE'], canVote: true },
          effectiveFrom: new Date(Date.now() - 30 * 86400000).toISOString(),
          status: 'ACTIVE',
          appointmentEvent: 'AGM',
          createdAt: new Date().toISOString(),
        },
      };

      const result = service.evaluate(actor, {
        action: 'CAST_COMMITTEE_VOTE',
        organizationId: 'org-another-society-unauthorized-target',
      });

      expect(result.authorized).toBe(false);
      expect(result.failedStage).toBe('STAGE_04_ORGANIZATION');
      expect(result.failureReason).toContain('Cross-tenant authority violation');
    });

    it('rejects self-manufactured / fake roles at Stage 7', () => {
      const attackerActor: ActorContext = {
        profileId: 'attacker-123',
        persona: 'RWA',
        organizationId: ORG_RWA_SOCIETY,
        roleAssignment: {
          id: 'assign-fake-role',
          organizationId: ORG_RWA_SOCIETY,
          personId: 'attacker-123',
          roleId: 'SUPER_VOTER_OVERLORD', // Fake role
          roleName: 'Fake Super Voter',
          roleCategory: 'RWA_GOVERNANCE',
          responsibilityScope: 'EXECUTIVE',
          authorityScope: { permissions: ['VOTE'], canVote: true },
          effectiveFrom: new Date().toISOString(),
          status: 'ACTIVE',
          appointmentEvent: 'FAKE_INJECTION',
          createdAt: new Date().toISOString(),
        },
      };

      const result = service.evaluate(attackerActor, {
        action: 'CAST_COMMITTEE_VOTE',
        organizationId: ORG_RWA_SOCIETY,
      });

      expect(result.authorized).toBe(false);
      expect(result.failedStage).toBe('STAGE_07_ROLE');
      expect(result.failureReason).toContain('not recognized in the 7 Canonical RWA Roles taxonomy');
    });

    it('rejects expired delegation replay attacks at Stage 9', () => {
      const expiredDelegation: OrganizationDelegation = {
        id: 'del-expired-replay',
        organizationId: ORG_MSME_ENTERPRISE,
        delegatorId: PERSON_ALICE,
        delegateeId: PERSON_BOB,
        permissions: ['APPROVE_TIER_1'],
        spendCapAmount: 100000,
        startsAt: new Date(Date.now() - 60 * 86400000).toISOString(),
        expiresAt: new Date(Date.now() - 5 * 86400000).toISOString(), // Expired 5 days ago
        isActive: true,
        createdAt: new Date().toISOString(),
      };

      const actor: ActorContext = {
        profileId: PERSON_BOB,
        persona: 'MSME',
        organizationId: ORG_MSME_ENTERPRISE,
        activeDelegation: expiredDelegation,
        statutoryGstin: '29ABCDE1234F1Z5',
      };

      const check = service.canApproveMsmeSpend(actor, ORG_MSME_ENTERPRISE, 50000, {
        creatorPersonId: 'person-charlie',
      });
      expect(check.allowed).toBe(false);
      expect(check.reason).toContain('Delegation proxy is expired');
    });
  });
});
