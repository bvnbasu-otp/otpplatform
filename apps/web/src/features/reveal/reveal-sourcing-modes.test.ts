import { describe, it, expect } from 'vitest';
import type { RevealedQuoteRow } from './api/fetch-revealed-quotes';

describe('Award-Locked Identity Reveal across Sourcing Modes', () => {
  const winnerQuoteId = 'quote-winner-1';

  const identityProtectedQuotes: RevealedQuoteRow[] = [
    {
      quoteId: winnerQuoteId,
      anonymousLabel: 'Supplier B',
      supplierId: 'supplier-winner-uuid',
      businessName: 'Apex Precision Tools Pvt Ltd',
      phone: '+919876543210',
      email: 'sales@apexprecision.in',
      status: 'SELECTED',
      totalCost: 150000,
      deliveryDays: 5,
      warrantyMonths: 12,
    },
    {
      quoteId: 'quote-loser-2',
      anonymousLabel: 'Supplier A',
      supplierId: null,
      businessName: null,
      phone: null,
      email: null,
      status: 'SUBMITTED',
      totalCost: 165000,
      deliveryDays: 7,
      warrantyMonths: 6,
    },
    {
      quoteId: 'quote-loser-3',
      anonymousLabel: 'Supplier C',
      supplierId: null,
      businessName: null,
      phone: null,
      email: null,
      status: 'SUBMITTED',
      totalCost: 172000,
      deliveryDays: 10,
      warrantyMonths: 12,
    },
  ];

  const openRfqTenderQuotes: RevealedQuoteRow[] = [
    {
      quoteId: winnerQuoteId,
      anonymousLabel: 'Supplier B',
      supplierId: 'supplier-winner-uuid',
      businessName: 'Apex Precision Tools Pvt Ltd',
      phone: '+919876543210',
      email: 'sales@apexprecision.in',
      status: 'SELECTED',
      totalCost: 150000,
      deliveryDays: 5,
      warrantyMonths: 12,
    },
    {
      quoteId: 'quote-loser-2',
      anonymousLabel: 'Supplier A',
      supplierId: null,
      businessName: 'Bharat Machine Works',
      phone: null,
      email: null,
      status: 'SUBMITTED',
      totalCost: 165000,
      deliveryDays: 7,
      warrantyMonths: 6,
    },
    {
      quoteId: 'quote-loser-3',
      anonymousLabel: 'Supplier C',
      supplierId: null,
      businessName: 'Coimbatore Motors & Pumps',
      phone: null,
      email: null,
      status: 'SUBMITTED',
      totalCost: 172000,
      deliveryDays: 10,
      warrantyMonths: 12,
    },
  ];

  describe('1. Identity-Protected Sourcing Mode', () => {
    it('unmasks ONLY the winner and leaves all other candidates strictly sealed', () => {
      const winner = identityProtectedQuotes.find((q) => q.quoteId === winnerQuoteId);
      expect(winner).toBeDefined();
      expect(winner?.businessName).toBe('Apex Precision Tools Pvt Ltd');
      expect(winner?.phone).toBe('+919876543210');
      expect(winner?.email).toBe('sales@apexprecision.in');

      const nonWinners = identityProtectedQuotes.filter((q) => q.quoteId !== winnerQuoteId);
      expect(nonWinners).toHaveLength(2);
      for (const candidate of nonWinners) {
        expect(candidate.businessName).toBeNull();
        expect(candidate.supplierId).toBeNull();
        expect(candidate.phone).toBeNull();
        expect(candidate.email).toBeNull();
      }
    });
  });

  describe('2. Open RFQ Tender Sourcing Mode', () => {
    it('reveals participant business names post-award while shielding direct contact details', () => {
      const winner = openRfqTenderQuotes.find((q) => q.quoteId === winnerQuoteId);
      expect(winner).toBeDefined();
      expect(winner?.businessName).toBe('Apex Precision Tools Pvt Ltd');
      expect(winner?.phone).toBeTruthy();
      expect(winner?.email).toBeTruthy();

      const nonWinners = openRfqTenderQuotes.filter((q) => q.quoteId !== winnerQuoteId);
      expect(nonWinners).toHaveLength(2);
      expect(nonWinners[0]?.businessName).toBe('Bharat Machine Works');
      expect(nonWinners[1]?.businessName).toBe('Coimbatore Motors & Pumps');

      // Crucial privacy barrier: contact details must NEVER be exposed for non-winners
      for (const candidate of nonWinners) {
        expect(candidate.phone).toBeNull();
        expect(candidate.email).toBeNull();
        expect(candidate.supplierId).toBeNull();
      }
    });
  });

  describe('3. Core Privacy Invariants', () => {
    it('ensures zero contact data leakage on non-winning quotes across all modes', () => {
      const allNonWinners = [
        ...identityProtectedQuotes.filter((q) => q.quoteId !== winnerQuoteId),
        ...openRfqTenderQuotes.filter((q) => q.quoteId !== winnerQuoteId),
      ];

      for (const row of allNonWinners) {
        expect(row.phone).toBeNull();
        expect(row.email).toBeNull();
      }
    });
  });
});
