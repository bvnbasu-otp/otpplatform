import { describe, it, expect, beforeEach } from 'vitest';
import { createOtpServices, type OtpServices } from '../factory/create-otp-services';
import { InMemoryRepositories } from '../repositories/in-memory';
import type { ActorContext } from '../types/actor-context';
import { STANDARD_GOVERNANCE_ROLE_TEMPLATES } from '@otp/domain';

describe('Universal Org Role Lifecycle Service, Succession & Continuity Test Matrix', () => {
  let repos: InMemoryRepositories;
  let services: OtpServices;

  const ORG_RWA_ID = 'org-rwa-orchid-greens';
  const ORG_MSME_ID = 'org-msme-apex-tools';

  // RWA Actors
  const ADMIN_ACTOR: ActorContext = {
    profileId: 'admin-1',
    isPlatformAdmin: true,
  };

  const RWA_PRESIDENT_ALICE: ActorContext = {
    profileId: 'rwa-alice',
    organizationId: ORG_RWA_ID,
    orgRole: 'OWNER',
  };

  const RWA_VP_BOB: ActorContext = {
    profileId: 'rwa-bob',
    organizationId: ORG_RWA_ID,
    orgRole: 'MANAGER',
  };

  const RWA_TREASURER_CHARLIE: ActorContext = {
    profileId: 'rwa-charlie',
    organizationId: ORG_RWA_ID,
    orgRole: 'MANAGER',
  };

  const RWA_SECRETARY_DIANA: ActorContext = {
    profileId: 'rwa-diana',
    organizationId: ORG_RWA_ID,
    orgRole: 'MANAGER',
  };

  const RWA_ESTATE_MANAGER_EDWARD: ActorContext = {
    profileId: 'rwa-edward-em',
    organizationId: ORG_RWA_ID,
    orgRole: 'MANAGER',
  };

  const RWA_MEMBER_FRANK: ActorContext = {
    profileId: 'rwa-frank',
    organizationId: ORG_RWA_ID,
    orgRole: 'COMMITTEE_MEMBER',
  };

  // MSME Actors
  const MSME_OWNER_KAVITA: ActorContext = {
    profileId: 'msme-kavita',
    organizationId: ORG_MSME_ID,
    orgRole: 'OWNER',
  };

  const MSME_MANAGER_RAHUL: ActorContext = {
    profileId: 'msme-rahul',
    organizationId: ORG_MSME_ID,
    orgRole: 'MANAGER',
  };

  const MSME_MEMBER_PRIYA: ActorContext = {
    profileId: 'msme-priya',
    organizationId: ORG_MSME_ID,
    orgRole: 'BUYER',
  };

  const UNAUTHORIZED_ATTACKER: ActorContext = {
    profileId: 'attacker-evil',
    organizationId: 'other-org-random',
    orgRole: 'COMMITTEE_MEMBER',
  };

  beforeEach(() => {
    repos = InMemoryRepositories.create();
    services = createOtpServices(repos.asRepositories());
  });

  describe('1. Role Catalog Matrix — All 11 Roles (7 RWA + 4 MSME)', () => {
    it('successfully appoints and initializes all 7 RWA roles with default 1-year (365 days) expiry', async () => {
      const rwaRoles = [
        { roleId: 'PRESIDENT', personId: 'p-pres', name: 'President' },
        { roleId: 'VICE_PRESIDENT', personId: 'p-vp', name: 'Vice President' },
        { roleId: 'SECRETARY', personId: 'p-sec', name: 'Secretary' },
        { roleId: 'JOINT_SECRETARY', personId: 'p-jsec', name: 'Joint Secretary' },
        { roleId: 'TREASURER', personId: 'p-tres', name: 'Treasurer' },
        { roleId: 'ESTATE_MANAGER', personId: 'p-em', name: 'Estate Manager' },
        { roleId: 'COMMITTEE_MEMBER', personId: 'p-cm', name: 'Committee Member' },
      ];

      for (const r of rwaRoles) {
        const assignment = await services.orgRoleLifecycle.appointRole(ADMIN_ACTOR, {
          organizationId: ORG_RWA_ID,
          personId: r.personId,
          personName: r.name,
          roleId: r.roleId,
        });

        expect(assignment.status).toBe('ACTIVE');
        expect(assignment.roleId).toBe(r.roleId);
        expect(assignment.roleCategory).toBe('RWA_GOVERNANCE');
        expect(assignment.termDurationDays).toBe(365);
        expect(assignment.effectiveTo).toBeTruthy();

        // Check 365 days window
        const from = new Date(assignment.effectiveFrom).getTime();
        const to = new Date(assignment.effectiveTo!).getTime();
        const diffDays = Math.round((to - from) / 86400000);
        expect(diffDays).toBe(365);
      }
    });

    it('successfully appoints all 4 MSME roles', async () => {
      const msmeRoles = [
        { roleId: 'PRIMARY_OWNER', personId: 'm-owner', name: 'Primary Owner' },
        { roleId: 'MANAGER', personId: 'm-mgr', name: 'Manager' },
        { roleId: 'MEMBER', personId: 'm-mem', name: 'Member' },
        { roleId: 'DELEGATE', personId: 'm-del', name: 'Delegate' },
      ];

      for (const r of msmeRoles) {
        const assignment = await services.orgRoleLifecycle.appointRole(ADMIN_ACTOR, {
          organizationId: ORG_MSME_ID,
          personId: r.personId,
          personName: r.name,
          roleId: r.roleId,
          roleCategory: 'MSME_MANAGEMENT',
        });

        expect(assignment.status).toBe('ACTIVE');
        expect(assignment.roleId).toBe(r.roleId);
        expect(assignment.roleCategory).toBe('MSME_MANAGEMENT');
      }
    });
  });

  describe('2. Role Succession Handover & Continuity ("Role ≠ Person")', () => {
    it('executes atomic succession: terminates predecessor, activates successor, and preserves immutable audit', async () => {
      // 1. Initial Appointment: Alice as President
      const alicePres = await services.orgRoleLifecycle.appointRole(RWA_PRESIDENT_ALICE, {
        organizationId: ORG_RWA_ID,
        personId: RWA_PRESIDENT_ALICE.profileId,
        personName: 'Alice President',
        roleId: 'PRESIDENT',
      });

      // 2. Alice performs governance action (e.g. Spend Authorization)
      const auditAlice = await services.orgRoleLifecycle.recordGovernanceAudit(RWA_PRESIDENT_ALICE, {
        organizationId: ORG_RWA_ID,
        roleAssignment: alicePres,
        action: 'SPEND_GATE_APPROVAL',
        entityType: 'rfq',
        entityId: 'rfq-elevator-2026',
        transactionId: 'txn-101',
        payload: { amount: 1500000, approvalNotes: 'Signed off on FY26 Elevator Modernization' },
      });

      expect(auditAlice.actorPersonId).toBe(RWA_PRESIDENT_ALICE.profileId);
      expect(auditAlice.roleAtTime).toBe('President');

      // 3. Succession Handover: Bob becomes new President
      const succession = await services.orgRoleLifecycle.executeRoleSuccession(RWA_PRESIDENT_ALICE, {
        organizationId: ORG_RWA_ID,
        roleId: 'PRESIDENT',
        predecessorPersonId: RWA_PRESIDENT_ALICE.profileId,
        successorPersonId: RWA_VP_BOB.profileId,
        successorPersonName: 'Bob New President',
        effectiveDate: new Date('2026-06-01T00:00:00Z').toISOString(),
        reason: 'AGM 2026 Presidential Election Handover',
        predecessorNewRole: 'COMMITTEE_MEMBER',
      });

      expect(succession.predecessorPersonId).toBe(RWA_PRESIDENT_ALICE.profileId);
      expect(succession.successorPersonId).toBe(RWA_VP_BOB.profileId);

      // 4. Invariant: Active President is now Bob
      const currentPres = await services.orgRoleLifecycle.getActiveRoleHolder(
        ORG_RWA_ID,
        'PRESIDENT',
        new Date('2026-06-15T00:00:00Z')
      );
      expect(currentPres?.personId).toBe(RWA_VP_BOB.profileId);
      expect(currentPres?.status).toBe('ACTIVE');

      // 5. Invariant: Alice's historical action audit remains untouched and attributed to Alice
      const audits = await repos.asRepositories().orgGovernanceAudits?.findByOrganizationId(ORG_RWA_ID);
      const pastAliceAudit = audits?.find((a) => a.transactionId === 'txn-101');
      expect(pastAliceAudit).toBeDefined();
      expect(pastAliceAudit?.actorPersonId).toBe(RWA_PRESIDENT_ALICE.profileId);
      expect(pastAliceAudit?.roleAtTime).toBe('President');

      // 6. Invariant: Alice NO LONGER has President approval authority after succession
      const aliceAuthorityAfter = await services.orgRoleLifecycle.verifyAuthorityAtTime({
        organizationId: ORG_RWA_ID,
        personId: RWA_PRESIDENT_ALICE.profileId,
        permission: 'APPROVE_TIER_3',
        amount: 2000000,
        atTime: new Date('2026-06-15T00:00:00Z'),
      });
      expect(aliceAuthorityAfter.authorized).toBe(false);

      // 7. Invariant: Bob NOW possesses President approval authority
      const bobAuthority = await services.orgRoleLifecycle.verifyAuthorityAtTime({
        organizationId: ORG_RWA_ID,
        personId: RWA_VP_BOB.profileId,
        permission: 'APPROVE_TIER_3',
        amount: 2000000,
        atTime: new Date('2026-06-15T00:00:00Z'),
      });
      expect(bobAuthority.authorized).toBe(true);
      expect(bobAuthority.roleAtTime).toBe('President');
    });
  });

  describe('3. Estate Manager & Term Expiry Invariants', () => {
    it('enforces 1-year default expiry on Estate Manager and blocks authority after expiration', async () => {
      const emAssign = await services.orgRoleLifecycle.appointRole(RWA_PRESIDENT_ALICE, {
        organizationId: ORG_RWA_ID,
        personId: RWA_ESTATE_MANAGER_EDWARD.profileId,
        personName: 'Edward Estate Manager',
        roleId: 'ESTATE_MANAGER',
        effectiveFrom: '2026-01-01T00:00:00Z',
      });

      expect(emAssign.termDurationDays).toBe(365);
      expect(emAssign.effectiveTo).toBe('2027-01-01T00:00:00.000Z');

      // During active term (e.g. July 2026): Edward can issue PO up to ₹5L
      const validAuth = await services.orgRoleLifecycle.verifyAuthorityAtTime({
        organizationId: ORG_RWA_ID,
        personId: RWA_ESTATE_MANAGER_EDWARD.profileId,
        permission: 'ISSUE_PO',
        amount: 250000,
        atTime: new Date('2026-07-01T00:00:00Z'),
      });
      expect(validAuth.authorized).toBe(true);
      expect(validAuth.roleAtTime).toBe('Estate Manager');

      // Estate Manager spend cap check (>₹5L rejected)
      const capExceededAuth = await services.orgRoleLifecycle.verifyAuthorityAtTime({
        organizationId: ORG_RWA_ID,
        personId: RWA_ESTATE_MANAGER_EDWARD.profileId,
        permission: 'ISSUE_PO',
        amount: 750000, // exceeds ₹5L cap
        atTime: new Date('2026-07-01T00:00:00Z'),
      });
      expect(capExceededAuth.authorized).toBe(false);

      // After Term Expiry (e.g. Jan 15, 2027): Authority is FORBIDDEN
      const expiredAuth = await services.orgRoleLifecycle.verifyAuthorityAtTime({
        organizationId: ORG_RWA_ID,
        personId: RWA_ESTATE_MANAGER_EDWARD.profileId,
        permission: 'ISSUE_PO',
        amount: 50000,
        atTime: new Date('2027-01-15T00:00:00Z'),
      });
      expect(expiredAuth.authorized).toBe(false);
      expect(expiredAuth.reason).toContain('role expired');
    });

    it('identifies expiring roles within 30 days threshold', async () => {
      await services.orgRoleLifecycle.appointRole(RWA_PRESIDENT_ALICE, {
        organizationId: ORG_RWA_ID,
        personId: RWA_ESTATE_MANAGER_EDWARD.profileId,
        roleId: 'ESTATE_MANAGER',
        effectiveFrom: '2026-01-01T00:00:00Z',
      });

      // Check on Dec 15, 2026 (17 days remaining before Jan 1, 2027)
      const expiringList = await services.orgRoleLifecycle.getExpiringRoles(
        ORG_RWA_ID,
        30,
        new Date('2026-12-15T00:00:00Z')
      );

      expect(expiringList.length).toBe(1);
      expect(expiringList[0]!.assignment.roleId).toBe('ESTATE_MANAGER');
      expect(expiringList[0]!.daysLeft).toBeLessThanOrEqual(17);
      expect(expiringList[0]!.isExpired).toBe(false);
    });
  });

  describe('4. Annual Renewal & Role Rotation Workflow', () => {
    it('executes same-role renewal for another 365-day term', async () => {
      const emAssign = await services.orgRoleLifecycle.appointRole(RWA_PRESIDENT_ALICE, {
        organizationId: ORG_RWA_ID,
        personId: RWA_ESTATE_MANAGER_EDWARD.profileId,
        roleId: 'ESTATE_MANAGER',
        effectiveFrom: '2026-01-01T00:00:00Z',
      });

      const renewal = await services.orgRoleLifecycle.renewOrRotateRole(RWA_PRESIDENT_ALICE, {
        assignmentId: emAssign.id,
        continueInGovernance: true,
        renewalRoleId: 'ESTATE_MANAGER',
        termDurationDays: 365,
        effectiveDate: '2027-01-01T00:00:00Z',
        notes: 'Renewed for FY27 management contract',
      });

      expect(renewal.action).toBe('RENEWED');
      expect(renewal.roleId).toBe('ESTATE_MANAGER');
      expect(renewal.effectiveFrom).toBe('2027-01-01T00:00:00Z');
      expect(renewal.termDurationDays).toBe(365);

      // Now authorized in FY27
      const fy27Auth = await services.orgRoleLifecycle.verifyAuthorityAtTime({
        organizationId: ORG_RWA_ID,
        personId: RWA_ESTATE_MANAGER_EDWARD.profileId,
        permission: 'ISSUE_PO',
        amount: 200000,
        atTime: new Date('2027-03-01T00:00:00Z'),
      });
      expect(fy27Auth.authorized).toBe(true);
    });

    it('executes role rotation (e.g. Estate Manager -> Committee Member)', async () => {
      const emAssign = await services.orgRoleLifecycle.appointRole(RWA_PRESIDENT_ALICE, {
        organizationId: ORG_RWA_ID,
        personId: RWA_ESTATE_MANAGER_EDWARD.profileId,
        roleId: 'ESTATE_MANAGER',
        effectiveFrom: '2026-01-01T00:00:00Z',
      });

      const rotation = await services.orgRoleLifecycle.renewOrRotateRole(RWA_PRESIDENT_ALICE, {
        assignmentId: emAssign.id,
        continueInGovernance: true,
        renewalRoleId: 'COMMITTEE_MEMBER',
        renewalRoleName: 'Committee Member',
        termDurationDays: 365,
        effectiveDate: '2027-01-01T00:00:00Z',
        notes: 'Transitioned from Estate Manager to Committee Member',
      });

      expect(rotation.action).toBe('ROTATED');
      expect(rotation.roleId).toBe('COMMITTEE_MEMBER');

      // Committee Member can now Vote
      const voteAuth = await services.orgRoleLifecycle.verifyAuthorityAtTime({
        organizationId: ORG_RWA_ID,
        personId: RWA_ESTATE_MANAGER_EDWARD.profileId,
        permission: 'VOTE',
        atTime: new Date('2027-02-01T00:00:00Z'),
      });
      expect(voteAuth.authorized).toBe(true);
      expect(voteAuth.roleAtTime).toBe('Committee Member');
    });

    it('executes retirement / exit from committee upon non-renewal', async () => {
      const secAssign = await services.orgRoleLifecycle.appointRole(RWA_PRESIDENT_ALICE, {
        organizationId: ORG_RWA_ID,
        personId: RWA_SECRETARY_DIANA.profileId,
        roleId: 'SECRETARY',
        effectiveFrom: '2026-01-01T00:00:00Z',
      });

      const exit = await services.orgRoleLifecycle.renewOrRotateRole(RWA_PRESIDENT_ALICE, {
        assignmentId: secAssign.id,
        continueInGovernance: false,
        effectiveDate: '2026-12-31T23:59:59Z',
        notes: 'Stepped down after completing 1-year term',
      });

      expect(exit.action).toBe('RETIRED');
      expect(exit.newAssignmentId).toBeNull();

      // Authority is revoked after retirement
      const retiredAuth = await services.orgRoleLifecycle.verifyAuthorityAtTime({
        organizationId: ORG_RWA_ID,
        personId: RWA_SECRETARY_DIANA.profileId,
        permission: 'VOTE',
        atTime: new Date('2027-01-02T00:00:00Z'),
      });
      expect(retiredAuth.authorized).toBe(false);
    });
  });

  describe('5. Vacancy Handling & Strict Scoping (No Leakage)', () => {
    it('supports vacant roles without auto-assignment', async () => {
      const vacant = await services.orgRoleLifecycle.appointRole(RWA_PRESIDENT_ALICE, {
        organizationId: ORG_RWA_ID,
        personId: null, // Vacant
        roleId: 'TREASURER',
        roleName: 'Treasurer',
      });

      expect(vacant.status).toBe('VACANT');
      expect(vacant.personId).toBeNull();

      const activeHolder = await services.orgRoleLifecycle.getActiveRoleHolder(ORG_RWA_ID, 'TREASURER');
      expect(activeHolder).toBeNull();
    });

    it('enforces strict tenant scoping: no authority leakage between RWA, MSME, and Individual roles', async () => {
      // Alice is President of ORG_RWA_ID.
      await services.orgRoleLifecycle.appointRole(RWA_PRESIDENT_ALICE, {
        organizationId: ORG_RWA_ID,
        personId: RWA_PRESIDENT_ALICE.profileId,
        roleId: 'PRESIDENT',
      });

      // Attempt to use Alice's credentials for MSME spend gate in ORG_MSME_ID
      const crossOrgAuth = await services.orgRoleLifecycle.verifyAuthorityAtTime({
        organizationId: ORG_MSME_ID,
        personId: RWA_PRESIDENT_ALICE.profileId,
        permission: 'APPROVE_TIER_3',
        amount: 500000,
      });

      expect(crossOrgAuth.authorized).toBe(false);
      expect(crossOrgAuth.reason).toContain('does not possess permission');
    });

    it('blocks unauthorized actors from managing roles or triggering successions (Red Team Security)', async () => {
      await expect(
        services.orgRoleLifecycle.appointRole(UNAUTHORIZED_ATTACKER, {
          organizationId: ORG_RWA_ID,
          personId: UNAUTHORIZED_ATTACKER.profileId,
          roleId: 'PRESIDENT',
        })
      ).rejects.toThrow('Unauthorized: Caller lacks permission to manage roles');

      await expect(
        services.orgRoleLifecycle.executeRoleSuccession(UNAUTHORIZED_ATTACKER, {
          organizationId: ORG_RWA_ID,
          roleId: 'PRESIDENT',
          successorPersonId: UNAUTHORIZED_ATTACKER.profileId,
        })
      ).rejects.toThrow('Unauthorized: Caller lacks permission to manage roles');
    });
  });
});
