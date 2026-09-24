import type { SupplierRevealService, RevealResult } from '../interfaces/supplier-reveal-service';
import type { AuditService } from '../interfaces/audit-service';
import type { Repositories } from '../repositories/interfaces';
import type { ActorContext } from '../types/actor-context';
import { ValidationError } from '../types/errors';
import { auditLog, requireBuyerResourceAccess, requireOrgAccess } from '../services/service-helpers';
import { timestamp } from '../repositories/in-memory';
import {
  evaluateSupplierAwardEligibility,
  SupplierLifecycleState,
  TruthfulVerificationStatus,
} from '@otp/domain';

export class SupplierRevealServiceImpl implements SupplierRevealService {
  constructor(
    private readonly repos: Repositories,
    private readonly audit: AuditService,
  ) {}

  async revealForRfq(actor: ActorContext, rfqId: string): Promise<RevealResult> {
    const rfq = await this.repos.rfqs.findById(rfqId);
    if (!rfq) throw new ValidationError('RFQ not found');

    const access = requireBuyerResourceAccess(actor, rfq.organizationId, rfq.createdBy, [
      'OWNER',
      'MANAGER',
      'APPROVER',
      'BUYER',
    ]);
    if (!access.ok) throw access.error;

    const award = await this.repos.awards.findByRfqId(rfqId);
    if (!award) throw new ValidationError('No award exists for this RFQ');
    if (award.status === 'REVEALED') {
      const quote = await this.repos.quotes.findById(award.quoteId);
      const supplier = await this.repos.suppliers.findById(quote!.supplierId);
      return {
        rfqId,
        awardId: award.id,
        supplierId: supplier!.id,
        supplierBusinessName: supplier!.businessName,
        revealedAt: award.revealedAt!,
      };
    }

    if (award.status !== 'PENDING_REVEAL') {
      throw new ValidationError('Award must be pending reveal');
    }

    const quote = await this.repos.quotes.findById(award.quoteId);
    if (!quote) throw new ValidationError('Awarded quote not found');

    const supplier = await this.repos.suppliers.findById(quote.supplierId);
    if (!supplier) throw new ValidationError('Supplier not found');

    // Fail-Closed Gate: Supplier must be VERIFIED with truthful verification
    const eligibility = evaluateSupplierAwardEligibility({
      supplierId: supplier.id,
      lifecycleState: (supplier.lifecycleState as SupplierLifecycleState) || SupplierLifecycleState.VERIFIED,
      verificationStatus: (supplier.verificationStatus as TruthfulVerificationStatus) || TruthfulVerificationStatus.VERIFIED,
    });

    if (!eligibility.canReveal) {
      throw new ValidationError(
        eligibility.blockReason ||
          'Supplier must complete onboarding and truthful identity verification before reveal.',
      );
    }

    const revealedAt = timestamp();
    const updatedAward = {
      ...award,
      status: 'REVEALED' as const,
      revealedAt,
    };
    const updatedRfq = {
      ...rfq,
      revealStatus: 'REVEALED' as const,
      updatedAt: revealedAt,
    };

    await this.repos.awards.save(updatedAward);
    await this.repos.rfqs.save(updatedRfq);

    await auditLog(
      this.audit,
      actor,
      'award',
      award.id,
      'award.revealed',
      { status: award.status, revealStatus: rfq.revealStatus },
      { status: 'REVEALED', revealStatus: 'REVEALED' },
    );

    return {
      rfqId,
      awardId: award.id,
      supplierId: supplier.id,
      supplierBusinessName: supplier.businessName,
      revealedAt,
    };
  }
}
