import type { IdentityProtectedQuote } from '@otp/domain';
import type { QuoteEvaluationService } from '../interfaces/quote-evaluation-service';
import type { AuditService } from '../interfaces/audit-service';
import type { Repositories } from '../repositories/interfaces';
import type { ActorContext } from '../types/actor-context';
import { ValidationError } from '../types/errors';
import { err, ok, type Result } from '../types/result';
import { auditLog, requireBuyerResourceAccess, requireOrgAccess } from './service-helpers';
import { timestamp } from '../repositories/in-memory';

export class QuoteEvaluationAppService {
  constructor(
    private readonly repos: Repositories,
    private readonly evaluation: QuoteEvaluationService,
    private readonly audit: AuditService,
  ) {}

  async evaluateRfq(
    actor: ActorContext,
    rfqId: string,
  ): Promise<Result<IdentityProtectedQuote[], Error>> {
    const rfq = await this.repos.rfqs.findById(rfqId);
    if (!rfq) return err(new ValidationError('RFQ not found'));

    const access = requireBuyerResourceAccess(actor, rfq.organizationId, rfq.createdBy, [
      'OWNER',
      'MANAGER',
      'BUYER',
    ]);
    if (!access.ok) return access;

    const quotes = await this.repos.quotes.findByRfqId(rfqId);
    const invitations = await this.repos.invitations.findByRfqId(rfqId);
    const labelByInvitation = new Map(
      invitations.map((i) => [i.id, i.anonymousLabel]),
    );

    const inputs = [];

    for (const quote of quotes) {
      if (!['SUBMITTED', 'REVISED', 'FINAL'].includes(quote.status)) continue;

      const versions = await this.repos.quoteVersions.findByQuoteId(quote.id);
      const latest = versions.find((v) => v.version === quote.currentVersion);
      if (!latest) continue;

      const supplier = await this.repos.suppliers.findById(quote.supplierId);
      inputs.push({
        quoteId: quote.id,
        anonymousLabel: labelByInvitation.get(quote.invitationId) ?? 'Unknown',
        price: latest.snapshot.basePrice,
        gstAmount: latest.snapshot.gstAmount,
        transportCost: latest.snapshot.transportCost,
        deliveryDays: latest.snapshot.deliveryDays,
        warrantyMonths: latest.snapshot.warrantyMonths,
        supplierRatingAvg: supplier?.ratingAvg ?? null,
        pastPerformanceScore: null,
      });
    }

    const normalized = this.evaluation.normalize(inputs);
    const scored = this.evaluation.score(normalized);

    for (const s of scored) {
      const quote = quotes.find((q) => q.id === s.quoteId)!;
      await this.repos.quotes.save({
        ...quote,
        evaluationScore: s.evaluationScore,
        updatedAt: timestamp(),
      });
    }

    await auditLog(this.audit, actor, 'rfq', rfqId, 'rfq.evaluated', null, {
      quoteCount: scored.length,
    });

    return ok(this.evaluation.toIdentityProtectedQuotes(scored));
  }
}
