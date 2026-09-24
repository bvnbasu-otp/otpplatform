import { describe, it, expect } from 'vitest';
import {
  MSME_CANONICAL_ROLES,
  MSME_BUSINESS_TYPES,
  MSME_RACI_MATRIX,
  evaluateMsmeStatutoryVerification,
  compileMsmeAgreementMarkdown,
  evaluateMsmeSpendDecisionState,
  verifyMsmeHistoricalRoleContinuity,
  verifyMsmeWalletGmvSegregation,
  type MsmeRegistrationAgreement,
} from './msme-governance';
import type { OrganizationDelegation } from './buyer-governance';

describe('MSME Spend Governance, RACI & Agreement Domain Engine', () => {
  describe('1. 4 Canonical Roles & RACI Matrix', () => {
    it('contains all 4 canonical MSME roles', () => {
      expect(MSME_CANONICAL_ROLES).toHaveLength(4);
      expect(MSME_CANONICAL_ROLES).toContain('PRIMARY');
      expect(MSME_CANONICAL_ROLES).toContain('MANAGER');
      expect(MSME_CANONICAL_ROLES).toContain('DELEGATE');
      expect(MSME_CANONICAL_ROLES).toContain('MEMBER');
    });

    it('contains all standard MSME business types', () => {
      expect(MSME_BUSINESS_TYPES).toContain('PROPRIETORSHIP');
      expect(MSME_BUSINESS_TYPES).toContain('PARTNERSHIP');
      expect(MSME_BUSINESS_TYPES).toContain('LLP');
      expect(MSME_BUSINESS_TYPES).toContain('PRIVATE_LIMITED');
      expect(MSME_BUSINESS_TYPES).toContain('PUBLIC_LIMITED');
    });

    it('enforces Primary accountability for spend approval and delegations', () => {
      expect(MSME_RACI_MATRIX.SPEND_APPROVAL.PRIMARY).toBe('ACCOUNTABLE');
      expect(MSME_RACI_MATRIX.CONFIGURE_DELEGATION.PRIMARY).toBe('ACCOUNTABLE');
      expect(MSME_RACI_MATRIX.APPOINT_MEMBERS.PRIMARY).toBe('ACCOUNTABLE');
    });

    it('enforces Manager and Delegate responsibility for intake drafting and quotation evaluation', () => {
      expect(MSME_RACI_MATRIX.INTAKE_DRAFT.MANAGER).toBe('RESPONSIBLE');
      expect(MSME_RACI_MATRIX.INTAKE_DRAFT.DELEGATE).toBe('RESPONSIBLE');
      expect(MSME_RACI_MATRIX.EVALUATE_QUOTES.MANAGER).toBe('RESPONSIBLE');
      expect(MSME_RACI_MATRIX.EVALUATE_QUOTES.DELEGATE).toBe('RESPONSIBLE');
    });

    it('enforces Member as Informed for spend signoffs with zero approval authority', () => {
      expect(MSME_RACI_MATRIX.SPEND_APPROVAL.MEMBER).toBe('INFORMED');
      expect(MSME_RACI_MATRIX.CONFIGURE_DELEGATION.MEMBER).toBe('INFORMED');
    });
  });

  describe('2. Truthful Statutory Verification (GSTIN & PAN)', () => {
    it('verifies valid GSTIN and returns legal entity name and registered address', () => {
      const res = evaluateMsmeStatutoryVerification({
        businessName: 'Apex Precision Engineering',
        gstin: '29AABCG7890K1Z2',
        businessType: 'PRIVATE_LIMITED',
        mockGstInfo: {
          gstin: '29AABCG7890K1Z2',
          legalName: 'Apex Precision Engineering Private Limited',
          tradeName: 'Apex Precision Tools',
          pan: 'AABCG7890K',
          status: 'ACTIVE',
          principalAddress: {
            line1: 'Plot 42, Peenya Industrial Area',
            city: 'Bengaluru',
            state: 'Karnataka',
            pincode: '560058',
          },
        },
      });

      expect(res.gstinStatus).toBe('VERIFIED');
      expect(res.legalEntityName).toBe('Apex Precision Engineering Private Limited');
      expect(res.tradeName).toBe('Apex Precision Tools');
      expect(res.registeredAddress?.city).toBe('Bengaluru');
      expect(res.isCompliantForRegistration).toBe(true);
      expect(res.source).toBe('LIVE_STATUTORY_API');
    });

    it('handles statutory provider unavailable truthfully without fabricating verification', () => {
      const res = evaluateMsmeStatutoryVerification({
        businessName: 'Apex Precision Engineering',
        gstin: '29AABCG7890K1Z2',
        providerAvailable: false,
      });

      expect(res.gstinStatus).toBe('UNAVAILABLE');
      expect(res.verificationMessage).toContain('temporarily unavailable');
      expect(res.isCompliantForRegistration).toBe(true);
      expect(res.source).toBe('OFFLINE_FALLBACK');
    });

    it('rejects invalid GSTIN format', () => {
      const res = evaluateMsmeStatutoryVerification({
        businessName: 'Invalid Tools',
        gstin: '29INVALID9999',
      });

      expect(res.gstinStatus).toBe('INVALID');
      expect(res.isCompliantForRegistration).toBe(false);
    });

    it('detects mismatch between provided PAN and embedded PAN inside GSTIN', () => {
      const res = evaluateMsmeStatutoryVerification({
        businessName: 'Mismatch Enterprise',
        gstin: '29AABCG7890K1Z2', // embedded PAN: AABCG7890K
        pan: 'AABCP9999P', // different PAN
      });

      expect(res.gstinStatus).toBe('MISMATCH');
      expect(res.panStatus).toBe('MISMATCH');
      expect(res.isCompliantForRegistration).toBe(false);
      expect(res.verificationMessage).toContain('does not match supplied PAN');
    });

    it('validates standalone PAN when GSTIN is not provided', () => {
      const res = evaluateMsmeStatutoryVerification({
        businessName: 'Sharma & Sons Trading',
        pan: 'AABCS1234K',
        businessType: 'PROPRIETORSHIP',
      });

      expect(res.panStatus).toBe('VERIFIED');
      expect(res.gstinStatus).toBe('NOT_PROVIDED');
      expect(res.isCompliantForRegistration).toBe(true);
    });
  });

  describe('3. MSME Organization Agreement & A4 Markdown Export', () => {
    it('compiles A4 markdown legal agreement with IT Act 2000 recitals', () => {
      const agreement: MsmeRegistrationAgreement = {
        organizationId: 'org-msme-apex-901',
        businessName: 'Apex Precision Engineering Private Limited',
        businessType: 'PRIVATE_LIMITED',
        gstin: '29AABCG7890K1Z2',
        pan: 'AABCG7890K',
        primaryOfficerName: 'Ramesh Sharma',
        primaryOfficerEmail: 'ramesh@apexprecision.in',
        primaryOfficerPhone: '+91 98765 43210',
        registeredAddress: 'Plot 42, Peenya Industrial Area, Bengaluru, Karnataka 560058',
        operationalAddress: 'Unit 2, Jigani Industrial Estate, Bengaluru, Karnataka 560105',
        acceptedAt: '2026-09-24T10:00:00.000Z',
        signerIpAddress: '103.21.124.5',
        electronicAcceptanceHash: 'SHA256:E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855',
        effectiveDate: '2026-09-24',
      };

      const markdown = compileMsmeAgreementMarkdown(agreement);
      expect(markdown).toContain('OTP MSME INSTITUTIONAL PROCUREMENT OS AGREEMENT');
      expect(markdown).toContain('Section 10A, Information Technology Act, 2000');
      expect(markdown).toContain('Apex Precision Engineering Private Limited');
      expect(markdown).toContain('Anti-Self-Approval Invariant (PA-09)');
      expect(markdown).toContain('0.50% (+ applicable 18% GST)');
      expect(markdown).toContain(agreement.electronicAcceptanceHash);
    });
  });

  describe('4. MSME Spend Decision State & Anti-Self-Approval (PA-09)', () => {
    it('strictly denies creator from approving their own RFQ even if they are Primary (Anti-Self-Approval)', () => {
      const res = evaluateMsmeSpendDecisionState({
        actorProfileId: 'usr-creator-001',
        actorRole: 'PRIMARY',
        rfqCreatorProfileId: 'usr-creator-001',
        procurementAmount: 150000,
      });

      expect(res.state).toBe('CANNOT_APPROVE_OWN_TRANSACTION');
      expect(res.canApprove).toBe(false);
      expect(res.badgeVariant).toBe('warning');
      expect(res.userMessage).toContain('cannot approve your own transaction');
    });

    it('allows Primary to approve third-party RFQ for any amount', () => {
      const res = evaluateMsmeSpendDecisionState({
        actorProfileId: 'usr-primary-002',
        actorRole: 'PRIMARY',
        rfqCreatorProfileId: 'usr-creator-001',
        procurementAmount: 15000000, // ₹1.5 Crore
      });

      expect(res.state).toBe('APPROVAL_REQUIRED_BY_YOU');
      expect(res.canApprove).toBe(true);
      expect(res.badgeVariant).toBe('urgent');
    });

    it('allows Manager to approve within spend cap', () => {
      const res = evaluateMsmeSpendDecisionState({
        actorProfileId: 'usr-mgr-003',
        actorRole: 'MANAGER',
        rfqCreatorProfileId: 'usr-creator-001',
        procurementAmount: 350000, // ₹3.5 Lakhs <= ₹5 Lakhs cap
        managerSpendCap: 500000,
      });

      expect(res.state).toBe('APPROVAL_REQUIRED_BY_YOU');
      expect(res.canApprove).toBe(true);
      expect(res.badgeVariant).toBe('urgent');
    });

    it('blocks Manager and flags waiting for Primary when amount exceeds manager cap', () => {
      const res = evaluateMsmeSpendDecisionState({
        actorProfileId: 'usr-mgr-003',
        actorRole: 'MANAGER',
        rfqCreatorProfileId: 'usr-creator-001',
        procurementAmount: 800000, // ₹8 Lakhs > ₹5 Lakhs cap
        managerSpendCap: 500000,
      });

      expect(res.state).toBe('AMOUNT_EXCEEDS_CAP');
      expect(res.canApprove).toBe(false);
      expect(res.requiresPrimary).toBe(true);
      expect(res.userMessage).toContain('Waiting for Primary sign-off');
    });

    it('evaluates active spend delegation proxy successfully within cap and validity window', () => {
      const now = new Date('2026-09-24T12:00:00Z');
      const delegation: OrganizationDelegation = {
        id: 'del-001',
        organizationId: 'org-msme-001',
        delegatorId: 'usr-primary-002',
        delegateeId: 'usr-delegate-004',
        permissions: ['APPROVE_TIER_1', 'APPROVE_TIER_2'],
        spendCapAmount: 1000000, // ₹10 Lakhs
        startsAt: '2026-09-01T00:00:00Z',
        expiresAt: '2026-09-30T23:59:59Z',
        isActive: true,
        createdAt: '2026-09-01T00:00:00Z',
      };

      const res = evaluateMsmeSpendDecisionState({
        actorProfileId: 'usr-delegate-004',
        actorRole: 'DELEGATE',
        rfqCreatorProfileId: 'usr-creator-001',
        procurementAmount: 750000,
        activeDelegation: delegation,
        currentTime: now,
      });

      expect(res.state).toBe('APPROVAL_REQUIRED_BY_YOU');
      expect(res.canApprove).toBe(true);
      expect(res.delegationId).toBe('del-001');
    });

    it('denies delegated approval when delegation is expired', () => {
      const past = new Date('2026-10-15T12:00:00Z');
      const delegation: OrganizationDelegation = {
        id: 'del-001',
        organizationId: 'org-msme-001',
        delegatorId: 'usr-primary-002',
        delegateeId: 'usr-delegate-004',
        permissions: ['APPROVE_TIER_1'],
        spendCapAmount: 1000000,
        startsAt: '2026-09-01T00:00:00Z',
        expiresAt: '2026-09-30T23:59:59Z', // Expired on Sep 30
        isActive: true,
        createdAt: '2026-09-01T00:00:00Z',
      };

      const res = evaluateMsmeSpendDecisionState({
        actorProfileId: 'usr-delegate-004',
        actorRole: 'DELEGATE',
        rfqCreatorProfileId: 'usr-creator-001',
        procurementAmount: 100000,
        activeDelegation: delegation,
        currentTime: past,
      });

      expect(res.state).toBe('DELEGATION_EXPIRED');
      expect(res.canApprove).toBe(false);
    });

    it('denies delegated approval when amount exceeds delegated spend cap', () => {
      const now = new Date('2026-09-24T12:00:00Z');
      const delegation: OrganizationDelegation = {
        id: 'del-001',
        organizationId: 'org-msme-001',
        delegatorId: 'usr-primary-002',
        delegateeId: 'usr-delegate-004',
        permissions: ['APPROVE_TIER_1'],
        spendCapAmount: 200000, // ₹2 Lakhs cap
        startsAt: '2026-09-01T00:00:00Z',
        expiresAt: '2026-09-30T23:59:59Z',
        isActive: true,
        createdAt: '2026-09-01T00:00:00Z',
      };

      const res = evaluateMsmeSpendDecisionState({
        actorProfileId: 'usr-delegate-004',
        actorRole: 'DELEGATE',
        rfqCreatorProfileId: 'usr-creator-001',
        procurementAmount: 450000, // ₹4.5 Lakhs
        activeDelegation: delegation,
        currentTime: now,
      });

      expect(res.state).toBe('AMOUNT_EXCEEDS_CAP');
      expect(res.canApprove).toBe(false);
      expect(res.userMessage).toContain('exceeds your delegated spend cap');
    });

    it('denies approval for basic team member with no delegation', () => {
      const res = evaluateMsmeSpendDecisionState({
        actorProfileId: 'usr-member-005',
        actorRole: 'MEMBER',
        rfqCreatorProfileId: 'usr-creator-001',
        procurementAmount: 100000,
      });

      expect(res.state).toBe('NO_APPROVAL_AUTHORITY');
      expect(res.canApprove).toBe(false);
    });
  });

  describe('5. Role Succession Immutability (Role != Person - PA-03)', () => {
    it('verifies that historical approvals remain immutably attributed to original actor Person A when Person B succeeds', () => {
      const auditResult = verifyMsmeHistoricalRoleContinuity({
        historicalAuditApproverId: 'usr-person-a-101',
        predecessorPersonId: 'usr-person-a-101',
        successorPersonId: 'usr-person-b-202',
      });

      expect(auditResult.preserved).toBe(true);
      expect(auditResult.message).toContain('PA-03 Compliant');
    });

    it('detects and flags illegal historical audit overwrite attempt', () => {
      const auditResult = verifyMsmeHistoricalRoleContinuity({
        historicalAuditApproverId: 'usr-person-b-202', // Wrongly rewritten to Person B
        predecessorPersonId: 'usr-person-a-101',
        successorPersonId: 'usr-person-b-202',
      });

      expect(auditResult.preserved).toBe(false);
      expect(auditResult.message).toContain('VIOLATION');
    });
  });

  describe('6. Wallet Credits & GMV Segregation', () => {
    it('prevents mixing non-cash platform rewards with bilateral procurement ledger', () => {
      const valid = verifyMsmeWalletGmvSegregation({
        walletBalanceCredits: 5000,
        poContractGmv: 250000,
        isAppliedToBilateralLedger: false,
      });
      expect(valid.isSegregated).toBe(true);

      const invalid = verifyMsmeWalletGmvSegregation({
        walletBalanceCredits: 5000,
        poContractGmv: 250000,
        isAppliedToBilateralLedger: true,
      });
      expect(invalid.isSegregated).toBe(false);
      expect(invalid.reason).toContain('VIOLATION');
    });
  });
});
