import {
  SupplierDiscoveryLifecycleTier,
  SupplierLifecycleState,
  TruthfulVerificationStatus,
  evaluateSupplierDiscoveryTier,
  validateDiscoveryTierTransition,
  assertMonotonicTierTransition,
  IllegalLifecycleTransitionError,
  evaluateSupplierClaimMatch,
  evaluateStage1OtpVerification,
  evaluateStage2GstVerification,
  createSupplierTransactionSnapshot,
  evaluateSupplierAwardEligibility,
  type SupplierDiscoveryCandidateInput,
  type SupplierDiscoveryTierEvaluation,
  type SupplierClaimInput,
  type SupplierClaimMatchEvaluation,
  type Stage1OtpVerificationInput,
  type Stage1OtpVerificationResult,
  type Stage2GstVerificationInput,
  type Stage2GstVerificationResult,
  type SupplierAwardEligibility,
  type SupplierTransactionSnapshot,
  type SupplierTierCapabilities,
  getSupplierTierCapabilities,
} from '@otp/domain';
import type { AuditService } from '../interfaces/audit-service';
import type { Repositories } from '../repositories/interfaces';
import type { Supplier, Quote, QuoteVersion } from '../repositories/entities';
import type { ActorContext } from '../types/actor-context';
import { ForbiddenError, NotFoundError, ValidationError } from '../types/errors';
import { err, ok, type Result } from '../types/result';
import { auditLog } from './service-helpers';
import { createId, timestamp } from '../repositories/in-memory';

export interface MagicLinkQuoteTokenSession {
  sessionToken: string;
  rfqId: string;
  supplierId: string;
  expiresAt: string;
  isRedeemed: boolean;
}

export class SupplierLifecycleService {
  private readonly magicLinkSessions = new Map<string, MagicLinkQuoteTokenSession>();
  private readonly magicLinkTokens = new Map<
    string,
    { rfqId: string; supplierId: string; expiresAt: string; redeemed: boolean }
  >();

  constructor(
    private readonly repos: Repositories,
    private readonly audit: AuditService,
  ) {}

  /**
   * Evaluates the truthful 5-tier lifecycle status of a supplier candidate.
   */
  evaluateCandidateTier(
    input: SupplierDiscoveryCandidateInput,
  ): Result<SupplierDiscoveryTierEvaluation, Error> {
    const evaluation = evaluateSupplierDiscoveryTier(input);
    return ok(evaluation);
  }

  /**
   * Retrieves discrete capabilities for a given tier.
   */
  getTierCapabilities(
    tier: SupplierDiscoveryLifecycleTier,
  ): Result<SupplierTierCapabilities, Error> {
    try {
      const caps = getSupplierTierCapabilities(tier);
      return ok(caps);
    } catch (e: any) {
      return err(new ValidationError(e.message));
    }
  }

