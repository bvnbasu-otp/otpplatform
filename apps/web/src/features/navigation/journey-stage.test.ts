import { describe, expect, it } from 'vitest';
import type { RoleContext } from '@/features/roles/api/roles';
import { inferJourneyStageFromPath, workspaceChromeTopCss } from './journey-stage';
import { getBottomNavFourthTab } from './navigation-config';

describe('workspace journey stage inference', () => {
  it('maps intake and requirement detail to TELL', () => {
    expect(inferJourneyStageFromPath('/intake')).toBe('TELL');
    expect(inferJourneyStageFromPath('/requirements/req-abc-123')).toBe('TELL');
  });

  it('maps discovery and RFQ review paths to REVIEW', () => {
    expect(inferJourneyStageFromPath('/requirements/req-1/discover')).toBe('REVIEW');
    expect(inferJourneyStageFromPath('/requirements/req-1/rfq-review')).toBe('REVIEW');
    expect(inferJourneyStageFromPath('/supplier/rfq/rfq-1/quote')).toBe('REVIEW');
  });

  it('maps evaluation and governance paths to DECIDE', () => {
    expect(inferJourneyStageFromPath('/rfq/rfq-1/evaluation')).toBe('DECIDE');
    expect(inferJourneyStageFromPath('/rfq/rfq-1/award')).toBe('DECIDE');
    expect(inferJourneyStageFromPath('/governance/evaluations/rfq-1/vote')).toBe('DECIDE');
  });

  it('maps orders and work orders to TRACK', () => {
    expect(inferJourneyStageFromPath('/purchase-orders')).toBe('TRACK');
    expect(inferJourneyStageFromPath('/purchase-orders/po-1')).toBe('TRACK');
    expect(inferJourneyStageFromPath('/supplier/work-orders/wo-1')).toBe('TRACK');
  });

  it('hides the strip on hub and admin routes', () => {
    expect(inferJourneyStageFromPath('/dashboard')).toBeNull();
    expect(inferJourneyStageFromPath('/profile')).toBeNull();
    expect(inferJourneyStageFromPath('/admin')).toBeNull();
    expect(inferJourneyStageFromPath('/admin?tab=transactions')).toBeNull();
  });

  it('expands chrome height when the journey strip is shown', () => {
    expect(workspaceChromeTopCss(false)).toBe('3rem');
    expect(workspaceChromeTopCss(true)).toBe('5.25rem');
  });
});

describe('bottom nav fourth tab by role', () => {
  const supplierCtx = {
    side: 'SUPPLIER',
    isPlatformAdmin: false,
  } as RoleContext;
  const buyerCtx = {
    side: 'BUYER',
    isPlatformAdmin: false,
  } as RoleContext;

  it('routes suppliers to Quotes and buyers to Audit', () => {
    expect(getBottomNavFourthTab(supplierCtx)).toMatchObject({
      id: 'quotes',
      to: '/supplier/quotes',
    });
    expect(getBottomNavFourthTab(buyerCtx)).toMatchObject({
      id: 'audit',
      to: '/audit',
    });
  });
});
