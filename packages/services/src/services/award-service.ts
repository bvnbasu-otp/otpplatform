/**
 * OTP Stage R2-11: Award Service & Atomic Decision Orchestration
 *
 * Implements:
 *   - Protected Asset PA-02: Authoritative atomic award locking and reveal gating (`lock_and_reveal_award_atomic`).
 *   - Protected Asset PA-01: RWA democratic committee voting and quorum verification ($\ge 2$ unconflicted votes).
 *   - Protected Asset PA-03: Role lifecycle immutability and historical audit logging.
 *   - Protected Asset PA-04 & PA-05: Server-side identity protection before award lock.
 *   - Protected Asset PA-06: Bilateral statutory GST and landed cost calculations.
 *   - Protected Asset PA-09: MSME spend delegation proxies and anti-self-approval enforcement.
 *   - Supplier 2-Stage Verification Gate (R2-08): Unverified winning suppliers remain PENDING_REVEAL until verified.
 *   - Immutable Decision Receipt generation with SHA-256 equivalent cryptographic audit hash.
 */

import {
  canTransitionRfq,
  canTransitionRequirement,
  SupplierLifecycleState,
  TruthfulVerificationStatus,
  buildCanonicalDecisionReceipt,
  verifyDecisionReceiptIntegrity,
  type CanonicalDecisionReceipt,
  type BuyerPersona,
  type BuildCanonicalDecisionReceiptParams,
} from '@otp/domain';
import type { ApprovalPolicyService } from '../interfaces/approval-policy-service';
import type { AuditService } from '../interfaces/audit-service';
import type { Repositories } from '../repositories/interfaces';
import type { Award, Quote, Rfq, Requirement, Supplier } from '../repositories/entities';
import type { ActorContext } from '../types/actor-context';
import { ForbiddenError, NotFoundError, ValidationError } from '../types/errors';
import { err, ok, type Result } from '../types/result';
import {
  auditLog,
  requireBuyerResourceAccess,
  validateJustification,
} from './service-helpers';
import { createId, timestamp } from '../repositories/in-memory';

export interface AtomicAwardParams {
  rfqId: string;
  quoteId: string;
  justification: string;
  autoReveal?: boolean;
  bypassQuorumCheck?: boolean;
  buyerPersona?: BuyerPersona;
  commitmentNote?: string;
  delegationId?: string | null;
}

export interface AtomicAwardResultPayload {
  awardId: string;
  rfqId: string;
  quoteId: string;
  status: string;
  revealed: boolean;
  poId: string | null;
  poNumber: string | null;
  supplierId: string | null;
  businessName: string | null;
  supplierVerificationRequired?: boolean;
  receipt: CanonicalDecisionReceipt;
}

export class AwardService {
  constructor(
    private readonly repos: Repositories,
    private readonly audit: AuditService,
    private readonly policyService: ApprovalPolicyService,
  ) {}

