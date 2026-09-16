import { describe, expect, it } from 'vitest';
import {
  deriveCoreProcurementState,
  deriveLinearStepNumber,
  isOrderStalled,
  getStageStepState,
  resolveLinearStepUrl,
  resolveStageNavigationUrl,
  mapLinearStepToCoreState,
  mapCoreStateToDefaultLinearStep,
  CORE_PROCUREMENT_STATES,
  CHRONOLOGICAL_STAGES,
  type CoreProcurementState,
} from './procurement-state';
import type { LifecycleSignals } from './lifecycle';

describe('8 Core Procurement States Lifecycle Engine', () => {
  it('defines all 8 states with metadata descriptors', () => {
    const states: CoreProcurementState[] = [
      'DRAFT',
      'QUOTING',
      'EVALUATING',
      'AWARDED',
      'PO_ISSUED',
      'INVOICED',
      'SETTLED',
      'STALLED',
    ];

    expect(Object.keys(CORE_PROCUREMENT_STATES)).toEqual(states);
    expect(CHRONOLOGICAL_STAGES).toEqual([
      'DRAFT',
      'QUOTING',
      'EVALUATING',
      'AWARDED',
      'PO_ISSUED',
      'INVOICED',
      'SETTLED',
    ]);
  });

  describe('deriveCoreProcurementState', () => {
    it('resolves DRAFT for new requirements without RFQ or in draft RFQ', () => {
      expect(deriveCoreProcurementState({ requirementStatus: 'DRAFT' })).toBe('DRAFT');
      expect(deriveCoreProcurementState({ requirementStatus: 'SUBMITTED', rfqStatus: 'DRAFT' })).toBe('DRAFT');
    });

    it('resolves QUOTING when RFQ is open for supplier quoting', () => {
      expect(deriveCoreProcurementState({ requirementStatus: 'QUOTING', rfqStatus: 'OPEN' })).toBe('QUOTING');
      expect(deriveCoreProcurementState({ requirementStatus: 'NEGOTIATION', rfqStatus: 'CLARIFICATION' })).toBe('QUOTING');
    });

    it('resolves EVALUATING when RFQ is evaluating or closed with quotes', () => {
      expect(deriveCoreProcurementState({ requirementStatus: 'EVALUATION', rfqStatus: 'EVALUATING' })).toBe('EVALUATING');
      expect(deriveCoreProcurementState({ requirementStatus: 'EVALUATION', rfqStatus: 'CLOSED' })).toBe('EVALUATING');
    });

    it('resolves AWARDED when RFQ is awarded / winner revealed', () => {
      expect(deriveCoreProcurementState({ requirementStatus: 'AWARDED', rfqStatus: 'AWARDED' })).toBe('AWARDED');
      expect(deriveCoreProcurementState({ rfqStatus: 'AWARDED', revealStatus: 'REVEALED' })).toBe('AWARDED');
    });

    it('resolves PO_ISSUED when purchase order is issued or work order is in progress', () => {
      expect(deriveCoreProcurementState({ poStatus: 'ISSUED' })).toBe('PO_ISSUED');
      expect(deriveCoreProcurementState({ poStatus: 'ACCEPTED', workOrderStatus: 'IN_PROGRESS' })).toBe('PO_ISSUED');
      expect(deriveCoreProcurementState({ poStatus: 'IN_PROGRESS', workOrderProgressPercent: 50 })).toBe('PO_ISSUED');
    });

    it('resolves INVOICED when GST invoice has been submitted or approved', () => {
      expect(deriveCoreProcurementState({ poStatus: 'IN_PROGRESS', invoiceStatus: 'SUBMITTED' })).toBe('INVOICED');
      expect(deriveCoreProcurementState({ poStatus: 'COMPLETED', invoiceStatus: 'APPROVED' })).toBe('INVOICED');
    });

    it('resolves SETTLED when payment is verified or invoice is paid or requirement completed', () => {
      expect(deriveCoreProcurementState({ invoiceStatus: 'PAID' })).toBe('SETTLED');
      expect(deriveCoreProcurementState({ paymentStatus: 'VERIFIED' })).toBe('SETTLED');
      expect(deriveCoreProcurementState({ requirementStatus: 'COMPLETED' })).toBe('SETTLED');
    });

    it('detects STALLED state when checkStalled is enabled and idleHours > 24', () => {
      const activeSignals: LifecycleSignals = { requirementStatus: 'QUOTING', rfqStatus: 'OPEN' };
      expect(deriveCoreProcurementState(activeSignals, { idleHours: 12, checkStalled: true })).toBe('QUOTING');
      expect(deriveCoreProcurementState(activeSignals, { idleHours: 25, checkStalled: true })).toBe('STALLED');
    });
  });

  describe('isOrderStalled', () => {
    it('returns true when idle hours exceed 24 for active stages', () => {
      expect(isOrderStalled({ requirementStatus: 'QUOTING' }, undefined, 26)).toBe(true);
      expect(isOrderStalled({ requirementStatus: 'QUOTING' }, undefined, 10)).toBe(false);
    });

    it('returns false for completed or cancelled orders regardless of idle hours', () => {
      expect(isOrderStalled({ requirementStatus: 'COMPLETED' }, undefined, 100)).toBe(false);
      expect(isOrderStalled({ requirementStatus: 'CANCELLED' }, undefined, 100)).toBe(false);
      expect(isOrderStalled({ paymentStatus: 'VERIFIED' }, undefined, 100)).toBe(false);
    });
  });

  describe('getStageStepState', () => {
    it('correctly marks past stages as DONE, current as CURRENT, and future as PENDING', () => {
      expect(getStageStepState('DRAFT', 'EVALUATING')).toBe('DONE');
      expect(getStageStepState('QUOTING', 'EVALUATING')).toBe('DONE');
      expect(getStageStepState('EVALUATING', 'EVALUATING')).toBe('CURRENT');
      expect(getStageStepState('AWARDED', 'EVALUATING')).toBe('PENDING');
      expect(getStageStepState('PO_ISSUED', 'EVALUATING')).toBe('PENDING');
    });
  });

  describe('resolveStageNavigationUrl', () => {
    const ids = { requirementId: 'req-1', rfqId: 'rfq-1', poId: 'po-1' };

    it('resolves correct URLs for each stage for buyers', () => {
      expect(resolveStageNavigationUrl('DRAFT', ids, 'buyer')).toBe('/requirements/req-1');
      expect(resolveStageNavigationUrl('QUOTING', ids, 'buyer')).toBe('/requirements/req-1/discover');
      expect(resolveStageNavigationUrl('EVALUATING', ids, 'buyer')).toBe('/rfq/rfq-1/quotes');
      expect(resolveStageNavigationUrl('AWARDED', ids, 'buyer')).toBe('/rfq/rfq-1/reveal');
      expect(resolveStageNavigationUrl('PO_ISSUED', ids, 'buyer')).toBe('/purchase-orders/po-1');
      expect(resolveStageNavigationUrl('INVOICED', ids, 'buyer')).toBe('/purchase-orders/po-1?stage=invoiced');
      expect(resolveStageNavigationUrl('SETTLED', ids, 'buyer')).toBe('/purchase-orders/po-1?stage=settled');
    });

    it('resolves correct URLs for suppliers', () => {
      expect(resolveStageNavigationUrl('QUOTING', ids, 'supplier')).toBe('/supplier/rfq/rfq-1');
      expect(resolveStageNavigationUrl('PO_ISSUED', ids, 'supplier')).toBe('/supplier/purchase-orders/po-1');
    });
  });

  describe('Linear 15-Step Pipeline Derivations', () => {
    const ids = { requirementId: 'req-1', rfqId: 'rfq-1', poId: 'po-1' };

    it('maps linear steps to 7-State Golden Path Core States', () => {
      expect(mapLinearStepToCoreState(1)).toBe('DRAFT');
      expect(mapLinearStepToCoreState(2)).toBe('QUOTING');
      expect(mapLinearStepToCoreState(5)).toBe('QUOTING');
      expect(mapLinearStepToCoreState(6)).toBe('EVALUATING');
      expect(mapLinearStepToCoreState(8)).toBe('EVALUATING');
      expect(mapLinearStepToCoreState(9)).toBe('AWARDED');
      expect(mapLinearStepToCoreState(12)).toBe('AWARDED');
      expect(mapLinearStepToCoreState(13)).toBe('PO_ISSUED');
      expect(mapLinearStepToCoreState(14)).toBe('PO_ISSUED');
      expect(mapLinearStepToCoreState(15)).toBe('SETTLED');
    });

    it('maps core states to default starting linear step numbers', () => {
      expect(mapCoreStateToDefaultLinearStep('DRAFT')).toBe(1);
      expect(mapCoreStateToDefaultLinearStep('QUOTING')).toBe(2);
      expect(mapCoreStateToDefaultLinearStep('EVALUATING')).toBe(6);
      expect(mapCoreStateToDefaultLinearStep('AWARDED')).toBe(9);
      expect(mapCoreStateToDefaultLinearStep('PO_ISSUED')).toBe(13);
      expect(mapCoreStateToDefaultLinearStep('SETTLED')).toBe(15);
    });

    it('derives step 3 for market intelligence path', () => {
      expect(deriveLinearStepNumber(null, '/requirements/req-1/market-intelligence')).toBe(3);
    });

    it('derives step 6 for evaluation comparison path', () => {
      expect(deriveLinearStepNumber(null, '/rfq/rfq-1/evaluation')).toBe(6);
    });

    it('derives step 8 for voting ballot path', () => {
      expect(deriveLinearStepNumber(null, '/rfq/rfq-1/committee')).toBe(8);
    });

    it('resolves linear step URLs', () => {
      expect(resolveLinearStepUrl(1, ids)).toBe('/requirements/req-1');
      expect(resolveLinearStepUrl(2, ids)).toBe('/requirements/req-1/discover');
      expect(resolveLinearStepUrl(3, ids)).toBe('/requirements/req-1/market-intelligence');
      expect(resolveLinearStepUrl(6, ids)).toBe('/rfq/rfq-1/evaluation');
      expect(resolveLinearStepUrl(7, ids)).toBe('/rfq/rfq-1/committee');
      expect(resolveLinearStepUrl(12, ids)).toBe('/rfq/rfq-1/reveal');
      expect(resolveLinearStepUrl(13, ids)).toBe('/purchase-orders/po-1');
    });
  });
});
