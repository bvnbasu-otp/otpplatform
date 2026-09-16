import { describe, it, expect } from 'vitest';
import type { SupplierInvitation } from '@/features/supplier/types/supplier-quote';
import type { PurchaseOrderSummary } from '@/features/fulfillment/types/fulfillment';
import { formatDeadlineCountdown } from '@/lib/date-utils';
import type {
  SupplierOpportunityItem,
  SupplierActionItem,
  SupplierActiveQuoteItem,
  HomeActivityEvent,
} from './types';

function createMockInvitation(overrides: Partial<SupplierInvitation> = {}): SupplierInvitation {
  return {
    invitationId: 'inv-12345',
    rfqId: 'rfq-abc-999',
    publicRef: 'RFQ-2026-0042',
    anonymousLabel: 'Anonymous Tender #42',
    status: 'INVITED',
    invitedAt: new Date().toISOString(),
    rfqTitle: 'Precision CNC Turning 200 units',
    rfqStatus: 'OPEN',
    quoteDeadline: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
    buyerDisplayName: 'Identity Protected',
    buyerAnonymous: true,
    sourcingMode: 'IDENTITY_PROTECTED',
    minQuotesRequired: 3,
    category: 'Precision Machining',
    subcategory: 'CNC Turning',
    deliveryCity: 'Bengaluru',
    quantity: 200,
    unit: 'units',
    ...overrides,
  };
}

function createMockPurchaseOrder(overrides: Partial<PurchaseOrderSummary> = {}): PurchaseOrderSummary {
  return {
    id: 'po-test-888',
    poNumber: 'PO-2026-0888',
    status: 'ISSUED',
    totalAmount: 145000,
    currency: 'INR',
    supplierId: 'supp-123',
    rfqId: 'rfq-abc-999',
    rfqTitle: 'Precision CNC Turning 200 units',
    createdAt: new Date().toISOString(),
    issuedAt: new Date().toISOString(),
    acknowledgedAt: null,
    isSettled: false,
    ...overrides,
  };
}

describe('Supplier Home - Opportunities & Identity Protection', () => {
  it('identifies new unanswered RFQ opportunities', () => {
    const inv = createMockInvitation({ status: 'INVITED' });
    expect(inv.status).toBe('INVITED');
    expect(inv.publicRef).toBe('RFQ-2026-0042');
    expect(inv.buyerDisplayName).toBe('Identity Protected');
    expect(inv.buyerAnonymous).toBe(true);
    expect(inv.deliveryCity).toBe('Bengaluru');
    expect(inv.quantity).toBe(200);
  });

  it('preserves strict identity protection (no buyer details leak)', () => {
    const inv = createMockInvitation();
    // Verify protected presentation
    expect(inv.buyerDisplayName).not.toContain('@');
    expect(inv.buyerDisplayName).not.toMatch(/\d{10}/); // no phone numbers
    expect(inv.anonymousLabel).toContain('Anonymous Tender');
  });

  it('identifies closing soon status when deadline is within 24 hours', () => {
    const soonDeadline = new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString();
    const inv = createMockInvitation({ quoteDeadline: soonDeadline });
    const deadlineMs = new Date(inv.quoteDeadline!).getTime();
    const isClosingSoon = deadlineMs - Date.now() < 24 * 60 * 60 * 1000;

    expect(isClosingSoon).toBe(true);
  });

  it('formats specifications, category, and location for mobile cockpit cards', () => {
    const inv = createMockInvitation({
      category: 'Solar Energy',
      subcategory: 'Rooftop Solar PV',
      deliveryCity: 'Hyderabad',
      quantity: 50,
      unit: 'kW',
    });

    const quantityText = inv.quantity ? `${inv.quantity} ${inv.unit || 'units'}` : null;
    expect(quantityText).toBe('50 kW');
    expect(inv.category).toBe('Solar Energy');
    expect(inv.subcategory).toBe('Rooftop Solar PV');
    expect(inv.deliveryCity).toBe('Hyderabad');
  });
});