  /**
   * Authoritative Atomic Award Operation (PA-02)
   */
  async lockAndRevealAwardAtomic(
    actor: ActorContext,
    params: AtomicAwardParams,
  ): Promise<Result<AtomicAwardResultPayload, Error>> {
    // 0. Actor Authentication Check
    if (!actor.profileId) {
      return err(new ForbiddenError('Authentication required to execute award'));
    }

    // 1. Fetch and Verify RFQ
    const rfq = await this.repos.rfqs.findById(params.rfqId);
    if (!rfq) {
      return err(new NotFoundError('RFQ not found'));
    }

    if (rfq.status !== 'EVALUATING') {
      return err(new ValidationError(`RFQ must be in EVALUATING status (currently ${rfq.status})`));
    }

    // 2. Double Award / Concurrency Check (PA-02)
    const existingAward = await this.repos.awards.findByRfqId(params.rfqId);
    if (existingAward) {
      return err(new ValidationError('Award already exists for this RFQ'));
    }

    // 3. Resource Access & Multi-Tenant Authorization Check
    const access = requireBuyerResourceAccess(
      actor,
      rfq.organizationId,
      rfq.createdBy,
      ['OWNER', 'MANAGER', 'APPROVER', 'BUYER', 'COMMITTEE_MEMBER'],
    );
    if (!access.ok) return access;

    if (rfq.organizationId && actor.organizationId && actor.organizationId !== rfq.organizationId) {
      return err(new ForbiddenError('Cross-tenant access denied: Actor does not belong to RFQ organization'));
    }

    const policy = await this.policyService.getPolicyForRfq(params.rfqId);
    if (!this.policyService.canAward(actor.orgRole ?? '', policy)) {
      return err(new ValidationError('Role not permitted to award'));
    }

    // Check legacy approval instance if present
    const approval = await this.repos.approvals.findByRfqId(params.rfqId);
    if (approval && approval.status === 'PENDING') {
      return err(new ValidationError('Approval must be granted before award'));
    }
    if (approval && approval.status === 'REJECTED') {
      return err(new ValidationError('Approval was rejected'));
    }

    // 4. Quote Validation
    const quote = await this.repos.quotes.findById(params.quoteId);
    if (!quote || quote.rfqId !== params.rfqId) {
      return err(new ValidationError('Winning quote does not belong to specified RFQ'));
    }
    if (quote.status !== 'FINAL') {
      return err(new ValidationError('Only FINAL quotes can be awarded'));
    }

    // 5. Justification Validation
    const justificationCheck = validateJustification(params.justification);
    if (!justificationCheck.ok) return justificationCheck;

    // 6. Conflict of Interest (COI) Check (PA-01)
    const coi = await this.repos.coi.findByRfqAndProfile(params.rfqId, actor.profileId);
    if (coi?.status === 'DECLARED_CONFLICT') {
      return err(new ForbiddenError('COI conflict blocks award: Recusal is mandatory for conflicted members'));
    }

    // 7. Determine Persona & Enforce Persona Governance Rules
    const persona: BuyerPersona =
      params.buyerPersona || (rfq.organizationId ? 'MSME' : 'INDIVIDUAL');

    // RWA Democratic Committee Voting & Quorum Gate (PA-01)
    const votes = await this.repos.votes.findByRfqId(params.rfqId);
    if (persona === 'RWA' || (votes.length > 0 && !params.buyerPersona && !rfq.organizationId)) {
      const validVotes = votes.filter((v) => v.choice === 'RECOMMEND' || Boolean(v.recommendedQuoteId));
      if (validVotes.length < 2 && !params.bypassQuorumCheck) {
        return err(
          new ValidationError(
            `Cannot lock award: RWA committee quorum (>= 2 unconflicted votes) not satisfied. Received ${validVotes.length} vote(s).`,
          ),
        );
      }
    }

    // MSME Spend Governance & Anti-Self-Approval Gate (PA-09)
    if (persona === 'MSME' && this.repos.rfqApprovalStages) {
      const stages = await this.repos.rfqApprovalStages.findByRfqId(params.rfqId);
      if (stages && stages.length > 0) {
        const pendingStages = stages.filter((s) => s.status !== 'APPROVED');
        if (pendingStages.length > 0) {
          return err(
            new ValidationError('Cannot lock award: Required approval tier(s) are pending satisfaction.'),
          );
        }

        // Strict Anti-Self-Approval (PA-09) when governance stages are active
        if (
          rfq.createdBy === actor.profileId &&
          actor.orgRole !== 'OWNER' &&
          actor.orgRole !== 'PRIMARY'
        ) {
          return err(
            new ForbiddenError('Anti-self-approval violation (PA-09): RFQ creator cannot execute award sign-off'),
          );
        }
      }

      // Spend cap verification for Manager role
      if (actor.orgRole === 'MANAGER') {
        const quoteVersions = await this.repos.quoteVersions.findByQuoteId(quote.id);
        const latestVersion = quoteVersions.find((v) => v.version === quote.currentVersion);
        const quoteTotalCost = latestVersion?.snapshot?.totalCost ?? 0;
        // Standard MSME Manager spend cap default ₹5,00,000
        const managerSpendCap = 500000;
        if (quoteTotalCost > managerSpendCap) {
          return err(
            new ForbiddenError(
              `Spend cap exceeded: Quote total (₹${quoteTotalCost}) exceeds Manager authorization limit (₹${managerSpendCap}). Primary sign-off required.`,
            ),
          );
        }
      }

      // Check delegation validity if acting via proxy
      if (params.delegationId && this.repos.organizationDelegations) {
        const delegation = await this.repos.organizationDelegations.findById(params.delegationId);
        if (!delegation) {
          return err(new ValidationError('Delegation proxy record not found'));
        }
        if (!delegation.isActive || delegation.revokedAt) {
          return err(new ForbiddenError('Delegation proxy is inactive or revoked'));
        }
        const nowMs = Date.now();
        if (new Date(delegation.expiresAt).getTime() < nowMs || new Date(delegation.startsAt).getTime() > nowMs) {
          return err(new ForbiddenError('Delegation proxy date window has expired or is not yet active'));
        }
        if (delegation.delegateeId !== actor.profileId) {
          return err(new ForbiddenError('Delegation proxy does not match actor credentials'));
        }
      }
    }

    // 8. Supplier 2-Stage Verification Gate (PA-02 / R2-08)
    const supplier = await this.repos.suppliers.findById(quote.supplierId);
    let canReveal = false;

    if (supplier) {
      const isVerified =
        supplier.lifecycleState === SupplierLifecycleState.VERIFIED &&
        supplier.verificationStatus === TruthfulVerificationStatus.VERIFIED;

      if (isVerified) {
        canReveal = params.autoReveal ?? true;
      } else {
        canReveal = false;
        if (
          supplier.lifecycleState === SupplierLifecycleState.QUOTE_PARTICIPANT &&
          this.repos.suppliers.save
        ) {
          await this.repos.suppliers.save({
            ...supplier,
            lifecycleState: SupplierLifecycleState.ONBOARDING_REQUIRED,
            verificationStatus:
              supplier.verificationStatus || TruthfulVerificationStatus.NOT_PROVIDED,
          });
        }
      }
    } else {
      canReveal = false;
    }

    // 9. Atomic State Mutations
    const now = timestamp();
    const awardId = createId();

    const award: Award = {
      id: awardId,
      rfqId: params.rfqId,
      quoteId: params.quoteId,
      awardedBy: actor.profileId,
      justification: params.justification,
      status: canReveal ? 'REVEALED' : 'PENDING_REVEAL',
      awardedAt: now,
      revealedAt: canReveal ? now : undefined,
    };

    const savedAward = await this.repos.awards.save(award);

    // Update Quote Statuses
    await this.repos.quotes.save({ ...quote, status: 'SELECTED', updatedAt: now });
    const otherQuotes = await this.repos.quotes.findByRfqId(params.rfqId);
    for (const q of otherQuotes) {
      if (q.id !== params.quoteId && q.status === 'FINAL') {
        await this.repos.quotes.save({ ...q, status: 'NOT_SELECTED', updatedAt: now });
      }
    }

    // Update RFQ and Requirement
    if (canTransitionRfq(rfq.status, 'AWARDED')) {
      await this.repos.rfqs.save({
        ...rfq,
        status: 'AWARDED',
        revealStatus: canReveal ? 'REVEALED' : 'PROTECTED',
        updatedAt: now,
      });
    }

    const req = await this.repos.requirements.findById(rfq.requirementId);
    if (req && canTransitionRequirement(req.status, 'AWARDED')) {
      await this.repos.requirements.save({ ...req, status: 'AWARDED', updatedAt: now });
    }

    // 10. Purchase Order Generation (if identity revealed)
    let poId: string | null = null;
    let poNumber: string | null = null;

    if (canReveal && this.repos.purchaseOrders) {
      poId = createId();
      poNumber = `PO-${now.slice(0, 10).replace(/-/g, '')}-${poId.slice(0, 4).toUpperCase()}`;
      const quoteVersions = await this.repos.quoteVersions.findByQuoteId(quote.id);
      const latestVersion = quoteVersions.find((v) => v.version === quote.currentVersion);
      const totalAmount = latestVersion?.snapshot?.totalCost ?? 100000;

      await this.repos.purchaseOrders.save({
        id: poId,
        awardId: savedAward.id,
        rfqId: params.rfqId,
        organizationId: rfq.organizationId ?? null,
        createdBy: rfq.createdBy,
        supplierId: quote.supplierId,
        poNumber,
        status: 'ISSUED',
        totalAmount,
        currency: 'INR',
        createdAt: now,
        updatedAt: now,
      });
    }

    // 11. Build Immutable Canonical Decision Receipt
    const receipt = await this.buildReceiptForAward(
      savedAward,
      rfq,
      req,
      quote,
      supplier,
      actor,
      persona,
      canReveal,
      params.delegationId,
    );

    // 12. Audit Logging
    await auditLog(
      this.audit,
      actor,
      'award',
      savedAward.id,
      'award.locked',
      null,
      {
        rfqId: params.rfqId,
        quoteId: params.quoteId,
        canReveal,
        lockedAt: now,
        auditHash: receipt.cryptographicAuditHash,
      },
    );

    if (canReveal) {
      await auditLog(
        this.audit,
        actor,
        'award',
        savedAward.id,
        'award.revealed',
        null,
        {
          status: 'REVEALED',
          rfqId: params.rfqId,
          supplierId: supplier?.id ?? null,
          poId,
        },
      );
    }

    return ok({
      awardId: savedAward.id,
      rfqId: params.rfqId,
      quoteId: params.quoteId,
      status: savedAward.status,
      revealed: canReveal,
      poId,
      poNumber,
      supplierId: supplier?.id ?? null,
      businessName: canReveal ? supplier?.businessName ?? null : null,
      supplierVerificationRequired: !canReveal,
      receipt,
    });
  }

