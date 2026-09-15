import { describe, it, expect } from 'vitest';
import {
  getBuyerCoreState,
  isBuyerRequirementStalled,
  deriveBuyerActionItem,
  deriveBuyerProcurementItem,
  deriveBuyerRecentActivity,
} from './hooks/use-buyer-home-data';
import type { OrganizationRequirementSummary } from '@/features/requirement/api/requirements';

function createMockRequirement(overrides: Partial<OrganizationRequirementSummary> = {}): OrganizationRequirementSummary {
  return {
    id: 'req-test-12345678',
    title: 'Borewell Submersible Pump Replacement',
    requirementType: 'Mechanical Equipment',
    status: 'DRAFT',
    effectiveStatus: 'DRAFT',
    createdAt: new Date().toISOString(),
    publishedAt: null,
    rfqId: null,
    rfqStatus: null,
    revealStatus: null,
    quotesCount: 0,
    minQuotesRequired: 3,
    poId: null,
    poStatus: null,
    workOrderProgressPercent: null,
    isSettled: false,
    ...overrides,
  };
}

describe('Buyer Home - Lifecycle State Derivation', () => {
  it('identifies DRAFT state correctly', () => {
    const req = createMockRequirement({ status: 'DRAFT' });
    expect(getBuyerCoreState(req)).toBe('DRAFT');
  });

  it('identifies QUOTING state correctly', () => {
    const req = createMockRequirement({ status: 'QUOTING', rfqStatus: 'OPEN' });
    expect(getBuyerCoreState(req)).toBe('QUOTING');
  });

  it('identifies EVALUATING state when RFQ is evaluating or closed', () => {
    const req = createMockRequirement({ status: 'EVALUATION', rfqStatus: 'EVALUATING' });
    expect(getBuyerCoreState(req)).toBe('EVALUATING');
  });

  it('identifies AWARDED state', () => {
    const req = createMockRequirement({ status: 'AWARDED', rfqStatus: 'AWARDED' });
    expect(getBuyerCoreState(req)).toBe('AWARDED');
  });

  it('identifies PO_ISSUED state when PO is active or in progress', () => {
    const req = createMockRequirement({ poStatus: 'ISSUED' });
    expect(getBuyerCoreState(req)).toBe('PO_ISSUED');
  });

  it('identifies SETTLED state when completed', () => {
    const req = createMockRequirement({ isSettled: true, effectiveStatus: 'COMPLETED' });
    expect(getBuyerCoreState(req)).toBe('SETTLED');
  });

  it('detects stalled requirement after 24 hours of inactivity', () => {
    const freshReq = createMockRequirement({ createdAt: new Date().toISOString() });
    expect(isBuyerRequirementStalled(freshReq)).toBe(false);

    const oldDate = new Date(Date.now() - 30 * 60 * 60 * 1000).toISOString();
    const stalledReq = createMockRequirement({ createdAt: oldDate, status: 'DRAFT' });
    expect(isBuyerRequirementStalled(stalledReq)).toBe(true);

    const settledOldReq = createMockRequirement({ createdAt: oldDate, isSettled: true });
    expect(isBuyerRequirementStalled(settledOldReq)).toBe(false);
  });
});

