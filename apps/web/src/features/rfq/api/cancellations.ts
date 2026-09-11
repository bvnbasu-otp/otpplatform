import { supabase } from '@/lib/supabase';

export type ExitReasonCode =
  | 'BUDGET_CANCELLED'
  | 'INTERNAL_REORGANIZATION'
  | 'SPECIFICATION_CHANGED'
  | 'SUPPLIER_UNRESPONSIVE_POST_REVEAL'
  | 'SUPPLIER_FAILED_SITE_INSPECTION'
  | 'PROCUREMENT_TIMELINE_DEFERRED'
  | 'PRICING_EXCEEDED_BUDGET_CEILING'
  | 'OTHER';

export interface ExitReasonOption {
  code: ExitReasonCode;
  label: string;
  description: string;
}

export const EXIT_REASON_OPTIONS: ExitReasonOption[] = [
  {
    code: 'BUDGET_CANCELLED',
    label: 'Budget Cancelled / Board Veto',
    description: 'Society / Committee did not approve the project budget.',
  },
  {
    code: 'SPECIFICATION_CHANGED',
    label: 'Scope / Technical Specs Changed',
    description: 'Procurement requirements need significant overhaul or retendering.',
  },
  {
    code: 'SUPPLIER_UNRESPONSIVE_POST_REVEAL',
    label: 'Supplier Unresponsive Post-Reveal',
    description: 'Winning supplier is unreachable or declined to honor the quoted terms.',
  },
  {
    code: 'SUPPLIER_FAILED_SITE_INSPECTION',
    label: 'Supplier Failed Site Inspection',
    description: 'Physical site visit revealed supplier lacks required machinery/manpower.',
  },
  {
    code: 'PRICING_EXCEEDED_BUDGET_CEILING',
    label: 'Pricing Exceeded Ceiling',
    description: 'All submitted quotes exceed maximum authorized financial limit.',
  },
  {
    code: 'PROCUREMENT_TIMELINE_DEFERRED',
    label: 'Project Postponed',
    description: 'Execution deferred to a future financial quarter or fiscal year.',
  },
  {
    code: 'OTHER',
    label: 'Other Grounded Business Reason',
    description: 'Other verified operational or administrative factor.',
  },
];

export async function processRfqCancellation(
  rfqId: string,
  reasonCode: ExitReasonCode,
  detailedNotes: string,
  supportingDocId?: string,
): Promise<{ ok: true; isSuspicious: boolean; flags: string[] } | { ok: false; error: string }> {
  const { data, error } = await supabase.rpc('process_rfq_cancellation', {
    p_rfq_id: rfqId,
    p_reason_code: reasonCode,
    p_detailed_notes: detailedNotes,
    p_supporting_doc_id: supportingDocId ?? null,
  });

  if (error) return { ok: false, error: error.message };

  const res = (data ?? {}) as { is_suspicious?: boolean; reasons?: string[] };
  return {
    ok: true,
    isSuspicious: Boolean(res.is_suspicious),
    flags: res.reasons ?? [],
  };
}