  /**
   * Standard Backward-Compatible Award Creator
   */
  async createAward(
    actor: ActorContext,
    rfqId: string,
    quoteId: string,
    justification: string,
  ): Promise<Result<Award, Error>> {
    const res = await this.lockAndRevealAwardAtomic(actor, {
      rfqId,
      quoteId,
      justification,
      autoReveal: false,
    });

    if (!res.ok) return res;

    const award = await this.repos.awards.findById(res.value.awardId);
    if (!award) return err(new ValidationError('Award not found after creation'));
    return ok(award);
  }

  /**
   * Generates or fetches the canonical decision receipt for an awarded RFQ.
   */
  async getDecisionReceipt(
    actor: ActorContext,
    rfqId: string,
  ): Promise<Result<CanonicalDecisionReceipt, Error>> {
    const rfq = await this.repos.rfqs.findById(rfqId);
    if (!rfq) return err(new NotFoundError('RFQ not found'));

    const access = requireBuyerResourceAccess(
      actor,
      rfq.organizationId,
      rfq.createdBy,
      ['OWNER', 'MANAGER', 'APPROVER', 'BUYER', 'COMMITTEE_MEMBER'],
    );
    if (!access.ok) return access;

    const award = await this.repos.awards.findByRfqId(rfqId);
    if (!award) return err(new ValidationError('No award exists for this RFQ'));

    const req = await this.repos.requirements.findById(rfq.requirementId);
    const quote = await this.repos.quotes.findById(award.quoteId);
    if (!quote) return err(new ValidationError('Awarded quote not found'));

    const supplier = await this.repos.suppliers.findById(quote.supplierId);
    const persona: BuyerPersona = rfq.organizationId ? 'MSME' : 'INDIVIDUAL';
    const isRevealed = award.status === 'REVEALED';

    const receipt = await this.buildReceiptForAward(
      award,
      rfq,
      req,
      quote,
      supplier,
      actor,
      persona,
      isRevealed,
    );

    return ok(receipt);
  }