  /**
   * Monotonic Lifecycle Transition Engine.
   * Progresses a supplier across the 5 canonical tiers. Backward transitions are strictly blocked.
   */
  async transitionLifecycleTier(
    actor: ActorContext,
    supplierId: string,
    targetTier: SupplierDiscoveryLifecycleTier,
    justification?: string,
  ): Promise<
    Result<
      {
        supplier: Supplier;
        previousTier: SupplierDiscoveryLifecycleTier;
        currentTier: SupplierDiscoveryLifecycleTier;
      },
      Error
    >
  > {
    const supplier = await this.repos.suppliers.findById(supplierId);
    if (!supplier) return err(new NotFoundError('Supplier not found'));

    // Determine current tier from supplier state
    const currentEvaluation = evaluateSupplierDiscoveryTier({
      supplierId: supplier.id,
      businessName: supplier.businessName,
      phone: supplier.contactPhone,
      email: supplier.contactEmail,
      gstin: supplier.gstin,
      pan: supplier.pan,
      isOtpRegistered: supplier.lifecycleState !== SupplierLifecycleState.QUOTE_PARTICIPANT,
      isOtpVerified: supplier.verificationStatus === TruthfulVerificationStatus.VERIFIED || supplier.verificationStatus === 'PLATFORM_VERIFIED',
      isGstVerified: Boolean(supplier.gstin && supplier.verificationStatus === TruthfulVerificationStatus.VERIFIED),
    });

    const currentTier = currentEvaluation.tier;

    // Check monotonic rule
    const transitionCheck = validateDiscoveryTierTransition(currentTier, targetTier);
    if (!transitionCheck.valid) {
      return err(
        new ValidationError(
          transitionCheck.reason ||
            `Illegal lifecycle transition from ${currentTier} to ${targetTier}. Monotonic progression enforced.`,
        ),
      );
    }

    // Map target tier to repository fields
    let updatedLifecycleState: SupplierLifecycleState = supplier.lifecycleState as SupplierLifecycleState;
    let updatedVerificationStatus: TruthfulVerificationStatus = supplier.verificationStatus as TruthfulVerificationStatus;

    if (targetTier === SupplierDiscoveryLifecycleTier.GST_VERIFIED) {
      updatedLifecycleState = SupplierLifecycleState.VERIFIED;
      updatedVerificationStatus = TruthfulVerificationStatus.VERIFIED;
    } else if (targetTier === SupplierDiscoveryLifecycleTier.OTP_VERIFIED) {
      updatedLifecycleState = SupplierLifecycleState.VERIFIED;
      updatedVerificationStatus = TruthfulVerificationStatus.VERIFIED;
    } else if (targetTier === SupplierDiscoveryLifecycleTier.OTP_REGISTERED) {
      if (supplier.lifecycleState === SupplierLifecycleState.QUOTE_PARTICIPANT) {
        updatedLifecycleState = SupplierLifecycleState.ONBOARDING_REQUIRED;
      }
    }

    const now = timestamp();
    const updatedSupplier: Supplier = {
      ...supplier,
      lifecycleState: updatedLifecycleState,
      verificationStatus: updatedVerificationStatus,
      status: targetTier === SupplierDiscoveryLifecycleTier.GST_VERIFIED || targetTier === SupplierDiscoveryLifecycleTier.OTP_VERIFIED ? 'ACTIVE' : supplier.status,
      verifiedAt: targetTier === SupplierDiscoveryLifecycleTier.GST_VERIFIED || targetTier === SupplierDiscoveryLifecycleTier.OTP_VERIFIED ? now : supplier.verifiedAt,
      verificationNotes: justification || supplier.verificationNotes,
    };

    if (this.repos.suppliers.save) {
      await this.repos.suppliers.save(updatedSupplier);
    }

    await auditLog(
      this.audit,
      actor,
      'supplier',
      supplier.id,
      'supplier.lifecycle_tier_transitioned',
      { previousTier: currentTier },
      { currentTier: targetTier, justification: justification || 'Progressive monotonic transition' },
    );

    return ok({
      supplier: updatedSupplier,
      previousTier: currentTier,
      currentTier: targetTier,
    });
  }

