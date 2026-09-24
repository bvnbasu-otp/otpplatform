import {
  canFinalizeQuote,
  canSubmitQuoteRevision,
  canTransitionQuote,
  type IdentityProtectedQuote,
} from '@otp/domain';
import type { AuditService } from '../interfaces/audit-service';
import type { Repositories } from '../repositories/interfaces';
import type { Quote, QuoteSnapshot } from '../repositories/entities';
import type { ActorContext } from '../types/actor-context';
import { ValidationError } from '../types/errors';
import { err, ok, type Result } from '../types/result';
import {
  auditLog,
  assertTransition,
  requireBuyerResourceAccess,
  requireOrgAccess,
  requireSupplierAccess,
} from './service-helpers';
import { createId, timestamp } from '../repositories/in-memory';

export class QuoteService {
  constructor(
    private readonly repos: Repositories,
    private readonly audit: AuditService,
  ) {}

  async submitQuote(
    actor: ActorContext,
    rfqId: string,
    invitationId: string,
    snapshot: QuoteSnapshot,
    notes?: string,
  ): Promise<Result<Quote, Error>> {
    const rfq = await this.repos.rfqs.findById(rfqId);
    if (!rfq) return err(new ValidationError('RFQ not found'));
    if (rfq.status !== 'OPEN') {
      return err(new ValidationError('RFQ must be OPEN to submit quotes'));
    }

    const invitation = await this.repos.invitations.findById(invitationId);
    if (!invitation || invitation.rfqId !== rfqId) {
      return err(new ValidationError('Invitation not found'));
    }

    const supplierAccess = requireSupplierAccess(actor, invitation.supplierId);
    if (!supplierAccess.ok) return supplierAccess;

    const now = timestamp();
    const quote: Quote = {
      id: createId(),
      rfqId,
      supplierId: invitation.supplierId,
      invitationId,
      status: 'SUBMITTED',
      currentVersion: 1,
      submittedAt: now,
      createdAt: now,
      updatedAt: now,
    };

    const version = {
      id: createId(),
      quoteId: quote.id,
      version: 1,
      snapshot,
      notes,
      createdBy: actor.profileId,
      createdAt: now,
    };

    const saved = await this.repos.quotes.save(quote);
    await this.repos.quoteVersions.save(version);
    await this.repos.invitations.save({ ...invitation, status: 'QUOTED' });

    await auditLog(
      this.audit,
      actor,
      'quote',
      saved.id,
      'quote.submitted',
      null,
      { status: saved.status, version: 1 },
      { anonymousLabel: invitation.anonymousLabel },
    );

    return ok(saved);
  }

  async submitRevision(
    actor: ActorContext,
    quoteId: string,
    snapshot: QuoteSnapshot,
    notes?: string,
  ): Promise<Result<Quote, Error>> {
    const quote = await this.repos.quotes.findById(quoteId);
    if (!quote) return err(new ValidationError('Quote not found'));

    const rfq = await this.repos.rfqs.findById(quote.rfqId);
    if (!rfq) return err(new ValidationError('RFQ not found'));

    if (!canSubmitQuoteRevision(rfq.status, quote.status)) {
      return err(
        new ValidationError('Quote revision not allowed in current RFQ/quote state'),
      );
    }

    const supplierAccess = requireSupplierAccess(actor, quote.supplierId);
    if (!supplierAccess.ok) return supplierAccess;

    const newVersion = quote.currentVersion + 1;
    const now = timestamp();

    const transition = assertTransition(
      canTransitionQuote,
      quote.status,
      'REVISED',
      'quote',
    );
    if (!transition.ok) return transition;

    const updated: Quote = {
      ...quote,
      status: 'REVISED',
      currentVersion: newVersion,
      evaluationScore: undefined,
      submittedAt: now,
      updatedAt: now,
    };

    await this.repos.quoteVersions.save({
      id: createId(),
      quoteId,
      version: newVersion,
      snapshot,
      notes,
      createdBy: actor.profileId,
      createdAt: now,
    });

    const saved = await this.repos.quotes.save(updated);
    await auditLog(
      this.audit,
      actor,
      'quote',
      saved.id,
      'quote.revised',
      { status: quote.status, version: quote.currentVersion },
      { status: saved.status, version: saved.currentVersion },
    );

    return ok(saved);
  }

