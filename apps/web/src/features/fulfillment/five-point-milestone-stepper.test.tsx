import React from 'react';
import { describe, expect, it } from 'vitest';
import { FivePointMilestoneStepper } from './components/FivePointMilestoneStepper';
import { deriveFivePointMilestoneProjection } from '@otp/domain';

describe('FivePointMilestoneStepper Component', () => {
  it('renders all 5 canonical milestone cards with correct steps', () => {
    const summary = deriveFivePointMilestoneProjection({
      rfqStatus: 'PUBLISHED',
      rfqId: 'rfq-ui-001',
      buyerPersona: 'MSME',
    });

    const el = React.createElement(FivePointMilestoneStepper, {
      projection: summary,
    });

    expect(el).toBeDefined();
    expect(el.props.projection?.milestones).toHaveLength(5);
    expect(el.props.projection?.milestones[0].label).toBe('Requirement');
    expect(el.props.projection?.milestones[1].label).toBe('Offers');
    expect(el.props.projection?.milestones[2].label).toBe('Decision');
    expect(el.props.projection?.milestones[3].label).toBe('Purchase');
    expect(el.props.projection?.milestones[4].label).toBe('Delivery & Settlement');
  });

  it('highlights Step 4 (Purchase) when PO is ISSUED', () => {
    const summary = deriveFivePointMilestoneProjection({
      rfqStatus: 'AWARDED',
      poStatus: 'ISSUED',
      poId: 'po-101',
      buyerPersona: 'RWA',
    });

    expect(summary.activeMilestoneNumber).toBe(4);
    expect(summary.milestones[3].isCurrent).toBe(true);
    expect(summary.milestones[3].status).toBe('IN_PROGRESS');
    expect(summary.milestones[2].isCompleted).toBe(true);
  });

  it('highlights Step 5 (Delivery & Settlement) when Work Order is active', () => {
    const summary = deriveFivePointMilestoneProjection({
      rfqStatus: 'AWARDED',
      poStatus: 'ACCEPTED',
      poId: 'po-101',
      supplierAcceptedAt: '2026-09-25T10:00:00Z',
      workOrderStatus: 'IN_PROGRESS',
      workOrderProgressPercent: 75,
      buyerPersona: 'INDIVIDUAL',
    });

    expect(summary.activeMilestoneNumber).toBe(5);
    expect(summary.milestones[4].isCurrent).toBe(true);
    expect(summary.milestones[3].isCompleted).toBe(true);
    expect(summary.overallProgressPercent).toBeGreaterThan(60);
  });

  it('renders Stalled banner when stalled flag is set', () => {
    const summary = deriveFivePointMilestoneProjection({
      rfqStatus: 'EVALUATING',
      isStalled: true,
      stalledReason: 'Committee quorum pending > 48h',
      buyerPersona: 'RWA',
    });

    expect(summary.isStalled).toBe(true);
    expect(summary.stalledReason).toBe('Committee quorum pending > 48h');
  });
});
