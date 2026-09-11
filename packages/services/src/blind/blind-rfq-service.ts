import {
  assertIdentityProtectedPayloadSafe,
  type IdentityProtectedQuote,
  type RevealedQuote,
} from '@otp/domain';
import type { AuditService } from '../interfaces/audit-service';
import type { BlindInvitation } from '../interfaces/blind-invitation';
import type { BlindViewPorts } from '../interfaces/blind-view-ports';
import type { ManagerInvitation } from '../interfaces/manager-invitation';
import type { Repositories } from '../repositories/interfaces';
import type { ActorContext } from '../types/actor-context';
import { ForbiddenError, ValidationError } from '../types/errors';
import { err, ok, type Result } from '../types/result';
import { auditLog, requireOrgAccess } from '../services/service-helpers';
import { identityProtectedQuoteToRecord } from './blind-payload';

/**
 * Identity-Protected RFQ Engine — all buyer/committee quote reads go through DB identity-protected views.
 * Constitution: never return supplier identity while reveal_status = PROTECTED.
 */
export class IdentityProtectedRfqService {
  constructor(
    private readonly repos: Repositories,
    private readonly blindViews: BlindViewPorts,
    private readonly audit: AuditService,
  ) {}

  async getIdentityProtectedQuotes(
    actor: ActorContext,
    rfqId: string,
  ): Promise<Result<IdentityProtectedQuote[], Error>> {
    const rfq = await this.repos.rfqs.findById(rfqId);
    if (!rfq) return err(new ValidationError('RFQ not found'));

    const access = requireOrgAccess(actor, rfq.organizationId, [
      'OWNER',
      'MANAGER',
      'BUYER',
      'APPROVER',
      'COMMITTEE_MEMBER',
    ]);
    if (!access.ok) return access;

    const revealStatus = await this.blindViews.rfqRevealStatus.getRevealStatus(rfqId);
    if (revealStatus !== 'PROTECTED' && revealStatus !== 'BLIND') {
      return err(
        new ForbiddenError(
          'Identity-protected quotes unavailable after supplier reveal — use getRevealedQuotes',
        ),
      );
    }

    const quotes = await this.blindViews.blindQuotes.findByRfqId(rfqId);
    const safe = quotes.map((q) => this.assertSafeIdentityProtectedQuote(q));

    await auditLog(this.audit, actor, 'rfq', rfqId, 'rfq.identity_protected_quotes_read', null, {
      count: safe.length,
    });

    return ok(safe);
  }

  async getRevealedQuotes(
    actor: ActorContext,
    rfqId: string,
  ): Promise<Result<RevealedQuote[], Error>> {
    const rfq = await this.repos.rfqs.findById(rfqId);
    if (!rfq) return err(new ValidationError('RFQ not found'));

    const access = requireOrgAccess(actor, rfq.organizationId, [
      'OWNER',
      'MANAGER',
      'BUYER',
      'APPROVER',
    ]);
    if (!access.ok) return access;

    const revealStatus = await this.blindViews.rfqRevealStatus.getRevealStatus(rfqId);
    if (revealStatus !== 'REVEALED') {
      return err(new ForbiddenError('Supplier identity not yet revealed for this RFQ'));
    }

    const quotes = await this.blindViews.revealedQuotes.findByRfqId(rfqId);

    await auditLog(this.audit, actor, 'rfq', rfqId, 'rfq.revealed_quotes_read', null, {
      count: quotes.length,
    });

    return ok(quotes);
  }

  async getBlindInvitations(
    actor: ActorContext,
    rfqId: string,
  ): Promise<Result<BlindInvitation[], Error>> {
    const rfq = await this.repos.rfqs.findById(rfqId);
    if (!rfq) return err(new ValidationError('RFQ not found'));

    const access = requireOrgAccess(actor, rfq.organizationId, [
      'COMMITTEE_MEMBER',
      'MANAGER',
      'OWNER',
    ]);
    if (!access.ok) return access;

    const revealStatus = await this.blindViews.rfqRevealStatus.getRevealStatus(rfqId);
    if (revealStatus !== 'PROTECTED' && revealStatus !== 'BLIND') {
      return err(new ForbiddenError('Blind invitations unavailable after reveal'));
    }

    const invitations = await this.blindViews.blindInvitations.findByRfqId(rfqId);

    for (const inv of invitations) {
      assertIdentityProtectedPayloadSafe(inv as unknown as Record<string, unknown>);
    }

    return ok(invitations);
  }

  async getManagerInvitations(
    actor: ActorContext,
    rfqId: string,
  ): Promise<Result<ManagerInvitation[], Error>> {
    const rfq = await this.repos.rfqs.findById(rfqId);
    if (!rfq) return err(new ValidationError('RFQ not found'));

    const access = requireOrgAccess(actor, rfq.organizationId, [
      'OWNER',
      'MANAGER',
    ]);
    if (!access.ok) return access;

    const invitations = await this.blindViews.managerInvitations.findByRfqId(rfqId);

    const revealStatus = await this.blindViews.rfqRevealStatus.getRevealStatus(rfqId);
    if (revealStatus === 'PROTECTED' || revealStatus === 'BLIND') {
      for (const inv of invitations) {
        if (inv.supplierId !== null) {
          return err(new ValidationError('supplierId leak in manager invitations while identity-protected'));
        }
      }
    }

    return ok(invitations);
  }

  // Legacy alias
  async getBlindQuotes(
    actor: ActorContext,
    rfqId: string,
  ): Promise<Result<IdentityProtectedQuote[], Error>> {
    return this.getIdentityProtectedQuotes(actor, rfqId);
  }

  private assertSafeIdentityProtectedQuote(quote: IdentityProtectedQuote): IdentityProtectedQuote {
    assertIdentityProtectedPayloadSafe(identityProtectedQuoteToRecord(quote));
    return quote;
  }

  // Legacy alias
  private assertSafeBlindQuote(quote: IdentityProtectedQuote): IdentityProtectedQuote {
    return this.assertSafeIdentityProtectedQuote(quote);
  }
}

// Legacy alias
export const BlindRfqService = IdentityProtectedRfqService;
