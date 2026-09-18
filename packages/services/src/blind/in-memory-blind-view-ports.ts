import type { IdentityProtectedQuote, RevealedQuote } from '@otp/domain';
import type { QuoteStatus } from '@otp/domain';
import type { Repositories } from '../repositories/interfaces';
import type { BlindInvitation } from '../interfaces/blind-invitation';
import type {
  BlindInvitationReadRepository,
  BlindQuoteReadRepository,
  BlindViewPorts,
  ManagerInvitationReadRepository,
  RevealedQuoteReadRepository,
  RfqRevealStatusPort,
} from '../interfaces/blind-view-ports';
import type { ManagerInvitation } from '../interfaces/manager-invitation';

/**
 * In-memory identity-protected view adapters — simulate DB views for unit tests.
 * Reads base repos but strips supplier identity (does not bypass protection rules).
 */
export function createInMemoryBlindViewPorts(
  repos: Repositories,
): BlindViewPorts {
  const blindQuotes: BlindQuoteReadRepository = {
    async findByRfqId(rfqId) {
      const rfq = await repos.rfqs.findById(rfqId);
      if (!rfq || (rfq.revealStatus !== 'PROTECTED' && rfq.revealStatus !== 'BLIND')) return [];

      const quotes = await repos.quotes.findByRfqId(rfqId);
      const invitations = await repos.invitations.findByRfqId(rfqId);
      const labelByInvitation = new Map(
        invitations.map((i) => [i.id, i.anonymousLabel]),
      );

      const identityProtectedQuotes: IdentityProtectedQuote[] = [];
      for (const quote of quotes) {
        if (quote.status === 'DRAFT' || quote.status === 'WITHDRAWN') continue;
        const versions = await repos.quoteVersions.findByQuoteId(quote.id);
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
      return identityProtectedQuotes;
    },
  };

  const revealedQuotes: RevealedQuoteReadRepository = {
    async findByRfqId(rfqId) {
      const rfq = await repos.rfqs.findById(rfqId);
      if (!rfq || rfq.revealStatus !== 'REVEALED') return [];

      const quotes = await repos.quotes.findByRfqId(rfqId);
      const invitations = await repos.invitations.findByRfqId(rfqId);
      const labelByInvitation = new Map(
        invitations.map((i) => [i.id, i.anonymousLabel]),
      );

      const revealed: RevealedQuote[] = [];
      for (const quote of quotes) {
        if (quote.status === 'DRAFT' || quote.status === 'WITHDRAWN') continue;
        const versions = await repos.quoteVersions.findByQuoteId(quote.id);
        const latest = versions.find((v) => v.version === quote.currentVersion);
        const supplier = await repos.suppliers.findById(quote.supplierId);
        if (!latest || !supplier) continue;

        const isWinner = quote.status === 'SELECTED';

        revealed.push({
          quoteId: quote.id,
          anonymousLabel: labelByInvitation.get(quote.invitationId) ?? 'Unknown',
          version: quote.currentVersion,
          status: quote.status as QuoteStatus,
          basePrice: latest.snapshot.basePrice,
          gstAmount: latest.snapshot.gstAmount,
          transportCost: latest.snapshot.transportCost,
          totalCost: latest.snapshot.totalCost,
          deliveryDays: latest.snapshot.deliveryDays,
          warrantyMonths: latest.snapshot.warrantyMonths,
          evaluationScore: quote.evaluationScore ?? null,
          supplierRatingAvg: isWinner ? supplier.ratingAvg ?? null : null,
          pastPerformanceScore: null,
          submittedAt: quote.submittedAt ?? null,
          supplierId: isWinner ? quote.supplierId : null,
          businessName: isWinner ? supplier.businessName : null,
          phone: null,
          email: null,
          address: null,
          source: isWinner ? supplier.source : null,
        });
      }
      return revealed;
    },
  };

  const blindInvitations: BlindInvitationReadRepository = {
    async findByRfqId(rfqId) {
      const rfq = await repos.rfqs.findById(rfqId);
      if (!rfq || (rfq.revealStatus !== 'PROTECTED' && rfq.revealStatus !== 'BLIND')) return [];

      const invitations = await repos.invitations.findByRfqId(rfqId);
      return invitations.map(
        (i): BlindInvitation => ({
          invitationId: i.id,
          rfqId: i.rfqId,
          anonymousLabel: i.anonymousLabel,
          status: i.status,
          invitedAt: i.invitedAt,
          viewedAt: null,
          declinedAt: null,
        }),
      );
    },
  };

  const managerInvitations: ManagerInvitationReadRepository = {
    async findByRfqId(rfqId) {
      const invitations = await repos.invitations.findByRfqId(rfqId);
      const rfq = await repos.rfqs.findById(rfqId);
      const revealed = rfq?.revealStatus === 'REVEALED';

      return invitations.map(
        (i): ManagerInvitation => ({
          invitationId: i.id,
          rfqId: i.rfqId,
          anonymousLabel: i.anonymousLabel,
          status: i.status,
          matchScore: i.matchScore ?? null,
          matchReasons: i.matchReasons ?? null,
          invitedAt: i.invitedAt,
          viewedAt: null,
          declinedAt: null,
          supplierId: revealed ? i.supplierId : null,
        }),
      );
    },
  };

  const rfqRevealStatus: RfqRevealStatusPort = {
    async getRevealStatus(rfqId) {
      const rfq = await repos.rfqs.findById(rfqId);
      return rfq?.revealStatus ?? null;
    },
  };

  return {
    blindQuotes,
    revealedQuotes,
    blindInvitations,
    managerInvitations,
    rfqRevealStatus,
  };
}
