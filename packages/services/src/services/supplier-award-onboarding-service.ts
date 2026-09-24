import {
  SupplierLifecycleState,
  TruthfulVerificationStatus,
  evaluateSupplierAwardEligibility,
  validateSupplierOnboardingProfile,
  type SupplierAwardEligibility,
  type SupplierOnboardingProfileSubmission,
  type SupplierMatchingCriteria,
  type SupplierProfileValidationResult,
} from '@otp/domain';
import type { AuditService } from '../interfaces/audit-service';
import type { Repositories } from '../repositories/interfaces';
import type { Supplier } from '../repositories/entities';
import type { ActorContext } from '../types/actor-context';
import { ForbiddenError, NotFoundError, ValidationError } from '../types/errors';
import { err, ok, type Result } from '../types/result';
import { auditLog, requireOrgAccess } from './service-helpers';
import { createId, timestamp } from '../repositories/in-memory';

export class SupplierAwardOnboardingService {
  constructor(
    private readonly repos: Repositories,
    private readonly audit: AuditService,
  ) {}

  async evaluateAwardEligibility(
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

  async generateOnboardingToken(
    actor: ActorContext,
    supplierId: string,
  ): Promise<Result<{ token: string; expiresAt: string }, Error>> {
    const supplier = await this.repos.suppliers.findById(supplierId);
    if (!supplier) return err(new NotFoundError('Supplier not found'));

    const token = `otponb_${createId().replace(/-/g, '')}_${Date.now()}`;
    const now = timestamp();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const updatedSupplier: Supplier = {
      ...supplier,
      lifecycleState: supplier.lifecycleState === SupplierLifecycleState.QUOTE_PARTICIPANT
        ? SupplierLifecycleState.ONBOARDING_REQUIRED
        : supplier.lifecycleState,
      onboardingClaimTokenHash: token,
    };

    if (this.repos.suppliers.save) {
      await this.repos.suppliers.save(updatedSupplier);
    }

    await auditLog(
      this.audit,
      actor,
      'supplier',
      supplier.id,
      'supplier.onboarding_token_generated',
      null,
      { supplierId, expiresAt },
    );

    return ok({ token, expiresAt });
  }

  async claimOnboarding(
    token: string,
    actor?: ActorContext,
  ): Promise<Result<{ supplierId: string; status: SupplierLifecycleState }, Error>> {
    if (!token || !token.trim()) {
      return err(new ValidationError('Onboarding token is required'));
    }

    if (!this.repos.suppliers.findByTokenHash) {
      return err(new Error('Supplier token lookup not supported'));
    }

    const supplier = await this.repos.suppliers.findByTokenHash(token.trim());
    if (!supplier) {
      return err(new NotFoundError('Invalid or expired onboarding invitation token'));
    }

    if (
      supplier.lifecycleState !== SupplierLifecycleState.QUOTE_PARTICIPANT &&
      supplier.lifecycleState !== SupplierLifecycleState.ONBOARDING_REQUIRED &&
      supplier.lifecycleState !== SupplierLifecycleState.ONBOARDING_IN_PROGRESS
    ) {
      return err(
        new ValidationError(
          `Supplier is already in state '${supplier.lifecycleState}'. Cannot reclaim onboarding.`,
        ),
      );
    }

    const updated: Supplier = {
      ...supplier,
      lifecycleState: SupplierLifecycleState.ONBOARDING_IN_PROGRESS,
    };

    if (this.repos.suppliers.save) {
      await this.repos.suppliers.save(updated);
    }

    const actorContext: ActorContext = actor ?? {
      profileId: 'system',
      isPlatformAdmin: false,
    };

    await auditLog(
      this.audit,
      actorContext,
      'supplier',
      supplier.id,
      'supplier.onboarding_claimed',
      { previousState: supplier.lifecycleState },
      { currentState: SupplierLifecycleState.ONBOARDING_IN_PROGRESS },
    );

    return ok({
      supplierId: supplier.id,
      status: SupplierLifecycleState.ONBOARDING_IN_PROGRESS,
    });
  }

  async submitProfile(
    submission: SupplierOnboardingProfileSubmission,
    actor?: ActorContext,
  ): Promise<Result<{ supplier: Supplier; validation: SupplierProfileValidationResult }, Error>> {
    const validation = validateSupplierOnboardingProfile(submission);
    if (!validation.isValid) {
      return err(
        new ValidationError(
          `Supplier onboarding profile failed validation: ${JSON.stringify(validation.errors)}`,
        ),
      );
    }

    let supplier: Supplier | null = null;
    if (submission.token && this.repos.suppliers.findByTokenHash) {
      supplier = await this.repos.suppliers.findByTokenHash(submission.token);
    }
    if (!supplier && submission.supplierId) {
      supplier = await this.repos.suppliers.findById(submission.supplierId);
    }

    if (!supplier) {
      return err(new NotFoundError('Target supplier record not found for onboarding submission'));
    }

    const now = timestamp();
    const updated: Supplier = {
      ...supplier,
      businessName: submission.legalBusinessName,
      legalBusinessName: submission.legalBusinessName,
      tradeName: submission.tradeName || submission.legalBusinessName,
      gstin: submission.gstin?.toUpperCase(),
      pan: submission.pan?.toUpperCase(),
      registeredAddress: submission.registeredAddress as unknown as Record<string, unknown>,
      contactPerson: submission.contactPerson,
      contactPhone: submission.contactPhone,
      contactEmail: submission.contactEmail,
      lifecycleState: SupplierLifecycleState.VERIFIED,
      verificationStatus: TruthfulVerificationStatus.VERIFIED,
      status: 'ACTIVE',
      verifiedAt: now,
      verificationNotes: 'Statutory structure & PAN/GSTIN consistency verified successfully',
    };

    if (this.repos.suppliers.save) {
      await this.repos.suppliers.save(updated);
    }

    const actorContext: ActorContext = actor ?? {
      profileId: 'supplier-onboarding',
      isPlatformAdmin: false,
    };

    await auditLog(
      this.audit,
      actorContext,
      'supplier',
      supplier.id,
      'supplier.onboarding_completed_and_verified',
      null,
      {
        gstin: updated.gstin,
        pan: updated.pan,
        verificationStatus: updated.verificationStatus,
      },
    );

    return ok({
      supplier: updated,
      validation,
    });
  }

  async matchSupplier(
    criteria: SupplierMatchingCriteria,
  ): Promise<Result<Supplier | null, Error>> {
    if (criteria.gstin && this.repos.suppliers.findByGstin) {
      const match = await this.repos.suppliers.findByGstin(criteria.gstin);
      if (match) return ok(match);
    }

    if (criteria.pan && this.repos.suppliers.findByPan) {
      const match = await this.repos.suppliers.findByPan(criteria.pan);
      if (match) return ok(match);
    }

    return ok(null);
  }
}