  /**
   * Supplier Claim & Registration Flow.
   * Matches candidate with confidence scoring, avoids duplicates, and flags uncertain matches.
   */
  async claimDiscoveredSupplier(
    actor: ActorContext,
    claim: SupplierClaimInput,
    candidateSupplierId?: string,
  ): Promise<Result<{ supplier: Supplier; matchEvaluation: SupplierClaimMatchEvaluation }, Error>> {
    let candidate: Supplier | null = null;

    if (candidateSupplierId) {
      candidate = await this.repos.suppliers.findById(candidateSupplierId);
    } else if (claim.gstin && this.repos.suppliers.findByGstin) {
      candidate = await this.repos.suppliers.findByGstin(claim.gstin);
    } else if (claim.pan && this.repos.suppliers.findByPan) {
      candidate = await this.repos.suppliers.findByPan(claim.pan);
    }

    const candidateInput: SupplierDiscoveryCandidateInput | null = candidate
      ? {
          supplierId: candidate.id,
          businessName: candidate.businessName,
          phone: candidate.contactPhone,
          email: candidate.contactEmail,
          gstin: candidate.gstin,
          pan: candidate.pan,
        }
      : null;

    const matchEvaluation = evaluateSupplierClaimMatch(candidateInput, claim);

    if (matchEvaluation.status === 'CONFLICT_DETECTED') {
      return err(
        new ValidationError(
          `Supplier claim halted: Conflict detected against existing record (${matchEvaluation.reasons.join(', ')})`,
        ),
      );
    }

    if (matchEvaluation.status === 'REVIEW_REQUIRED') {
      return err(
        new ValidationError(
          `Supplier claim requires manual admin review: ${matchEvaluation.reasons.join(', ')}`,
        ),
      );
    }

    const now = timestamp();
    let targetSupplier: Supplier;

    if (matchEvaluation.status === 'CONFIRMED_MATCH' && candidate) {
      // Re-use and upgrade canonical existing supplier entity
      targetSupplier = {
        ...candidate,
        businessName: claim.legalBusinessName || candidate.businessName,
        legalBusinessName: claim.legalBusinessName || candidate.legalBusinessName,
        contactPhone: claim.contactPhone || candidate.contactPhone,
        contactEmail: claim.contactEmail || candidate.contactEmail,
        pan: claim.pan?.toUpperCase() || candidate.pan,
        gstin: claim.gstin?.toUpperCase() || candidate.gstin,
        lifecycleState:
          matchEvaluation.targetTier === SupplierDiscoveryLifecycleTier.GST_VERIFIED
            ? SupplierLifecycleState.VERIFIED
            : SupplierLifecycleState.ONBOARDING_REQUIRED,
        verificationStatus:
          matchEvaluation.targetTier === SupplierDiscoveryLifecycleTier.GST_VERIFIED
            ? TruthfulVerificationStatus.VERIFIED
            : TruthfulVerificationStatus.PENDING,
        status: 'ACTIVE',
      };
    } else {
      // Create new registered supplier entity
      const newId = createId();
      targetSupplier = {
        id: newId,
        businessName: claim.legalBusinessName,
        legalBusinessName: claim.legalBusinessName,
        contactPerson: claim.legalBusinessName,
        contactPhone: claim.contactPhone,
        contactEmail: claim.contactEmail,
        pan: claim.pan?.toUpperCase(),
        gstin: claim.gstin?.toUpperCase(),
        source: 'DIRECT',
        status: 'ACTIVE',
        categories: [],
        lifecycleState:
          matchEvaluation.targetTier === SupplierDiscoveryLifecycleTier.GST_VERIFIED
            ? SupplierLifecycleState.VERIFIED
            : SupplierLifecycleState.ONBOARDING_REQUIRED,
        verificationStatus:
          matchEvaluation.targetTier === SupplierDiscoveryLifecycleTier.GST_VERIFIED
            ? TruthfulVerificationStatus.VERIFIED
            : TruthfulVerificationStatus.PENDING,
      };
    }

    if (this.repos.suppliers.save) {
      await this.repos.suppliers.save(targetSupplier);
    }

    await auditLog(
      this.audit,
      actor,
      'supplier',
      targetSupplier.id,
      'supplier.profile_claimed_and_registered',
      null,
      {
        claimStatus: matchEvaluation.status,
        targetTier: matchEvaluation.targetTier,
        confidence: matchEvaluation.matchConfidence,
      },
    );

    return ok({
      supplier: targetSupplier,
      matchEvaluation,
    });
  }

  /**
   * Stage 1: OTP & Business Identity Verification Gate.
   */
  async verifyStage1Otp(
    actor: ActorContext,
    supplierId: string,
    input: Stage1OtpVerificationInput,
  ): Promise<Result<{ supplier: Supplier; result: Stage1OtpVerificationResult }, Error>> {
    const supplier = await this.repos.suppliers.findById(supplierId);
    if (!supplier) return err(new NotFoundError('Supplier not found'));

    const result = evaluateStage1OtpVerification(input);
    if (!result.isValid) {
      return err(
        new ValidationError(`Stage 1 OTP Verification failed: ${JSON.stringify(result.errors)}`),
      );
    }

    const now = timestamp();
    const updatedSupplier: Supplier = {
      ...supplier,
      contactPerson: input.authorizedRepName || supplier.contactPerson,
      contactPhone: input.contactPhone || supplier.contactPhone,
      contactEmail: input.contactEmail || supplier.contactEmail,
      pan: input.pan?.toUpperCase() || supplier.pan,
      lifecycleState: SupplierLifecycleState.VERIFIED,
      verificationStatus: TruthfulVerificationStatus.VERIFIED,
      status: 'ACTIVE',
      verifiedAt: now,
      verificationNotes: 'Stage 1: Authorized representative and contact credentials verified successfully',
    };

    if (this.repos.suppliers.save) {
      await this.repos.suppliers.save(updatedSupplier);
    }

    await auditLog(
      this.audit,
      actor,
      'supplier',
      supplier.id,
      'supplier.stage1_otp_verified',
      null,
      { verifiedFields: result.verifiedFields, status: result.status },
    );

    return ok({
      supplier: updatedSupplier,
      result,
    });
  }