  async finalizeQuote(
    actor: ActorContext,
    quoteId: string,
  ): Promise<Result<Quote, Error>> {
    const quote = await this.repos.quotes.findById(quoteId);
    if (!quote) return err(new ValidationError('Quote not found'));

    const rfq = await this.repos.rfqs.findById(quote.rfqId);
    if (!rfq) return err(new ValidationError('RFQ not found'));

    if (!canFinalizeQuote(rfq.status, quote.status)) {
      return err(new ValidationError('Cannot finalize quote in current state'));
    }

    const supplierAccess = requireSupplierAccess(actor, quote.supplierId);
    if (!supplierAccess.ok) return supplierAccess;

    const transition = assertTransition(
      canTransitionQuote,
      quote.status,
      'FINAL',
      'quote',
    );
    if (!transition.ok) return transition;

    const updated: Quote = {
      ...quote,
      status: 'FINAL',
      updatedAt: timestamp(),
    };
    const saved = await this.repos.quotes.save(updated);

    await auditLog(
      this.audit,
      actor,
      'quote',
      saved.id,
      'quote.finalized',
      { status: quote.status },
      { status: saved.status },
    );

    return ok(saved);
  }

  async getIdentityProtectedQuotes(
    actor: ActorContext,
    rfqId: string,
  ): Promise<Result<IdentityProtectedQuote[], Error>> {
    const rfq = await this.repos.rfqs.findById(rfqId);
    if (!rfq) return err(new ValidationError('RFQ not found'));

    const access = requireBuyerResourceAccess(
      actor,
      rfq.organizationId,
      rfq.createdBy,
      ['OWNER', 'MANAGER', 'BUYER', 'APPROVER', 'COMMITTEE_MEMBER'],
    );
    if (!access.ok) return access;

    const quotes = await this.repos.quotes.findByRfqId(rfqId);
    const invitations = await this.repos.invitations.findByRfqId(rfqId);
    const labelByInvitation = new Map(
      invitations.map((i) => [i.id, i.anonymousLabel]),
    );

    const identityProtectedQuotes: IdentityProtectedQuote[] = [];

    for (const quote of quotes) {
      if (quote.status === 'DRAFT' || quote.status === 'WITHDRAWN') continue;

      const versions = await this.repos.quoteVersions.findByQuoteId(quote.id);
      const latest = versions.find((v) => v.version === quote.currentVersion);
      if (!latest) continue;

      identityProtectedQuotes.push({
        quoteId: quote.id,
        anonymousLabel: labelByInvitation.get(quote.invitationId) ?? 'Unknown',
        version: quote.currentVersion,
        status: quote.status,
        basePrice: latest.snapshot.basePrice,
        gstAmount: latest.snapshot.gstAmount,
        transportCost: latest.snapshot.transportCost,
        totalCost: latest.snapshot.totalCost,
        deliveryDays: latest.snapshot.deliveryDays,
        warrantyMonths: latest.snapshot.warrantyMonths,
        evaluationScore: quote.evaluationScore ?? null,
        supplierRatingAvg: null,
        pastPerformanceScore: null,
        submittedAt: quote.submittedAt ?? null,
      });
    }

    return ok(identityProtectedQuotes);
  }

  // Legacy alias
  async getBlindQuotes(
    actor: ActorContext,
    rfqId: string,
  ): Promise<Result<IdentityProtectedQuote[], Error>> {
    return this.getIdentityProtectedQuotes(actor, rfqId);
  }
}
