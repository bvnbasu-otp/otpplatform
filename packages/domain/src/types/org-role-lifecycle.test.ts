import { describe, it, expect } from 'vitest';
import {
  isRoleAssignmentActiveAt,
  isRoleExpiringSoon,
  calculateRoleDefaultTermExpiry,
  verifyPersonAuthorityAtTime,
  validateSuccessionTransition,
  evaluateRoleRenewalTransition,
  createGovernanceAuditSnapshot,
  STANDARD_GOVERNANCE_ROLE_TEMPLATES,
  type OrgRoleAssignment,
} from './org-role-lifecycle';
import type { OrganizationDelegation } from './buyer-governance';

describe('Universal Org Role Lifecycle Domain Models', () => {
  const ORG_RWA_ID = 'org-rwa-100';
  const ORG_MSME_ID = 'org-msme-200';

  const PERSON_ALICE = 'person-alice-1';
  const PERSON_BOB = 'person-bob-2';
  const PERSON_CHARLIE = 'person-charlie-3';
  const PERSON_DAVID_EM = 'person-david-em-4';

  const mockPresidentAssignment: OrgRoleAssignment = {
    id: 'assign-pres-1',
    organizationId: ORG_RWA_ID,
    personId: PERSON_ALICE,
    personName: 'Alice President',
    personEmail: 'alice@rwa.org',
    roleId: 'PRESIDENT',
    roleName: 'President',
    roleCategory: 'RWA_GOVERNANCE',
    responsibilityScope: 'EXECUTIVE',
    authorityScope: STANDARD_GOVERNANCE_ROLE_TEMPLATES.PRESIDENT!.defaultAuthority,
    effectiveFrom: '2026-01-01T00:00:00.000Z',
    effectiveTo: '2026-12-31T23:59:59.000Z',
    termDurationDays: 365,
    status: 'ACTIVE',
    appointmentEvent: 'AGM_ELECTION_2026',
    createdAt: '2026-01-01T00:00:00.000Z',
  };

  const mockEstateManagerAssignment: OrgRoleAssignment = {
    id: 'assign-em-1',
    organizationId: ORG_RWA_ID,
    personId: PERSON_DAVID_EM,
    personName: 'David Estate Manager',
    personEmail: 'david.em@rwa.org',
    roleId: 'ESTATE_MANAGER',
    roleName: 'Estate Manager',
    roleCategory: 'RWA_GOVERNANCE',
    responsibilityScope: 'OPERATIONS',
    authorityScope: STANDARD_GOVERNANCE_ROLE_TEMPLATES.ESTATE_MANAGER!.defaultAuthority,
    effectiveFrom: '2026-01-01T00:00:00.000Z',
    effectiveTo: '2026-12-31T23:59:59.000Z',
    termDurationDays: 365,
    status: 'ACTIVE',
    appointmentEvent: 'MANAGEMENT_HIRE_2026',
    createdAt: '2026-01-01T00:00:00.000Z',
  };

  const mockTreasurerAssignment: OrgRoleAssignment = {
    id: 'assign-tres-1',
    organizationId: ORG_RWA_ID,
    personId: PERSON_BOB,
    personName: 'Bob Treasurer',
    personEmail: 'bob@rwa.org',
    roleId: 'TREASURER',
    roleName: 'Treasurer',
    roleCategory: 'RWA_GOVERNANCE',
    responsibilityScope: 'FINANCIAL',
    authorityScope: {
      ...STANDARD_GOVERNANCE_ROLE_TEMPLATES.TREASURER!.defaultAuthority,
      spendCapAmount: 2500000,
    },
    effectiveFrom: '2026-01-01T00:00:00.000Z',
    effectiveTo: '2026-12-31T23:59:59.000Z',
    termDurationDays: 365,
    status: 'ACTIVE',
    appointmentEvent: 'AGM_ELECTION_2026',
    createdAt: '2026-01-01T00:00:00.000Z',
  };

  describe('1-Year Default Term Expiry & Expiring Warnings', () => {
    it('calculates 365-day expiry correctly from effective_from', () => {
      const from = new Date('2026-01-01T00:00:00.000Z');
      const expiry = calculateRoleDefaultTermExpiry(from, 365);
      const diffDays = Math.round((expiry.getTime() - from.getTime()) / 86400000);
      expect(diffDays).toBe(365);
    });

    it('identifies role expiring soon within 30-day window', () => {
      const checkDate = new Date('2026-12-15T00:00:00.000Z'); // 16 days before 2026-12-31
      const warning = isRoleExpiringSoon(mockEstateManagerAssignment, 30, checkDate);
      expect(warning.expiring).toBe(true);
      expect(warning.isExpired).toBe(false);
      expect(warning.daysLeft).toBeLessThanOrEqual(17);
    });

    it('identifies expired role after effective_to date', () => {
      const expiredDate = new Date('2027-01-02T00:00:00.000Z');
      const warning = isRoleExpiringSoon(mockEstateManagerAssignment, 30, expiredDate);
      expect(warning.expiring).toBe(false);
      expect(warning.isExpired).toBe(true);
      expect(warning.daysLeft).toBe(0);
    });

    it('strictly forbids all authority for expired roles (Estate Manager & President)', () => {
      const expiredDate = new Date('2027-01-02T00:00:00.000Z');

      // 1. Estate Manager PO issue check after expiry
      const emAuth = verifyPersonAuthorityAtTime({
        organizationId: ORG_RWA_ID,
        personId: PERSON_DAVID_EM,
        permission: 'ISSUE_PO',
        amount: 50000,
        atTime: expiredDate,
        roleAssignments: [mockEstateManagerAssignment],
      });
      expect(emAuth.authorized).toBe(false);
      expect(emAuth.reason).toContain('role expired');

      // 2. President Approval check after expiry
      const presAuth = verifyPersonAuthorityAtTime({
        organizationId: ORG_RWA_ID,
        personId: PERSON_ALICE,
        permission: 'APPROVE_TIER_3',
        amount: 3000000,
        atTime: expiredDate,
        roleAssignments: [mockPresidentAssignment],
      });
      expect(presAuth.authorized).toBe(false);
      expect(presAuth.reason).toContain('role expired');
    });
  });

  describe('Annual Renewal & Role Rotation Workflow', () => {
    it('evaluates same-role renewal preserving role with fresh 1-year term', () => {
      const renewalDate = new Date('2027-01-01T00:00:00.000Z');
      const res = evaluateRoleRenewalTransition({
        currentAssignment: mockEstateManagerAssignment,
        continueInGovernance: true,
        renewalRoleId: 'ESTATE_MANAGER',
        termDays: 365,
        effectiveDate: renewalDate,
      });

      expect(res.decision).toBe('RENEW_SAME_ROLE');
      expect(res.isRotation).toBe(false);
      expect(res.targetRoleId).toBe('ESTATE_MANAGER');
      expect(res.targetRoleName).toBe('Estate Manager');
      expect(res.newEffectiveFrom).toBe(renewalDate.toISOString());
      expect(res.newEffectiveTo).toBeTruthy();
    });

    it('evaluates role rotation (Estate Manager -> Committee Member)', () => {
      const rotationDate = new Date('2027-01-01T00:00:00.000Z');
      const res = evaluateRoleRenewalTransition({
        currentAssignment: mockEstateManagerAssignment,
        continueInGovernance: true,
        renewalRoleId: 'COMMITTEE_MEMBER',
        termDays: 365,
        effectiveDate: rotationDate,
      });

      expect(res.decision).toBe('ROTATE_NEW_ROLE');
      expect(res.isRotation).toBe(true);
      expect(res.targetRoleId).toBe('COMMITTEE_MEMBER');
      expect(res.targetRoleName).toBe('Committee Member');
    });

    it('evaluates exit from committee / non-renewal with retirement', () => {
      const exitDate = new Date('2026-12-31T23:59:59.000Z');
      const res = evaluateRoleRenewalTransition({
        currentAssignment: mockPresidentAssignment,
        continueInGovernance: false,
        effectiveDate: exitDate,
      });

      expect(res.decision).toBe('EXIT_GOVERNANCE');
      expect(res.isRotation).toBe(false);
      expect(res.newEffectiveTo).toBe(exitDate.toISOString());
    });
  });

  describe('Standard 11 Roles Catalog (7 RWA + 4 MSME)', () => {
    it('contains all 7 RWA roles including Estate Manager and 4 MSME roles', () => {
      const expectedRwaRoles = [
        'PRESIDENT',
        'VICE_PRESIDENT',
        'SECRETARY',
        'JOINT_SECRETARY',
        'TREASURER',
        'ESTATE_MANAGER',
        'COMMITTEE_MEMBER',
      ];

      const expectedMsmeRoles = ['PRIMARY_OWNER', 'MANAGER', 'MEMBER', 'DELEGATE'];

      for (const roleId of expectedRwaRoles) {
        const tmpl = STANDARD_GOVERNANCE_ROLE_TEMPLATES[roleId];
        expect(tmpl).toBeDefined();
        expect(tmpl!.roleCategory).toBe('RWA_GOVERNANCE');
        expect(tmpl!.defaultTermDays).toBe(365);
      }

      for (const roleId of expectedMsmeRoles) {
        const tmpl = STANDARD_GOVERNANCE_ROLE_TEMPLATES[roleId];
        expect(tmpl).toBeDefined();
        expect(tmpl!.roleCategory).toBe('MSME_MANAGEMENT');
      }

      // Check Estate Manager specific authorities
      const em = STANDARD_GOVERNANCE_ROLE_TEMPLATES.ESTATE_MANAGER;
      expect(em!.defaultAuthority.permissions).toContain('FACILITIES_MANAGEMENT');
      expect(em!.defaultAuthority.permissions).toContain('ISSUE_PO');
      expect(em!.defaultAuthority.canVote).toBe(false);
      expect(em!.defaultAuthority.spendCapAmount).toBe(500000);
    });
  });

  describe('Historical Audit Snapshots & Attribution', () => {
    it('generates immutable governance audit snapshot capturing role at time', () => {
      const audit = createGovernanceAuditSnapshot({
        actorPersonId: PERSON_DAVID_EM,
        actorPersonName: 'David Estate Manager',
        organizationId: ORG_RWA_ID,
        roleAssignment: mockEstateManagerAssignment,
        action: 'FACILITY_WORK_ORDER_RELEASE',
        entityType: 'work_order',
        entityId: 'wo-101',
        transactionId: 'txn-wo-1234',
        payload: { vendor: 'Elevator Corp', amount: 120000 },
        timestamp: new Date('2026-06-15T10:00:00Z'),
      });

      expect(audit.actorPersonId).toBe(PERSON_DAVID_EM);
      expect(audit.organizationId).toBe(ORG_RWA_ID);
      expect(audit.roleAtTime).toBe('Estate Manager');
      expect(audit.responsibilityAtTime).toBe('OPERATIONS');
      expect(audit.action).toBe('FACILITY_WORK_ORDER_RELEASE');
      expect(audit.entityId).toBe('wo-101');
      expect(audit.payload.amount).toBe(120000);
    });
  });
});
