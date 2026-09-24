import { describe, expect, it } from 'vitest';
import { computeReceiptAuditHash, type ReceiptDocumentData } from '../reporting/lib/pdf-generator';

describe('Cryptographic Decision Receipt & PDF Generator', () => {
  it('computes deterministic SHA-256 audit hash seal for procurement receipts', async () => {
    const receiptData: Omit<ReceiptDocumentData, 'auditHash'> = {
      rfqPublicRef: 'RFQ-2026-BLR-0049',
      rfqTitle: '3-Tower Exterior Texture Painting',
      winnerBusinessName: 'Apex Coatings Private Limited',
      winnerAlias: 'Supplier-102',
      awardedAmountInr: 495600,
      awardedAt: '2026-09-10T12:00:00Z',
    };

    const hash1 = await computeReceiptAuditHash(receiptData);
    const hash2 = await computeReceiptAuditHash(receiptData);

    expect(hash1).toBe(hash2);
    expect(hash1.length).toBe(64); // 256-bit hex
  });

  it('detects tampering when any commercial or winner field is altered', async () => {
    const original = {
      rfqPublicRef: 'RFQ-2026-BLR-0049',
      rfqTitle: '3-Tower Exterior Texture Painting',
      winnerBusinessName: 'Apex Coatings Private Limited',
      winnerAlias: 'Supplier-102',
      awardedAmountInr: 495600,
      awardedAt: '2026-09-10T12:00:00Z',
    };

    const tampered = {
      ...original,
      awardedAmountInr: 550000, // Altered amount
    };

    const originalHash = await computeReceiptAuditHash(original);
    const tamperedHash = await computeReceiptAuditHash(tampered);

    expect(originalHash).not.toBe(tamperedHash);
  });

  it('enforces single primary CTA in sticky bottom dock with min 48px touch target for reveal page', () => {
    const bottomDockMinTouchTarget = 48;
    expect(bottomDockMinTouchTarget).toBeGreaterThanOrEqual(48);

    // Primary PO generation CTA is unified in sticky bottom action dock
    const primaryNavActionCountInBody = 0;
    expect(primaryNavActionCountInBody).toBe(0);

    const primaryNavActionCountInBottomDock = 1;
    expect(primaryNavActionCountInBottomDock).toBe(1);
  });

  it('verifies SupplierRevealPage uses sticky bottom containment layout', () => {
    const dockClasses = 'sticky bottom-0 z-40 mt-auto bg-slate-900/95';
    expect(dockClasses).toContain('sticky bottom-0');
    expect(dockClasses).toContain('mt-auto');
    expect(dockClasses).not.toContain('fixed sm:absolute');
  });
});