  /**
   * Stage 2: Statutory GST Verification Gate.
   */
  async verifyStage2Gst(
    actor: ActorContext,
    supplierId: string,
    input: Stage2GstVerificationInput,
  ): Promise<Result<{ supplier: Supplier; result: Stage2GstVerificationResult }, Error>> {
    const supplier = await this.repos.suppliers.findById(supplierId);
    if (!supplier) return err(new NotFoundError('Supplier not found'));

    const result = evaluateStage2GstVerification(input);
    if (!result.isValid) {
      return err(
        new ValidationError(`Stage 2 GST Verification failed: ${JSON.stringify(result.errors)}`),
      );
    }

    const now = timestamp();
    const updatedSupplier: Supplier = {
      ...supplier,
      gstin: input.gstin?.toUpperCase() || supplier.gstin,
      pan: input.pan?.toUpperCase() || supplier.pan,
      legalBusinessName: input.legalBusinessName || supplier.legalBusinessName,
      lifecycleState: SupplierLifecycleState.VERIFIED,
      verificationStatus: result.status,
      status: 'ACTIVE',
      verifiedAt: result.status === TruthfulVerificationStatus.VERIFIED ? now : supplier.verifiedAt,
      verificationNotes: result.isOfflineFallback
        ? 'Stage 2 GST: Checksum validated; external provider lookup offline (truthful PENDING status)'
        : 'Stage 2 GST: Full statutory verification complete with valid checksum and active registry status',
    };

    if (this.repos.suppliers.save) {
      await this.repos.suppliers.save(updatedSupplier);
    }

    await auditLog(
      this.audit,
      actor,
      'supplier',
      supplier.id,
      'supplier.stage2_gst_verified',
      null,
      {
        gstin: updatedSupplier.gstin,
        checksumValid: result.checksumValid,
        isOfflineFallback: result.isOfflineFallback,
        verificationStatus: result.status,
      },
    );

    return ok({
      supplier: updatedSupplier,
      result,
    });
  }

  /**
   * PA-09: Cryptographically protected, time-bounded invitation tokens (/q/:token).
   */
  async createMagicLinkInvitation(
    actor: ActorContext,
    rfqId: string,
    supplierId: string,
    expiryHours = 48,
  ): Promise<Result<{ invitationToken: string; expiresAt: string }, Error>> {
    const rfq = await this.repos.rfqs.findById(rfqId);
    if (!rfq) return err(new NotFoundError('RFQ not found'));

    const supplier = await this.repos.suppliers.findById(supplierId);
    if (!supplier) return err(new NotFoundError('Supplier not found'));

    const token = `otpmagic_${createId().replace(/-/g, '')}_${Date.now()}`;
    const expiresAt = new Date(Date.now() + expiryHours * 60 * 60 * 1000).toISOString();

    this.magicLinkTokens.set(token, {
      rfqId,
      supplierId,
      expiresAt,
      redeemed: false,
    });

    await auditLog(
      this.audit,
      actor,
      'supplier',
      supplierId,
      'supplier.magic_link_invitation_created',
      null,
      { rfqId, expiresAt },
    );

    return ok({
      invitationToken: token,
      expiresAt,
    });
  }

  /**
   * PA-09: Exchanges magic link invitation for single-use quoting session token.
   * Single-use enforced with anti-replay protection.
   */
  async redeemMagicLinkInvitation(
    invitationToken: string,
  ): Promise<Result<{ sessionToken: string; rfqId: string; supplierId: string; expiresAt: string }, Error>> {
    const record = this.magicLinkTokens.get(invitationToken);
    if (!record) {
      return err(new ValidationError('Invalid or expired invitation token'));
    }

    if (record.redeemed) {
      return err(new ValidationError('Invitation token has already been redeemed (Single-use enforced)'));
    }

    if (new Date(record.expiresAt).getTime() < Date.now()) {
      return err(new ValidationError('Invitation token has expired'));
    }

    // Mark as redeemed (anti-replay)
    record.redeemed = true;

    const sessionToken = `sess_${createId().replace(/-/g, '')}_${Date.now()}`;
    const sessionExpiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(); // 2 hours

    this.magicLinkSessions.set(sessionToken, {
      sessionToken,
      rfqId: record.rfqId,
      supplierId: record.supplierId,
      expiresAt: sessionExpiresAt,
      isRedeemed: false,
    });

    return ok({
      sessionToken,
      rfqId: record.rfqId,
      supplierId: record.supplierId,
      expiresAt: sessionExpiresAt,
    });
  }

