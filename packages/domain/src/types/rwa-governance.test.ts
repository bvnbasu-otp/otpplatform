import { describe, it, expect } from 'vitest';
import {
  RWA_CANONICAL_ROLES,
  RWA_RACI_MATRIX,
  evaluateRwaStatutoryVerification,
  compileRwaAgreementMarkdown,
  evaluateRwaCommitteeRfqGate,
  verifyHistoricalRoleContinuity,
  type RwaCanonicalRole,
  type RwaRegistrationAgreement,
} from './rwa-governance';
import { STANDARD_GOVERNANCE_ROLE_TEMPLATES, type OrgRoleAssignment } from './org-role-lifecycle';

describe('RWA Housing Society Governance, RACI & Agreement Domain Engine', () => {
  describe('1. 7 Canonical Roles & RACI Matrix', () => {
    it('contains all 7 canonical RWA roles', () => {
      expect(RWA_CANONICAL_ROLES).toHaveLength(7);
      expect(RWA_CANONICAL_ROLES).toContain('PRESIDENT');
      expect(RWA_CANONICAL_ROLES).toContain('VICE_PRESIDENT');
      expect(RWA_CANONICAL_ROLES).toContain('SECRETARY');
      expect(RWA_CANONICAL_ROLES).toContain('JOINT_SECRETARY');
      expect(RWA_CANONICAL_ROLES).toContain('TREASURER');
      expect(RWA_CANONICAL_ROLES).toContain('ESTATE_MANAGER');
      expect(RWA_CANONICAL_ROLES).toContain('COMMITTEE_MEMBER');
    });

    it('enforces Estate Manager canVote = false in standard template and INFORMED in committee vote', () => {
      const emTemplate = STANDARD_GOVERNANCE_ROLE_TEMPLATES.ESTATE_MANAGER;
      expect(emTemplate).toBeDefined();
      expect(emTemplate?.defaultAuthority.canVote).toBe(false);

      const voteRaci = RWA_RACI_MATRIX.COMMITTEE_VOTE;
      expect(voteRaci.ESTATE_MANAGER).toBe('INFORMED');
      expect(voteRaci.PRESIDENT).toBe('ACCOUNTABLE');
      expect(voteRaci.SECRETARY).toBe('RESPONSIBLE');
      expect(voteRaci.TREASURER).toBe('RESPONSIBLE');
    });

    it('enforces Estate Manager responsibility for Intake drafting & Delivery inspection', () => {
      expect(RWA_RACI_MATRIX.INTAKE_DRAFT.ESTATE_MANAGER).toBe('RESPONSIBLE');
      expect(RWA_RACI_MATRIX.INSPECT_DELIVERY.ESTATE_MANAGER).toBe('RESPONSIBLE');
      expect(RWA_RACI_MATRIX.ISSUE_PO.ESTATE_MANAGER).toBe('RESPONSIBLE');
    });
  });

  describe('2. Truthful Statutory Verification (GSTIN & PAN)', () => {
    it('verifies valid GSTIN and returns legal name and registered address', () => {
      const res = evaluateRwaStatutoryVerification({
        societyName: 'Greenview Heights RWA',
        gstin: '29AABCG7890K1Z2',
        mockGstInfo: {
          gstin: '29AABCG7890K1Z2',
          legalName: 'Greenview Heights Apartment Owners Association',
          pan: 'AABCG7890K',
          status: 'ACTIVE',
          principalAddress: {
            line1: 'Greenview Heights Campus, 4th Cross',
            city: 'Bengaluru',
            state: 'Karnataka',
            pincode: '560034',
          },
        },
      });

      expect(res.gstinStatus).toBe('VERIFIED');
      expect(res.legalEntityName).toBe('Greenview Heights Apartment Owners Association');
      expect(res.registeredAddress?.city).toBe('Bengaluru');
      expect(res.isCompliantForRegistration).toBe(true);
    });

    it('handles provider unavailable truthfully without fabricating success', () => {
      const res = evaluateRwaStatutoryVerification({
        societyName: 'Palm Meadows Society',
        gstin: '29AABCG7890K1Z2',
        providerAvailable: false,
      });

      expect(res.gstinStatus).toBe('UNAVAILABLE');
      expect(res.verificationMessage).toContain('temporarily unavailable');
      expect(res.isCompliantForRegistration).toBe(true);
    });

    it('flags invalid GSTIN format', () => {
      const res = evaluateRwaStatutoryVerification({
        societyName: 'Invalid Society',
        gstin: '29INVALIDGSTIN99',
      });

      expect(res.gstinStatus).toBe('INVALID');
      expect(res.isCompliantForRegistration).toBe(false);
    });

    it('detects mismatch between provided PAN and PAN inside GSTIN', () => {
      const res = evaluateRwaStatutoryVerification({
        societyName: 'Mismatch Society',
        gstin: '29AABCG7890K1Z2', // embedded PAN: AABCG7890K
        pan: 'AABCP9999P', // different PAN
      });

      expect(res.panStatus).toBe('INVALID');
      expect(res.verificationMessage).toContain('does not match PAN in GSTIN');
      expect(res.isCompliantForRegistration).toBe(false);
    });
  });

  describe('3. RWA Registration Agreement & A4 Markdown Compilation', () => {
    it('generates complete A4 printable agreement with electronic acceptance', () => {
      const agreement: RwaRegistrationAgreement = {
        organizationName: 'Sobha Forestview Apartment Owners Association',
        authorizedOfficerName: 'Ramesh Sundaram',
        authorizedOfficerRole: 'PRESIDENT',
        effectiveDate: '2026-09-24T10:00:00Z',
        jurisdictionState: 'Karnataka',
        panOrGstin: '29AABCS1429B1ZX',
        acceptedElectronically: true,
        acceptedAt: '2026-09-24T10:05:00Z',
        agreementReference: 'OTP-AGR-RWA-2026-0042',
      };

      const md = compileRwaAgreementMarkdown(agreement);
      expect(md).toContain('RWA PROCUREMENT PLATFORM ORGANIZATION AGREEMENT');
      expect(md).toContain('Sobha Forestview Apartment Owners Association');
      expect(md).toContain('Ramesh Sundaram (PRESIDENT)');
      expect(md).toContain('OTP-AGR-RWA-2026-0042');
      expect(md).toContain('canVote = false');
      expect(md).toContain('365-day cycle');
      expect(md).toContain('Indian Information Technology Act, 2000');
    });
  });

  describe('4. Committee Governance RFQ Gate', () => {
    const baseDate = new Date('2026-09-24T10:00:00Z');

    const makeAssignment = (roleId: RwaCanonicalRole, personId: string, status: 'ACTIVE' | 'EXPIRED' = 'ACTIVE'): OrgRoleAssignment => ({
      id: `assign-${roleId}-${personId}`,
      organizationId: 'org-rwa-100',
      personId,
      roleId,
      roleName: roleId,
      roleCategory: 'RWA_GOVERNANCE',
      responsibilityScope: 'EXECUTIVE',
      authorityScope: { permissions: ['READ', 'VOTE'] },
      effectiveFrom: '2026-01-01T00:00:00Z',
      effectiveTo: status === 'ACTIVE' ? '2026-12-31T23:59:59Z' : '2026-06-01T00:00:00Z',
      termDurationDays: 365,
      status,
      appointmentEvent: 'ELECTION',
      createdAt: '2026-01-01T00:00:00Z',
    });

    it('blocks RFQ creation when committee has no members', () => {
      const gate = evaluateRwaCommitteeRfqGate({
        roleAssignments: [],
        currentTime: baseDate,
      });

      expect(gate.canCreateRfq).toBe(false);
      expect(gate.reason).toContain('Complete your RWA committee setup before starting procurement');
      expect(gate.missingRequirements.length).toBeGreaterThan(0);
    });

    it('blocks RFQ creation when only Estate Manager is assigned without executive committee officers', () => {
      const em = makeAssignment('ESTATE_MANAGER', 'person-em-1');
      const gate = evaluateRwaCommitteeRfqGate({
        roleAssignments: [em],
        currentTime: baseDate,
      });

      expect(gate.canCreateRfq).toBe(false);
      expect(gate.hasExecutiveLead).toBe(false);
      expect(gate.missingRequirements).toContain('An active President or Secretary is required for committee governance oversight.');
    });

    it('permits RFQ creation when President + Secretary are active', () => {
      const pres = makeAssignment('PRESIDENT', 'person-pres-1');
      const sec = makeAssignment('SECRETARY', 'person-sec-2');
      const gate = evaluateRwaCommitteeRfqGate({
        roleAssignments: [pres, sec],
        currentTime: baseDate,
      });

      expect(gate.canCreateRfq).toBe(true);
      expect(gate.hasExecutiveLead).toBe(true);
      expect(gate.activeOfficerCount).toBe(2);
    });

    it('blocks RFQ creation when roles are expired', () => {
      const expiredPres = makeAssignment('PRESIDENT', 'person-pres-1', 'EXPIRED');
      const expiredSec = makeAssignment('SECRETARY', 'person-sec-2', 'EXPIRED');
      const gate = evaluateRwaCommitteeRfqGate({
        roleAssignments: [expiredPres, expiredSec],
        currentTime: baseDate,
      });

      expect(gate.canCreateRfq).toBe(false);
      expect(gate.activeOfficerCount).toBe(0);
    });
  });

  describe('5. Role Succession & Historical Attribution Continuity', () => {
    it('maintains historical attribution immutably for Person A when Person B takes office', () => {
      const check = verifyHistoricalRoleContinuity({
        actionAuthorPersonId: 'person-alice-2025-pres',
        actionTimestamp: '2025-06-15T14:30:00Z',
        currentRoleHolderPersonId: 'person-bob-2026-pres',
        historicalRoleHolderPersonId: 'person-alice-2025-pres',
      });

      expect(check.isAttributedToOriginalActor).toBe(true);
      expect(check.message).toContain('immutably attributed to historical officer (person-alice-2025-pres)');
    });
  });
});
