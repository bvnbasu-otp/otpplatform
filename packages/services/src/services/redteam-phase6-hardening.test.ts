import { beforeEach, describe, it, expect } from 'vitest';
import {
  validateLinearStepTransition,
  validateJournalLines,
  calculateTrialBalance,
  synthesizeReversalLines,
  type JournalLine,
  type LedgerAccount,
} from '@otp/domain';
import { InMemoryRepositories } from '../repositories/in-memory';
import { createOtpServices } from '../factory/create-otp-services';
import type { ActorContext } from '../types/actor-context';

const BUYER_ORG_ID = 'org-buyer-tenant-01';
const ATTACKER_ORG_ID = 'org-adversary-tenant-02';
const SUPPLIER_ID = 'sup-apex-01';

const BUYER_CREATOR: ActorContext = {
  profileId: 'usr-buyer-creator-01',
  organizationId: BUYER_ORG_ID,
  orgRole: 'BUYER',
};

const BUYER_MANAGER: ActorContext = {
  profileId: 'usr-buyer-manager-02',
  organizationId: BUYER_ORG_ID,
  orgRole: 'MANAGER',
};

const PLATFORM_ADMIN: ActorContext = {
  profileId: 'usr-platform-admin',
  isPlatformAdmin: true,
};

const ADVERSARY_ACTOR: ActorContext = {
  profileId: 'usr-attacker-01',
  organizationId: ATTACKER_ORG_ID,
  orgRole: 'BUYER',
};

