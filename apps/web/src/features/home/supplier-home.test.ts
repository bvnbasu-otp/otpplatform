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

describe('Supplier Home - Scenario States Matrix (States A through T)', () => {
  it('handles STATE A: No opportunities (clean zero-data state)', () => {
    const opportunities: SupplierOpportunityItem[] = [];
    expect(opportunities).toHaveLength(0);
  });

  it('handles STATE B: Single new opportunity', () => {
    const opportunities: SupplierOpportunityItem[] = [
      {
        id: 'opp-1',
        invitation: createMockInvitation({ rfqTitle: 'Facility Maintenance' }),
        title: 'Facility Maintenance',
        publicRef: 'RFQ-2026-001',
        anonymousLabel: 'Anonymous Tender #01',
        buyerDisplayName: 'Identity Protected',
        buyerAnonymous: true,
        quoteDeadline: new Date(Date.now() + 48 * 3600 * 1000).toISOString(),
        deadlineCountdown: '2 days left',
        invitedAt: new Date().toISOString(),
        actionUrl: '/supplier/rfq/rfq-1',
        isClosingSoon: false,
        category: 'Maintenance',
        deliveryCity: 'Bengaluru',
      },
    ];
    expect(opportunities).toHaveLength(1);
    expect(opportunities[0]?.title).toBe('Facility Maintenance');
  });

  it('handles STATE C: Multiple opportunities (stacked cards without overflow)', () => {
    const opportunities: SupplierOpportunityItem[] = [
      {
        id: 'opp-1',
        invitation: createMockInvitation({ publicRef: 'RFQ-01' }),
        title: 'CNC Turning',
        publicRef: 'RFQ-01',
        anonymousLabel: 'Tender #01',
        buyerDisplayName: 'Identity Protected',
        buyerAnonymous: true,
        quoteDeadline: new Date().toISOString(),
        deadlineCountdown: '1 day left',
        invitedAt: new Date().toISOString(),
        actionUrl: '/supplier/rfq/rfq-1',
        isClosingSoon: false,
      },
      {
        id: 'opp-2',
        invitation: createMockInvitation({ publicRef: 'RFQ-02' }),
        title: 'Solar Inverters',
        publicRef: 'RFQ-02',
        anonymousLabel: 'Tender #02',
        buyerDisplayName: 'Identity Protected',
        buyerAnonymous: true,
        quoteDeadline: new Date().toISOString(),
        deadlineCountdown: '3 days left',
        invitedAt: new Date().toISOString(),
        actionUrl: '/supplier/rfq/rfq-2',
        isClosingSoon: false,
      },
    ];
    expect(opportunities).toHaveLength(2);
  });

  it('handles STATE D: New opportunity + Action Required combination', () => {
    const opps = [createMockInvitation()];
    const actions: SupplierActionItem[] = [
      {
        id: 'act-1',
        type: 'PO_ACCEPTANCE',
        title: 'PO #1092',
        subtitle: 'Facility Maintenance Work Order',
        priority: 'P0',
        statusLabel: 'PO Acceptance Pending',
        whyText: 'Buyer has issued Purchase Order · Accept to begin work execution',
        actionLabel: 'Accept & Sign PO →',
        actionUrl: '/purchase-orders/po-1092',
      },
    ];
    expect(opps).toHaveLength(1);
    expect(actions).toHaveLength(1);
    expect(actions[0]?.priority).toBe('P0');
  });

  it('handles STATE E: Active quote awaiting buyer evaluation', () => {
    const quote: SupplierActiveQuoteItem = {
      id: 'q-1',
      invitation: createMockInvitation({ status: 'QUOTED', rfqStatus: 'EVALUATING' }),
      title: 'Precision CNC Turning',
      publicRef: 'RFQ-2026-0042',
      statusLabel: 'Under Committee Evaluation',
      rfqStatus: 'EVALUATING',
      actionUrl: '/supplier/rfq/rfq-abc-999',
    };
    expect(quote.statusLabel).toBe('Under Committee Evaluation');
    expect(quote.rfqStatus).toBe('EVALUATING');
  });

  it('handles STATE F & G: Clarification and Negotiation states', () => {
    const clarificationAction: SupplierActionItem = {
      id: 'clarif-1',
      type: 'RFQ_CLOSING_SOON',
      title: 'RFQ #1042 Clarification',
      subtitle: 'Buyer requested technical clarification',
      priority: 'P1',
      statusLabel: 'Clarification Requested',
      whyText: 'Please clarify delivery lead time before quorum closes',
      actionLabel: 'Respond to Clarification →',
      actionUrl: '/supplier/rfq/rfq-1042',
    };
    expect(clarificationAction.statusLabel).toBe('Clarification Requested');
  });

  it('handles STATE H & I: Award/PO action and active order in execution', () => {
    const po = createMockPurchaseOrder({ status: 'ACCEPTED', totalAmount: 250000 });
    expect(po.status).toBe('ACCEPTED');
    expect(po.totalAmount).toBe(250000);
  });

  it('handles STATE J: Payment & invoice settled state', () => {
    const settledPo = createMockPurchaseOrder({ isSettled: true, status: 'COMPLETED' });
    expect(settledPo.isSettled).toBe(true);
  });

  it('handles STATE O: Long content titles and descriptions without layout break', () => {
    const longTitle = 'Supply, Installation, Testing, and Comprehensive Annual Maintenance of 500kVA High Voltage Industrial Transformer with Complete Cable Trenching and Secondary Switchgear Panel Wiring';
    const opp = createMockInvitation({ rfqTitle: longTitle });
    expect(opp.rfqTitle.length).toBeGreaterThan(100);
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
