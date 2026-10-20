/** Engineering classification mirrored from `suppliers.supply_gst_treatment` — not a legal determination. */

export type SupplyGstTreatment =
  | 'REGULAR_TAXABLE'
  | 'UNREGISTERED'
  | 'COMPOSITION'
  | 'EXEMPT'
  | 'NIL_RATED'
  | 'ZERO_RATED'
  | 'REVIEW_REQUIRED';

export function normalizeSupplyGstTreatment(raw: string | null | undefined): SupplyGstTreatment {
  const v = (raw || 'REVIEW_REQUIRED').toUpperCase();
  const allowed: SupplyGstTreatment[] = [
    'REGULAR_TAXABLE',
    'UNREGISTERED',
    'COMPOSITION',
    'EXEMPT',
    'NIL_RATED',
    'ZERO_RATED',
    'REVIEW_REQUIRED',
  ];
  return (allowed.includes(v as SupplyGstTreatment) ? v : 'REVIEW_REQUIRED') as SupplyGstTreatment;
}

export function supplyGstTreatmentLabel(treatment: SupplyGstTreatment): string {
  switch (treatment) {
    case 'REGULAR_TAXABLE':
      return 'Regular taxable supply (GST tax invoice supported when PO snapshot aligns)';
    case 'UNREGISTERED':
      return 'Supplier recorded as not issuing GST tax invoices';
    case 'COMPOSITION':
      return 'Composition scheme — bill of supply, not a full GST tax invoice';
    case 'EXEMPT':
      return 'Exempt supply — no GST charged on this supply category';
    case 'NIL_RATED':
      return 'Nil-rated supply — 0% GST with nil-rating (distinct from exempt)';
    case 'ZERO_RATED':
      return 'Zero-rated supply — 0% GST (e.g. exports / specified supplies)';
    case 'REVIEW_REQUIRED':
    default:
      return 'GST supply classification needs review before tax lines are asserted';
  }
}

export function supplyGstReviewDetail(treatment: SupplyGstTreatment): string {
  switch (treatment) {
    case 'REVIEW_REQUIRED':
      return 'Confirm the supplier’s registered status, composition/exemption flags, and place-of-supply inputs with your tax adviser. Absence of a GSTIN on file does not prove the supplier is unregistered.';
    case 'UNREGISTERED':
      return 'Submit commercial invoices without CGST/SGST/IGST/UTGST tax component lines. OTP does not infer unregistered status from a missing GSTIN alone.';
    case 'COMPOSITION':
      return 'Use a bill of supply; do not assert full input-tax-credit style GST tax invoice lines unless your adviser confirms eligibility.';
    case 'EXEMPT':
    case 'NIL_RATED':
    case 'ZERO_RATED':
      return 'Tax component lines must remain zero. Exempt, nil-rated and zero-rated supplies are not interchangeable labels.';
    case 'REGULAR_TAXABLE':
      return 'Tax lines must reconcile with the awarded PO / quote tax snapshot. OTP does not approve the legal correctness of the classification.';
    default:
      return '';
  }
}

export function gstTaxComponentsDisallowed(treatment: SupplyGstTreatment): boolean {
  return treatment !== 'REGULAR_TAXABLE';
}

export function canSubmitGstTaxLines(
  treatment: SupplyGstTreatment,
  taxComponentTotal: number,
): { ok: true } | { ok: false; reason: string } {
  if (!Number.isFinite(taxComponentTotal) || taxComponentTotal < 0) {
    return { ok: false, reason: 'Tax amounts must be valid non-negative numbers.' };
  }
  if (taxComponentTotal === 0) return { ok: true };
  if (gstTaxComponentsDisallowed(treatment)) {
    return {
      ok: false,
      reason: `GST tax lines are not supported for classification “${supplyGstTreatmentLabel(treatment)}”.`,
    };
  }
  return { ok: true };
}

export function requiresGstClassificationReview(treatment: SupplyGstTreatment): boolean {
  return treatment === 'REVIEW_REQUIRED';
}