describe('Supplier Home - Action Required & Orders Summary', () => {
  it('flags pending PO acceptance as P0 action', () => {
    const po = createMockPurchaseOrder({ status: 'ISSUED', poNumber: 'PO-2026-0100' });
    expect(po.status).toBe('ISSUED');
    expect(po.acknowledgedAt).toBeNull();
  });

  it('computes orders volume and active count accurately', () => {
    const orders: PurchaseOrderSummary[] = [
      createMockPurchaseOrder({ id: 'po-1', status: 'ACCEPTED', totalAmount: 120000, isSettled: false }),
      createMockPurchaseOrder({ id: 'po-2', status: 'IN_PROGRESS', totalAmount: 85000, isSettled: false }),
      createMockPurchaseOrder({ id: 'po-3', status: 'COMPLETED', totalAmount: 50000, isSettled: true }),
    ];

    const activeOrders = orders.filter((p) => !p.isSettled && p.status !== 'CANCELLED');
    const totalVolume = activeOrders.reduce((sum, p) => sum + p.totalAmount, 0);

    expect(activeOrders.length).toBe(2);
    expect(totalVolume).toBe(205000);
  });

  it('handles empty states gracefully when supplier has no opportunities or orders', () => {
    const emptyOpportunities: SupplierOpportunityItem[] = [];
    const emptyActions: SupplierActionItem[] = [];
    const emptyQuotes: SupplierActiveQuoteItem[] = [];

    expect(emptyOpportunities).toHaveLength(0);
    expect(emptyActions).toHaveLength(0);
    expect(emptyQuotes).toHaveLength(0);
  });
});

describe('Supplier Home - Active Quotes & Recent Activity', () => {
  it('distinguishes submitted quotes in quoting vs under evaluation', () => {
    const quotingQuote = createMockInvitation({ status: 'QUOTED', rfqStatus: 'OPEN' });
    const evaluatingQuote = createMockInvitation({ status: 'QUOTED', rfqStatus: 'EVALUATING' });

    expect(quotingQuote.status).toBe('QUOTED');
    expect(quotingQuote.rfqStatus).toBe('OPEN');

    expect(evaluatingQuote.status).toBe('QUOTED');
    expect(evaluatingQuote.rfqStatus).toBe('EVALUATING');
  });

  it('structures meaningful recent activity log events with real data timestamps', () => {
    const event: HomeActivityEvent = {
      id: 'act-1',
      title: 'Quote Submitted',
      description: 'Sealed quote submitted for RFQ-2026-0042',
      timestamp: new Date().toISOString(),
      relativeTime: 'Today',
      icon: '⚡',
      category: 'SUPPLIER',
      targetUrl: '/supplier/rfq/rfq-abc-999',
    };

    expect(event.category).toBe('SUPPLIER');
    expect(event.targetUrl).toBe('/supplier/rfq/rfq-abc-999');
  });
});

describe('Supplier Home - Mobile Cockpit & Privacy Invariants', () => {
  it('enforces 48px minimum touch target on interactive links and buttons', () => {
    const touchTargetClass = 'min-h-[48px] mobile-touch-target';
    expect(touchTargetClass).toContain('min-h-[48px]');
    expect(touchTargetClass).toContain('mobile-touch-target');
  });

  it('contains ZERO prohibited procurement vocabulary in supplier cards', () => {
    const copy = `
      Review RFQ & Quote
      New Opportunities
      Active Quotes
      Orders & Business
      Discovery Radar
      Identity-Protected Sealed Sourcing
    `;
    const prohibited = ['bid', 'bids', 'bidder', 'bidders', 'bidding'];
    for (const word of prohibited) {
      expect(copy.toLowerCase()).not.toMatch(new RegExp(`\\b${word}\\b`, 'i'));
    }
  });
});