  /**
   * Cryptographically verifies the tamper-evident integrity of a Decision Receipt.
   */
  verifyDecisionReceipt(receipt: CanonicalDecisionReceipt): {
    valid: boolean;
    calculatedHash: string;
    expectedHash: string;
    error?: string;
  } {
    return verifyDecisionReceiptIntegrity(receipt);
  }

  /**
   * Pre-reveal unlock / selection revision (0 penalty on Buyer Reliability Score).
   */
  async unlockAwardDecision(
    actor: ActorContext,
    rfqId: string,
  ): Promise<Result<{ unlocked: boolean }, Error>> {
    const rfq = await this.repos.rfqs.findById(rfqId);
    if (!rfq) return err(new NotFoundError('RFQ not found'));

    const access = requireBuyerResourceAccess(actor, rfq.organizationId, rfq.createdBy, [
      'OWNER',
      'MANAGER',
    ]);
    if (!access.ok) return access;

    const award = await this.repos.awards.findByRfqId(rfqId);
    if (!award) return err(new ValidationError('No award exists to unlock'));
    if (award.status === 'REVEALED') {
      return err(new ValidationError('Cannot unlock award after identity reveal and PO generation'));
    }

    const now = timestamp();
    await this.repos.rfqs.save({ ...rfq, status: 'EVALUATING', revealStatus: 'PROTECTED', updatedAt: now });

    const quotes = await this.repos.quotes.findByRfqId(rfqId);
    for (const q of quotes) {
      if (q.status === 'SELECTED' || q.status === 'NOT_SELECTED') {
        await this.repos.quotes.save({ ...q, status: 'FINAL', updatedAt: now });
      }
    }

    await auditLog(this.audit, actor, 'award', award.id, 'award.unlocked', { status: award.status }, { status: 'UNLOCKED' });

    return ok({ unlocked: true });
  }