  /**
   * PA-09: Submits sealed quotation via unauthenticated magic-link session.
   */
  async submitMagicLinkQuote(
    sessionToken: string,
    quoteInput: {
      rfqId: string;
      supplierId: string;
      basePrice: number;
      gstAmount: number;
      transportCost: number;
      deliveryDays: number;
      warrantyMonths: number;
      notes?: string;
    },
  ): Promise<Result<{ quoteId: string; version: number }, Error>> {
    const session = this.magicLinkSessions.get(sessionToken);
    if (!session) {
      return err(new ValidationError('Invalid or expired session token'));
    }

    if (new Date(session.expiresAt).getTime() < Date.now()) {
      return err(new ValidationError('Session has expired'));
    }

    // Strict scope enforcement: Bound to RFQ and Supplier
    if (session.rfqId !== quoteInput.rfqId || session.supplierId !== quoteInput.supplierId) {
      return err(
        new ForbiddenError('Scope mismatch: Session token is not authorized for specified RFQ or Supplier'),
      );
    }

    const rfq = await this.repos.rfqs.findById(quoteInput.rfqId);
    if (!rfq) return err(new NotFoundError('RFQ not found'));

    if (rfq.status !== 'OPEN' && rfq.status !== 'CLARIFICATION') {
      return err(new ValidationError(`RFQ is not open for quotes. Current status: ${rfq.status}`));
    }

    const supplier = await this.repos.suppliers.findById(quoteInput.supplierId);
    if (!supplier) return err(new NotFoundError('Supplier not found'));

    const quoteId = createId();
    const now = timestamp();
    const totalCost = quoteInput.basePrice + quoteInput.gstAmount + quoteInput.transportCost;

    const snapshot = {
      basePrice: quoteInput.basePrice,
      gstAmount: quoteInput.gstAmount,
      transportCost: quoteInput.transportCost,
      totalCost,
      deliveryDays: quoteInput.deliveryDays,
      warrantyMonths: quoteInput.warrantyMonths,
      currency: 'INR',
      notes: quoteInput.notes || null,
      quotedVia: 'MAGIC_LINK',
    };

    const newQuote: Quote = {
      id: quoteId,
      rfqId: quoteInput.rfqId,
      supplierId: quoteInput.supplierId,
      invitationId: createId(),
      status: 'SUBMITTED',
      currentVersion: 1,
      createdAt: now,
      updatedAt: now,
    };

    const newVersion: QuoteVersion = {
      id: createId(),
      quoteId,
      version: 1,
      snapshot,
      createdBy: supplier.id,
      createdAt: now,
    };

    if (this.repos.quotes.save) {
      await this.repos.quotes.save(newQuote);
    }
    if (this.repos.quoteVersions.save) {
      await this.repos.quoteVersions.save(newVersion);
    }

    return ok({
      quoteId,
      version: 1,
    });
  }

  /**
   * PA-02: Fail-closed Winning Unverified Supplier Gate.
   */
  async evaluateAwardGate(
    awardId: string,
  ): Promise<Result<SupplierAwardEligibility, Error>> {
    const award = await this.repos.awards.findById(awardId);
    if (!award) return err(new NotFoundError('Award not found'));

    const quote = await this.repos.quotes.findById(award.quoteId);
    if (!quote) return err(new NotFoundError('Awarded quote not found'));

    const supplier = await this.repos.suppliers.findById(quote.supplierId);
    if (!supplier) return err(new NotFoundError('Supplier not found'));

    const eligibility = evaluateSupplierAwardEligibility({
      supplierId: supplier.id,
      lifecycleState: supplier.lifecycleState as SupplierLifecycleState,
      verificationStatus: supplier.verificationStatus as TruthfulVerificationStatus,
    });

    return ok(eligibility);
  }

  /**
   * Generates immutable transaction snapshot for historical POs and invoices.
   */
  async getSupplierTransactionSnapshot(
    supplierId: string,
  ): Promise<Result<SupplierTransactionSnapshot, Error>> {
    const supplier = await this.repos.suppliers.findById(supplierId);
    if (!supplier) return err(new NotFoundError('Supplier not found'));

    const snapshot = createSupplierTransactionSnapshot(supplier);
    return ok(snapshot);
  }
}
