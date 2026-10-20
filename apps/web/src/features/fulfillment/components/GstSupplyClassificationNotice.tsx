import React from 'react';
import {
  normalizeSupplyGstTreatment,
  requiresGstClassificationReview,
  supplyGstReviewDetail,
  supplyGstTreatmentLabel,
  type SupplyGstTreatment,
} from '../lib/gst-supply-classification';

export interface GstSupplyClassificationNoticeProps {
  treatment?: string | null;
  className?: string;
}

export function GstSupplyClassificationNotice({
  treatment: raw,
  className = '',
}: GstSupplyClassificationNoticeProps) {
  const treatment = normalizeSupplyGstTreatment(raw);
  const review = requiresGstClassificationReview(treatment);

  return (
    <div
      className={`rounded-xl border p-3 text-xs space-y-1 ${review ? 'border-amber-500/40 bg-amber-500/5' : 'border-border bg-muted/30'} ${className}`}
      data-testid="gst-supply-classification-notice"
      data-treatment={treatment}
    >
      <p className="font-bold text-foreground">
        {review ? 'GST classification review required' : 'Supplier GST supply classification'}
      </p>
      <p className="text-muted-foreground">{supplyGstTreatmentLabel(treatment)}</p>
      <p className="text-muted-foreground">{supplyGstReviewDetail(treatment)}</p>
    </div>
  );
}

export function isGstTaxInvoiceClaimAllowed(treatment: SupplyGstTreatment): boolean {
  return treatment === 'REGULAR_TAXABLE';
}