describe('Buyer Home - Action Required Derivation & Priorities', () => {
  it('generates P0 Action when quorum is reached in QUOTING state', () => {
    const req = createMockRequirement({
      status: 'QUOTING',
      rfqId: 'rfq-999',
      quotesCount: 3,
      minQuotesRequired: 3,
    });
    const action = deriveBuyerActionItem(req);

    expect(action).not.toBeNull();
    expect(action?.priority).toBe('P0');
    expect(action?.priorityTag).toBe('Quorum Reached');
    expect(action?.actionLabel).toBe('Compare Quotes →');
    expect(action?.actionUrl).toBe('/rfq/rfq-999/quotes');
  });

  it('generates P0 Action when voting is pending in EVALUATION state', () => {
    const req = createMockRequirement({
      status: 'EVALUATION',
      rfqId: 'rfq-777',
      quotesCount: 4,
    });
    const action = deriveBuyerActionItem(req);

    expect(action).not.toBeNull();
    expect(action?.priority).toBe('P0');
    expect(action?.statusLabel).toBe('Vote Pending');
    expect(action?.actionLabel).toBe('Cast Vote →');
    expect(action?.actionUrl).toBe('/rfq/rfq-777/committee');
  });

  it('generates P0 Action when award is finalized and PO unmasking is needed', () => {
    const req = createMockRequirement({
      status: 'AWARDED',
      rfqId: 'rfq-555',
      revealStatus: 'SEALED',
    });
    const action = deriveBuyerActionItem(req);

    expect(action).not.toBeNull();
    expect(action?.priority).toBe('P0');
    expect(action?.statusLabel).toBe('Award Finalized');
    expect(action?.actionLabel).toBe('Reveal & Issue PO →');
    expect(action?.actionUrl).toBe('/rfq/rfq-555/reveal');
  });

  it('generates P0 Action when work order execution is 100% finished and awaiting sign-off', () => {
    const req = createMockRequirement({
      status: 'IN_PROGRESS',
      poStatus: 'ACCEPTED',
      workOrderProgressPercent: 100,
    });
    const action = deriveBuyerActionItem(req);

    expect(action).not.toBeNull();
    expect(action?.priority).toBe('P0');
    expect(action?.statusLabel).toBe('Delivery Finished');
    expect(action?.actionLabel).toBe('Review & Sign Off →');
    expect(action?.actionUrl).toBe('/purchase-orders');
  });

  it('generates P1 Action for continuing a draft requirement', () => {
    const req = createMockRequirement({ status: 'DRAFT', id: 'req-draft-01' });
    const action = deriveBuyerActionItem(req);

    expect(action).not.toBeNull();
    expect(action?.priority).toBe('P1');
    expect(action?.actionLabel).toBe('Continue Draft →');
    expect(action?.actionUrl).toBe('/requirements/req-draft-01');
  });

  it('returns null action for fully settled orders', () => {
    const req = createMockRequirement({ isSettled: true, effectiveStatus: 'COMPLETED' });
    expect(deriveBuyerActionItem(req)).toBeNull();
  });
});

describe('Buyer Home - Procurement Card & Activity Timeline', () => {
  it('formats active procurement card with correct status and metrics', () => {
    const req = createMockRequirement({
      id: 'req-proc-100',
      title: 'Lift AMC Annual Contract',
      quotesCount: 2,
      minQuotesRequired: 3,
      status: 'QUOTING',
      rfqId: 'rfq-lift-100',
    });
    const item = deriveBuyerProcurementItem(req);

    expect(item.id).toBe('req-proc-100');
    expect(item.quotesCount).toBe(2);
    expect(item.minQuotesRequired).toBe(3);
    expect(item.statusLabel).toContain('2 Quotes Received');
    expect(item.actionUrl).toBe('/rfq/rfq-lift-100/quotes');
  });

  it('derives chronological recent activity timeline events without exposing private metadata', () => {
    const reqs = [
      createMockRequirement({ id: 'r1', title: 'Solar Inverter 50kVA', isSettled: true }),
      createMockRequirement({ id: 'r2', title: 'Water Tank Waterproofing', quotesCount: 3, rfqId: 'rfq-w1' }),
    ];
    const events = deriveBuyerRecentActivity(reqs);

    expect(events.length).toBe(2);
    expect(events[0]?.title).toBe('Solar Inverter 50kVA');
    expect(events[0]?.category).toBe('BUYER');
    expect(events[1]?.title).toBe('Water Tank Waterproofing');
    expect(events[1]?.description).toContain('3 sealed supplier quotes received');
  });
});