describe('Phase 6 Red-Team Adversarial & Cross-Phase Hardening Suite', () => {
  let mem: InMemoryRepositories;
  let services: ReturnType<typeof createOtpServices>;

  beforeEach(() => {
    mem = InMemoryRepositories.create();
    mem.seedSupplier({
      id: SUPPLIER_ID,
      businessName: 'Apex Industrial Solutions Pvt Ltd',
      source: 'DIRECT',
      status: 'ACTIVE',
      categories: ['Industrial', 'Electrical'],
      gstin: '29AABCS1429B1ZX',
    });

    const repos = mem.asRepositories();
    services = createOtpServices(repos);
  });

  async function seedRfqAndQuote() {
    const repos = mem.asRepositories();
    const now = new Date().toISOString();

    const req = await repos.requirements.save({
      id: 'req-redteam-01',
      organizationId: BUYER_ORG_ID,
      createdBy: BUYER_CREATOR.profileId,
      requirementType: 'PROJECT',
      status: 'RFQ_CREATED',
      title: 'High Voltage Industrial Transformer Overhaul',
      createdAt: now,
      updatedAt: now,
    });

    const rfq = await repos.rfqs.save({
      id: 'rfq-redteam-01',
      requirementId: req.id,
      organizationId: BUYER_ORG_ID,
      status: 'EVALUATING',
      revealStatus: 'PROTECTED',
      title: req.title,
      buyerAnonymousToSuppliers: true,
      minQuotesRequired: 3,
      createdBy: BUYER_CREATOR.profileId,
      createdAt: now,
      updatedAt: now,
    });

    const quote = await repos.quotes.save({
      id: 'quote-redteam-01',
      rfqId: rfq.id,
      supplierId: SUPPLIER_ID,
      invitationId: 'inv-redteam-01',
      status: 'SUBMITTED',
      currentVersion: 1,
      createdAt: now,
      updatedAt: now,
    });

    return { req, rfq, quote };
  }

  describe('1. Adversarial Role & Multi-Tenant Organization Isolation', () => {
    it('blocks self-approval bypass when requirement creator attempts to approve their own RFQ', async () => {
      const { rfq } = await seedRfqAndQuote();

      await services.enterpriseApprovalMatrix.configurePolicy(PLATFORM_ADMIN, {
        organizationId: BUYER_ORG_ID,
        policyName: 'Strict Separation of Duties Policy',
        preventSelfApproval: true,
      });

      await services.enterpriseApprovalMatrix.initializeRfqStages(
        BUYER_CREATOR,
        rfq.id,
        250000
      );

      // Requirement creator attempts to sign off on their own stage 1
      await expect(
        services.enterpriseApprovalMatrix.submitTierDecision(BUYER_CREATOR, {
          rfqId: rfq.id,
          stageOrder: 1,
          decision: 'APPROVED',
        })
      ).rejects.toThrow(/Anti-bypass policy violation/);
    });

    it('blocks outsider from different tenant organization from approving RFQ stages', async () => {
      const { rfq } = await seedRfqAndQuote();

      await services.enterpriseApprovalMatrix.configurePolicy(PLATFORM_ADMIN, {
        organizationId: BUYER_ORG_ID,
        policyName: 'Standard Policy',
      });

      await services.enterpriseApprovalMatrix.initializeRfqStages(
        BUYER_CREATOR,
        rfq.id,
        150000
      );

      // Adversary from another organization attempts to approve
      await expect(
        services.enterpriseApprovalMatrix.submitTierDecision(ADVERSARY_ACTOR, {
          rfqId: rfq.id,
          stageOrder: 1,
          decision: 'APPROVED',
        })
      ).rejects.toThrow();
    });
  });

  describe('2. Early Reveal & Zero-Bias Barrier Hardening', () => {
    it('blocks unauthorized outsider from generating contracts or accessing unmasked credentials', async () => {
      const { rfq, quote } = await seedRfqAndQuote();

      await expect(
        services.contractOperations.generateContract(ADVERSARY_ACTOR, {
          procurementTitle: 'Malicious Contract Probe',
          buyerOrganizationId: BUYER_ORG_ID,
          supplierId: SUPPLIER_ID,
          quoteId: quote.id,
          rfqId: rfq.id,
          totalContractValue: 250000,
          currency: 'INR',
          gstinBuyer: '29ABCDE1234F1Z5',
          gstinSupplier: '29AABCS1429B1ZX',
          liquidatedDamagesClausePercentPerDay: 0.5,
          maxLiquidatedDamagesPercent: 10.0,
          disputeResolutionPeriodDays: 14,
          warrantyPeriodMonths: 12,
          milestones: [],
        })
      ).rejects.toThrow(/Access denied/);
    });
  });

  describe('3. Monotonic 15-Step Progression Invariants', () => {
    it('blocks illegal forward jumps in the procurement pipeline (e.g. Step 2 directly to Step 12)', () => {
      const invalidJump = validateLinearStepTransition(2, 12);
      expect(invalidJump.valid).toBe(false);
      expect(invalidJump.reason).toContain('Cannot jump');
    });

    it('permits strictly sequential +1 step progression across all 15 steps', () => {
      for (let s = 1; s < 15; s++) {
        const nextStep = (s + 1) as any;
        const result = validateLinearStepTransition(s as any, nextStep);
        expect(result.valid).toBe(true);
      }
    });

    it('permits read-only review of prior historical steps', () => {
      const historyReview = validateLinearStepTransition(8, 4);
      expect(historyReview.valid).toBe(true);
      expect(historyReview.reason).toContain('Read-only');
    });
  });

  describe('4. Financial Double-Entry Ledger Conservation Invariants', () => {
    it('strictly enforces total debit equals total credit (zero imbalance)', () => {
      const balancedLines: JournalLine[] = [
        {
          lineNumber: 1,
          accountId: 'acc-payable-01',
          accountCode: '2000',
          accountName: 'Trade Payables',
          debitAmount: 50000,
          creditAmount: 0,
        },
        {
          lineNumber: 2,
          accountId: 'acc-bank-01',
          accountCode: '1000',
          accountName: 'Escrow Current A/c',
          debitAmount: 0,
          creditAmount: 50000,
        },
      ];

      const validation = validateJournalLines(balancedLines);
      expect(validation.isValid).toBe(true);
      expect(validation.totalDebit).toBe(50000);
      expect(validation.totalCredit).toBe(50000);
      expect(validation.difference).toBe(0);
    });

    it('rejects unbalanced journal entries (financial leak protection)', () => {
      const fraudulentLines: JournalLine[] = [
        {
          lineNumber: 1,
          accountId: 'acc-payable-01',
          accountCode: '2000',
          accountName: 'Trade Payables',
          debitAmount: 50000,
          creditAmount: 0,
        },
        {
          lineNumber: 2,
          accountId: 'acc-bank-01',
          accountCode: '1000',
          accountName: 'Escrow Current A/c',
          debitAmount: 0,
          creditAmount: 40000, // 10,000 imbalance leak
        },
      ];

      const validation = validateJournalLines(fraudulentLines);
      expect(validation.isValid).toBe(false);
      expect(validation.errors.length).toBeGreaterThan(0);
      expect(validation.errors[0]).toContain('unbalanced');
    });

    it('preserves conservation of funds across multi-line trial balance calculations', () => {
      const accounts: LedgerAccount[] = [
        {
          id: 'acc-bank',
          organizationId: BUYER_ORG_ID,
          accountCode: '1000',
          accountName: 'Bank Account',
          classification: 'ASSET',
          subtype: 'BANK',
          currency: 'INR',
          status: 'ACTIVE',
          isSystemAccount: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: 'acc-capital',
          organizationId: BUYER_ORG_ID,
          accountCode: '3000',
          accountName: 'Capital Reserve',
          classification: 'EQUITY',
          subtype: 'CONTRA_ACCOUNT',
          currency: 'INR',
          status: 'ACTIVE',
          isSystemAccount: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];

      const lines: JournalLine[] = [
        {
          lineNumber: 1,
          accountId: 'acc-bank',
          accountCode: '1000',
          debitAmount: 100000,
          creditAmount: 0,
        },
        {
          lineNumber: 2,
          accountId: 'acc-capital',
          accountCode: '3000',
          debitAmount: 0,
          creditAmount: 100000,
        },
      ];

      const tb = calculateTrialBalance(BUYER_ORG_ID, accounts, lines);
      expect(tb.isBalanced).toBe(true);
      expect(tb.totalDebits).toBe(100000);
      expect(tb.totalCredits).toBe(100000);
      expect(tb.totalAssets).toBe(100000);
      expect(tb.totalEquity).toBe(100000);
    });

    it('synthesizes exact mirrored reversal lines without mathematical loss', () => {
      const originalLines: JournalLine[] = [
        {
          lineNumber: 1,
          accountId: 'acc-bank',
          debitAmount: 75000,
          creditAmount: 0,
        },
        {
          lineNumber: 2,
          accountId: 'acc-capital',
          debitAmount: 0,
          creditAmount: 75000,
        },
      ];

      const reversal = synthesizeReversalLines(originalLines);
      expect(reversal[0]?.debitAmount).toBe(0);
      expect(reversal[0]?.creditAmount).toBe(75000);
      expect(reversal[1]?.debitAmount).toBe(75000);
      expect(reversal[1]?.creditAmount).toBe(0);

      const reversalValidation = validateJournalLines(reversal);
      expect(reversalValidation.isValid).toBe(true);
    });
  });
});