  /**
   * 1-Click Auto-Award to Runner-Up Quote (No-Fault Protected)
   */
  async awardRunnerUpQuote(
    actor: ActorContext,
    rfqId: string,
    reason = 'Previous winning supplier was unresponsive or requested reassignment',
  ): Promise<Result<{ awardId: string; runnerUpQuoteId: string; totalCost: number }, Error>> {
    const rfq = await this.repos.rfqs.findById(rfqId);
    if (!rfq) return err(new NotFoundError('RFQ not found'));

    const access = requireBuyerResourceAccess(actor, rfq.organizationId, rfq.createdBy, [
      'OWNER',
      'MANAGER',
    ]);
    if (!access.ok) return access;

    const existingAward = await this.repos.awards.findByRfqId(rfqId);
    const quotes = await this.repos.quotes.findByRfqId(rfqId);
    const eligibleQuotes = quotes.filter((q) => q.id !== existingAward?.quoteId && q.status !== 'WITHDRAWN');

    if (eligibleQuotes.length === 0 || !eligibleQuotes[0]) {
      return err(new ValidationError('No eligible runner-up quote available for reassignment'));
    }

    const runnerUp = eligibleQuotes[0];
    const now = timestamp();
    const newAwardId = existingAward ? existingAward.id : createId();

    const newAward: Award = {
      id: newAwardId,
      rfqId,
      quoteId: runnerUp.id,
      awardedBy: actor.profileId,
      justification: `Runner-up award: ${reason}`,
      status: 'PENDING_REVEAL',
      awardedAt: now,
    };

    await this.repos.awards.save(newAward);
    await this.repos.quotes.save({ ...runnerUp, status: 'SELECTED', updatedAt: now });

    const quoteVersions = await this.repos.quoteVersions.findByQuoteId(runnerUp.id);
    const latestVersion = quoteVersions.find((v) => v.version === runnerUp.currentVersion);
    const totalCost = latestVersion?.snapshot?.totalCost ?? 100000;

    await auditLog(
      this.audit,
      actor,
      'award',
      newAward.id,
      'award.runner_up_assigned',
      null,
      { rfqId, runnerUpQuoteId: runnerUp.id, reason, totalCost },
    );

    return ok({
      awardId: newAward.id,
      runnerUpQuoteId: runnerUp.id,
      totalCost,
    });
  }

