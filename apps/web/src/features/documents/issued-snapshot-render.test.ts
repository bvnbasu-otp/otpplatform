import { describe, expect, it } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { buildCanonicalDecisionReceipt } from '@otp/domain';
import { buildDecisionReceiptProcurementDocumentInput } from '@otp/domain';
import { PrintableProcurementDocument } from '@/features/reporting/components/PrintableProcurementDocument';
import { buildPrintModelFromIssuedSnapshot } from './lib/issued-snapshot-render';
import type { IssuedDocumentSnapshotRow } from './api/fetch-issued-document-snapshot';

function sampleSnapshot(identity: 'PRE_REVEAL' | 'POST_REVEAL'): IssuedDocumentSnapshotRow {
  const receipt = buildCanonicalDecisionReceipt({
    rfqId: 'f1000000-0000-4000-8000-000000000010',
    rfqRefNumber: 'RFQ-SNAPSHOT',
    rfqTitle: 'Snapshot render test',
    buyerPersona: 'INDIVIDUAL',
    buyerContext: {
      organizationId: 'a0000000-0000-4000-8000-000000000010',
      organizationName: 'Buyer Org',
      buyerName: 'Buyer',
      deliveryStateCode: '29',
    },
    requirementSnapshot: {
      requirementId: 'r1',
      title: 'Req',
      categoryName: 'Cat',
      mode: 'DIRECT_PURCHASE',
    },
    selectedOffer: {
      quoteId: 'q1',
      quoteVersion: 1,
      supplierId: identity === 'POST_REVEAL' ? 'd0000000-0000-4000-8000-000000000001' : null,
      maskedSupplierLabel: 'Supplier #01',
      businessName: identity === 'POST_REVEAL' ? 'Apex Works Pvt Ltd' : null,
      baseAmount: 1000,
      gstRate: 18,
      gstAmount: 180,
      cgstAmount: 90,
      sgstAmount: 90,
      igstAmount: 0,
      isInterState: false,
      totalLandedCost: 1180,
      deliveryTimelineDays: 7,
      warrantyPeriodMonths: 12,
      paymentStructure: 'MILESTONE_BASED',
    },
    meritEvaluation: {
      rank: 1,
      score: 9,
      totalQuotesEvaluated: 2,
      lowestTotalCost: 1180,
      consensusJustification: 'Test',
    },
    authorityAttribution: {
      awardedByProfileId: 'p1',
      awardedByName: 'Manager',
      awardedByRole: 'MANAGER',
      isDelegated: false,
    },
    governanceRecord: { persona: 'INDIVIDUAL' },
    awardedAt: '2026-01-01T00:00:00.000Z',
    receiptGeneratedAt: '2026-01-01T00:00:01.000Z',
  });

  const procInput = buildDecisionReceiptProcurementDocumentInput(receipt, {
    viewerRole: 'buyer',
    phase: identity === 'PRE_REVEAL' ? 'PRE_AWARD' : 'POST_AWARD',
    generatedAt: receipt.timestamps.receiptGeneratedAt,
  });

  return {
    id: '00000000-0000-4000-8000-000000000099',
    document_id: 'OTP-DOC-TEST-2026-000001',
    organization_id: 'a0000000-0000-4000-8000-000000000010',
    document_kind: 'DECISION_RECEIPT',
    document_number: receipt.receiptId,
    source_entity_type: 'AWARD',
    source_entity_id: '00000000-0000-4000-8000-000000000098',
    source_supplier_id: null,
    identity_state: identity,
    perspective: 'BUYER',
    payload_json: {
      schemaVersion: '1',
      canonicalDecisionReceipt: receipt,
      reputationAppendix: null,
      procurementDocumentInput: procInput,
      sourceAuditRefs: {
        awardId: '00000000-0000-4000-8000-000000000098',
        purchaseOrderId: null,
        invoiceId: null,
        rfqId: receipt.rfqId,
        quoteId: 'q1',
        quoteVersion: 1,
      },
    },
    verification_digest: receipt.cryptographicAuditHash,
    verification_algorithm: 'OTP_DECISION_RECEIPT_V1',
    verification_ref: 'VR-00000001',
    idempotency_key: 'test:idem',
    generated_at: receipt.timestamps.receiptGeneratedAt,
    status: 'ISSUED',
  };
}

describe('issued snapshot print model', () => {
  it('protected snapshot HTML hides real supplier in From/To parties', () => {
    const model = buildPrintModelFromIssuedSnapshot(sampleSnapshot('PRE_REVEAL'));
    expect(model).not.toBeNull();
    const html = renderToStaticMarkup(React.createElement(PrintableProcurementDocument, { model: model! }));
    expect(html).toContain('Ref: REC-');
    expect(html).toContain('Document Integrity Reference');
    expect(html).toContain('Open Trade &amp; Procurement');
    expect(html).toContain('Supplier #01');
    expect(html).not.toContain('Apex Works Pvt Ltd');
    expect(html).toMatch(/data-section="verification"/);
    expect(html).toMatch(/data-section="footer"/);
  });

  it('post-reveal snapshot names the awarded supplier', () => {
    const model = buildPrintModelFromIssuedSnapshot(sampleSnapshot('POST_REVEAL'));
    const html = renderToStaticMarkup(React.createElement(PrintableProcurementDocument, { model: model! }));
    expect(html).toContain('Apex Works Pvt Ltd');
  });
});
