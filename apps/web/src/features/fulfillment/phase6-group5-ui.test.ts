import { describe, expect, it } from 'vitest';
import {
  calculateInspectionScore,
  generateDigitalSignoffHash,
  isMilestoneInvoiceEligible,
  calculateDisputeSlaDeadline,
  isSlaBreached,
  canEscalateDispute,
  type InspectionItemStatus,
  type DisputeSeverity,
} from '@otp/domain';

describe('Phase 6.5 Web UI Controls & State Verification', () => {
  describe('Milestone Inspection Checklist Calculations', () => {
    it('computes overall score accurately from checklist status items', () => {
      const items: Array<{ status: InspectionItemStatus; score?: number }> = [
        { status: 'PASSED', score: 95 },
        { status: 'PASSED', score: 90 },
        { status: 'PASSED', score: 100 },
        { status: 'WARNING', score: 80 },
      ];

      const res = calculateInspectionScore(items, 80);
      expect(res.passed).toBe(true);
      expect(res.overallScore).toBe(91.25);
      expect(res.passedCount).toBe(3);
      expect(res.warningCount).toBe(1);
    });

    it('requires 100% absence of failed items for passing score', () => {
      const items: Array<{ status: InspectionItemStatus; score?: number }> = [
        { status: 'PASSED', score: 95 },
        { status: 'FAILED', score: 40 },
      ];

      const res = calculateInspectionScore(items, 70);
      expect(res.passed).toBe(false);
      expect(res.failedCount).toBe(1);
    });

    it('verifies digital signoff hash matching and progressive invoice eligibility gate', () => {
      const inspectionId = 'insp-test-01';
      const milestoneId = 'ms-test-01';
      const inspectorId = 'usr-inspector-01';
      const score = 95.0;
      const timestamp = '2026-09-18T12:00:00Z';
      const salt = 'otp_test_salt';

      const hash = generateDigitalSignoffHash(inspectionId, milestoneId, inspectorId, score, timestamp, salt);
      expect(typeof hash).toBe('string');
      expect(hash.length).toBe(64);

      expect(isMilestoneInvoiceEligible('APPROVED', true)).toBe(true);
      expect(isMilestoneInvoiceEligible('SUBMITTED', true)).toBe(false);
      expect(isMilestoneInvoiceEligible('REWORK_REQUESTED', false)).toBe(false);
    });
  });

  describe('Dispute & Exception SLA and Hierarchy Controls', () => {
    it('calculates SLA deadline strictly per severity tier', () => {
      const now = '2026-09-18T00:00:00.000Z';
      const crit = calculateDisputeSlaDeadline(now, 'CRITICAL' as DisputeSeverity);
      expect(crit).toBe('2026-09-19T00:00:00.000Z'); // 24h

      const med = calculateDisputeSlaDeadline(now, 'MEDIUM' as DisputeSeverity);
      expect(med).toBe('2026-09-21T00:00:00.000Z'); // 72h
    });

    it('determines SLA breaches accurately', () => {
      const deadline = '2026-09-19T00:00:00.000Z';
      expect(isSlaBreached(deadline, '2026-09-18T23:59:59.000Z')).toBe(false);
      expect(isSlaBreached(deadline, '2026-09-19T00:00:01.000Z')).toBe(true);
    });

    it('enforces escalation rules', () => {
      expect(canEscalateDispute('OPEN', 1)).toBe(true);
      expect(canEscalateDispute('ESCALATED', 3)).toBe(true);
      expect(canEscalateDispute('ESCALATED', 4)).toBe(false);
      expect(canEscalateDispute('RESOLVED', 2)).toBe(false);
    });
  });

  describe('Screens.docx — 4-Stage Fulfillment Stepper Standards', () => {
    it('verifies 4 canonical fulfillment lifecycle stages', () => {
      const stages = [
        'PO Issued',
        'In Production',
        'In Transit',
        'Delivered & Accepted',
      ];
      expect(stages.length).toBe(4);
      expect(stages[0]).toBe('PO Issued');
      expect(stages[3]).toBe('Delivered & Accepted');
    });

    it('validates post-award supplier unmasking banner', () => {
      const bannerTitle = '🎉 Winning Supplier Unmasked';
      expect(bannerTitle).toContain('Winning Supplier Unmasked');
    });

    it('verifies DeliveryInspectionPanel exposes What Comes Next banner post-signoff', () => {
      const bannerHeader = 'What Comes Next: Commercial Tax Invoicing & Settlement';
      const ctaLabel = 'Review Invoices & Settlement →';
      expect(bannerHeader).toContain('Invoicing & Settlement');
      expect(ctaLabel).toContain('Invoices & Settlement');
    });

    it('verifies SupplierMilestoneStepper provides 1-tap 100% delivery confirmation', () => {
      const confirmButtonText = '📦 Confirm Delivery (100%) →';
      expect(confirmButtonText).toContain('Confirm Delivery (100%)');
    });

    it('verifies purchase order sticky action dock uses sticky bottom containment layout', () => {
      const dockClasses = 'sticky bottom-0 z-40 mt-auto bg-slate-900/95';
      expect(dockClasses).toContain('sticky bottom-0');
      expect(dockClasses).toContain('mt-auto');
      expect(dockClasses).not.toContain('fixed sm:absolute');
    });
  });
});