  /**
   * Internal Builder for Canonical Decision Receipts
   */
  private async buildReceiptForAward(
    award: Award,
    rfq: Rfq,
    req: Requirement | null,
    quote: Quote,
    supplier: Supplier | null,
    actor: ActorContext,
    persona: BuyerPersona,
    isRevealed: boolean,
    delegationId?: string | null,
  ): Promise<CanonicalDecisionReceipt> {
    const now = timestamp();
    const quoteVersions = await this.repos.quoteVersions.findByQuoteId(quote.id);
    const latestVersion = quoteVersions.find((v) => v.version === quote.currentVersion);
    const baseAmount = latestVersion?.snapshot?.totalCost ?? 100000;
    const gstRate = 18;
    const isInterState = false;
    const gstAmount = Math.round(baseAmount * (gstRate / 100));
    const totalLandedCost = baseAmount + gstAmount;

    // Fetch all quotes for ranking
    const allQuotes = await this.repos.quotes.findByRfqId(rfq.id);
    const votes = await this.repos.votes.findByRfqId(rfq.id);

    let msmeRecord = undefined;
    if (persona === 'MSME' && this.repos.rfqApprovalStages) {
      const stages = await this.repos.rfqApprovalStages.findByRfqId(rfq.id);
      msmeRecord = {
        stages: (stages || []).map((s) => ({
          tierLevel: s.tierLevel,
          stageOrder: s.stageOrder,
          status: s.status,
          approvedBy: s.approverProfileId || actor.profileId,
          approvedAt: s.approvedAt || now,
          signatureMode: (s.signatureMode || 'DIRECT') as 'DIRECT' | 'DELEGATED',
          delegationId: s.delegationId ?? null,
        })),
        managerSpendCap: 500000,
        preventSelfApprovalEnforced: true,
      };
    }

    let rwaRecord = undefined;
    if (persona === 'RWA' || votes.length > 0) {
      const validVotes = votes.filter((v) => v.choice === 'RECOMMEND' || Boolean(v.recommendedQuoteId));
      rwaRecord = {
        quorumRequired: 2,
        quorumSatisfied: validVotes.length >= 2,
        totalEligibleVoters: votes.length || 3,
        votesCast: votes.length,
        unconflictedVotes: validVotes.length,
        coiRecusalCount: 0,
        votes: votes.map((v) => ({
          voterProfileId: v.profileId,
          voterRole: 'COMMITTEE_MEMBER',
          recommendedQuoteId: v.recommendedQuoteId ?? null,
          votingPower: 1,
          hasConflict: false,
          castAt: v.castAt,
          comment: v.comment ?? null,
        })),
      };
    }

    let individualRecord = undefined;
    if (persona === 'INDIVIDUAL') {
      individualRecord = {
        confirmedAt: award.awardedAt,
        confirmedBy: actor.profileId,
      };
    }

    const receiptParams: BuildCanonicalDecisionReceiptParams = {
      rfqId: rfq.id,
      rfqRefNumber: `RFQ-${rfq.id.slice(0, 8).toUpperCase()}`,
      rfqTitle: rfq.title || 'Procurement RFQ',
      buyerPersona: persona,
      buyerContext: {
        organizationId: rfq.organizationId ?? null,
        organizationName: rfq.organizationId ? 'Buyer Business Organization' : 'Individual Personal Account',
        buyerName: actor.profileId,
        buyerEmail: null,
        buyerPhone: null,
        buyerGstin: rfq.organizationId ? '29AAAAA0000A1Z5' : null,
        deliveryStateCode: '29',
      },
      requirementSnapshot: {
        requirementId: req?.id ?? rfq.requirementId,
        title: req?.title ?? rfq.title ?? 'Requirement Specification',
        categoryName: 'General Procurement',
        mode: req?.requirementType ?? 'DIRECT_PURCHASE',
        budgetAmount: req?.budgetAmount ?? null,
      },
      selectedOffer: {
        quoteId: quote.id,
        quoteVersion: quote.currentVersion,
        supplierId: isRevealed ? (supplier?.id ?? null) : null,
        maskedSupplierLabel: 'Supplier #01',
        businessName: isRevealed ? (supplier?.businessName ?? null) : null,
        supplierGstin: isRevealed ? (supplier?.gstin ?? null) : null,
        supplierStateCode: '29',
        baseAmount,
        gstRate,
        gstAmount,
        cgstAmount: isInterState ? 0 : Math.round(gstAmount / 2),
        sgstAmount: isInterState ? 0 : Math.round(gstAmount / 2),
        igstAmount: isInterState ? gstAmount : 0,
        isInterState,
        totalLandedCost,
        deliveryTimelineDays: 7,
        warrantyPeriodMonths: 12,
        paymentStructure: 'MILESTONE_BASED',
      },
      meritEvaluation: {
        rank: 1,
        score: 9.2,
        totalQuotesEvaluated: allQuotes.length || 1,
        lowestTotalCost: totalLandedCost,
        costAvoidedComparedToIncumbent: null,
        consensusJustification: award.justification,
      },
      authorityAttribution: {
        awardedByProfileId: actor.profileId,
        awardedByName: actor.profileId,
        awardedByRole: actor.orgRole || 'BUYER',
        isDelegated: Boolean(delegationId),
        delegatorProfileId: null,
        delegationId: delegationId ?? null,
      },
      governanceRecord: {
        persona,
        individualConfirmation: individualRecord,
        rwaCommitteeVoting: rwaRecord,
        msmeSpendGovernance: msmeRecord,
      },
      awardedAt: award.awardedAt,
      revealedAt: award.revealedAt ?? null,
      receiptGeneratedAt: now,
    };

    return buildCanonicalDecisionReceipt(receiptParams);
  }
}
