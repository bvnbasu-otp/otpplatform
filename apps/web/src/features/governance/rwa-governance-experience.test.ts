import { describe, it, expect } from 'vitest';
import {
  RWA_CANONICAL_ROLES,
  RWA_RACI_MATRIX,
  evaluateRwaStatutoryVerification,
  compileRwaAgreementMarkdown,
  evaluateRwaCommitteeRfqGate,
  verifyHistoricalRoleContinuity,
  STANDARD_GOVERNANCE_ROLE_TEMPLATES,
  type OrgRoleAssignment,
} from '@otp/domain';

describe('RWA Housing Society Governance Experience (Stage R2-05 Suite)', () => {
  describe('1. 7 Canonical Roles & RACI Structure', () => {
    it('defines all 7 canonical roles with strict operational vs committee separation', () => {
      expect(RWA_CANONICAL_ROLES).toEqual([
        'PRESIDENT',
        'VICE_PRESIDENT',
        'SECRETARY',
        'JOINT_SECRETARY',
        'TREASURER',
        'ESTATE_MANAGER',
        'COMMITTEE_MEMBER',
      ]);

      // Estate Manager canVote = false
      expect(STANDARD_GOVERNANCE_ROLE_TEMPLATES.ESTATE_MANAGER?.defaultAuthority.canVote).toBe(false);

      // President, Secretary, Treasurer canVote = true
      expect(STANDARD_GOVERNANCE_ROLE_TEMPLATES.PRESIDENT?.defaultAuthority.canVote).toBe(true);
      expect(STANDARD_GOVERNANCE_ROLE_TEMPLATES.SECRETARY?.defaultAuthority.canVote).toBe(true);
      expect(STANDARD_GOVERNANCE_ROLE_TEMPLATES.TREASURER?.defaultAuthority.canVote).toBe(true);
    });

    it('validates RACI matrix for Estate Manager across procurement lifecycle', () => {
      expect(RWA_RACI_MATRIX.INTAKE_DRAFT.ESTATE_MANAGER).toBe('RESPONSIBLE');
      expect(RWA_RACI_MATRIX.DISCOVER_INVITE.ESTATE_MANAGER).toBe('RESPONSIBLE');
      expect(RWA_RACI_MATRIX.COMMITTEE_VOTE.ESTATE_MANAGER).toBe('INFORMED');
      expect(RWA_RACI_MATRIX.AWARD_DECISION.ESTATE_MANAGER).toBe('INFORMED');
      expect(RWA_RACI_MATRIX.ISSUE_PO.ESTATE_MANAGER).toBe('RESPONSIBLE');
      expect(RWA_RACI_MATRIX.INSPECT_DELIVERY.ESTATE_MANAGER).toBe('RESPONSIBLE');
      expect(RWA_RACI_MATRIX.RELEASE_PAYMENT.ESTATE_MANAGER).toBe('INFORMED');
    });
  });

  describe('2. Truthful Statutory GSTIN & PAN Verification', () => {
    it('accurately verifies registered RWA GSTIN with address resolution', () => {
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
    });

    it('provides truthful fallback when verification provider is unreachable', () => {
      const res = evaluateRwaStatutoryVerification({
        societyName: 'Brigade Millennium Society',
        gstin: '29AABCG7890K1Z2',
        providerAvailable: false,
      });

      expect(res.gstinStatus).toBe('UNAVAILABLE');
      expect(res.verificationMessage).toContain('temporarily unavailable');
    });
  });

  describe('3. RWA Registration Agreement Acceptance & A4 Compilation', () => {
    it('compiles enforceable organization agreement markdown', () => {
      const md = compileRwaAgreementMarkdown({
        organizationName: 'Sobha City Flat Owners Welfare Association',
        authorizedOfficerName: 'Venkatesh Raghavan',
        authorizedOfficerRole: 'SECRETARY',
        effectiveDate: '2026-09-24T12:00:00Z',
        jurisdictionState: 'Karnataka',
        panOrGstin: '29AABCS1429B1ZX',
        acceptedElectronically: true,
        agreementReference: 'OTP-AGR-RWA-2026-0099',
      });

      expect(md).toContain('RWA PROCUREMENT PLATFORM ORGANIZATION AGREEMENT');
      expect(md).toContain('Sobha City Flat Owners Welfare Association');
      expect(md).toContain('Venkatesh Raghavan (SECRETARY)');
      expect(md).toContain('canVote = false');
      expect(md).toContain('365-day cycle');
    });
  });

  describe('4. Committee Governance RFQ Gate', () => {
    const makeAssignment = (roleId: any, personId: string, status: 'ACTIVE' | 'EXPIRED' = 'ACTIVE'): OrgRoleAssignment => ({
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

    it('blocks RFQ when committee is not formed', () => {
      const res = evaluateRwaCommitteeRfqGate({ roleAssignments: [] });
      expect(res.canCreateRfq).toBe(false);
      expect(res.reason).toContain('Complete your RWA committee setup');
    });

    it('allows RFQ when President and Secretary are active', () => {
      const pres = makeAssignment('PRESIDENT', 'p1');
      const sec = makeAssignment('SECRETARY', 'p2');
      const res = evaluateRwaCommitteeRfqGate({ roleAssignments: [pres, sec] });
      expect(res.canCreateRfq).toBe(true);
    });
  });

  describe('5. Role Succession & Historical Immutability', () => {
    it('verifies historical attribution remains with historical actor after succession', () => {
      const res = verifyHistoricalRoleContinuity({
        actionAuthorPersonId: 'person-ramesh-2025',
        actionTimestamp: '2025-08-10T10:00:00Z',
        currentRoleHolderPersonId: 'person-suresh-2026',
        historicalRoleHolderPersonId: 'person-ramesh-2025',
      });

      expect(res.isAttributedToOriginalActor).toBe(true);
    });
  });
});
