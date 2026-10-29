import { supabase } from '@/lib/supabase';
import type { AwardStatus } from '@otp/domain';
import type { AwardSummary } from '@/features/award/api/awards';

interface AwardRow {
  id: string;
  rfq_id: string;
  quote_id: string;
  awarded_by: string;
  justification: { text?: string };
  status: AwardStatus;
  awarded_at: string;
  revealed_at: string | null;
  votes_locked_at: string | null;
}

export async function fetchAwardForReveal(rfqId: string): Promise<
  { ok: true; award: AwardSummary | null } | { ok: false; error: string }
> {
  const { data, error } = await supabase
    .from('awards')
    .select(
      'id, rfq_id, quote_id, awarded_by, justification, status, awarded_at, revealed_at, votes_locked_at',
    )
    .eq('rfq_id', rfqId)
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: true, award: null };

  const row = data as AwardRow;
  return {
    ok: true,
    award: {
      id: row.id,
      rfqId: row.rfq_id,
      quoteId: row.quote_id,
      awardedBy: row.awarded_by,
      justificationText: row.justification?.text ?? '',
      status: row.status,
      awardedAt: row.awarded_at,
      revealedAt: row.revealed_at,
      votesLockedAt: row.votes_locked_at,
    },
  };
}

export interface RevealedWinner {
  supplierId: string;
  businessName: string;
  contactPhone: string | null;
  contactEmail: string | null;
  /** The alias the committee knew them by, kept so the identity-protected trail still reads. */
  aliasBeforeReveal: string | null;
  revealedAt: string | null;
  alreadyRevealed: boolean;
  poId?: string | null;
  poNumber?: string | null;
}

/**
 * Reveals the winner.
 *
 * One-way and idempotent on the server: a revealed RFQ cannot be hidden again,
 * and a double click does not become a second reveal. The RPC also returns who
 * they had been anonymous as, so the record still ties the decision to the
 * alias the committee actually voted on.
 */
export async function revealSupplier(rfqId: string): Promise<
  { ok: true; winner: RevealedWinner } | { ok: false; error: string }
> {
  const { data, error } = await supabase.rpc('reveal_award', { p_rfq_id: rfqId });

  if (error) return { ok: false, error: error.message };

  const result = (data ?? {}) as Record<string, unknown>;
  if (!result.supplier_id) return { ok: false, error: 'The reveal returned no winner' };

  return {
    ok: true,
    winner: {
      supplierId: String(result.supplier_id),
      businessName: String(result.business_name ?? ''),
      contactPhone: (result.contact_phone as string | null) ?? null,
      contactEmail: (result.contact_email as string | null) ?? null,
      aliasBeforeReveal: (result.alias_before_reveal as string | null) ?? null,
      revealedAt: (result.revealed_at as string | null) ?? null,
      alreadyRevealed: Boolean(result.already_revealed),
      poId: (result.po_id as string | null) ?? null,
      poNumber: (result.po_number as string | null) ?? null,
    },
  };
}

export interface SupplierFeeDetails {
  rfqId: string;
  awardId: string;
  quoteId: string;
  supplierId: string;
  agreedTransactionValue: number;
  feeRatePercent: number;
  feeAmount: number;
  gstRatePercent: number;
  gstAmount: number;
  totalFeePayable: number;
  currency: string;
  status: 'PENDING' | 'SUCCEEDED' | 'DISPUTED' | 'REFUNDED';
  nonRefundTermsAccepted: boolean;
  termsVersion: string | null;
  paidAt: string | null;
  nonRefundPolicySummary: string;
}

export async function fetchSupplierFeeDetails(rfqId: string): Promise<
  { ok: true; feeDetails: SupplierFeeDetails } | { ok: false; error: string }
> {
  const { data, error } = await supabase.rpc('get_supplier_fee_details', { p_rfq_id: rfqId });
  if (error) return { ok: false, error: error.message };

  const res = (data ?? {}) as Record<string, unknown>;
  if (!res.ok) return { ok: false, error: String(res.error ?? 'Failed to retrieve fee details') };

  return {
    ok: true,
    feeDetails: {
      rfqId: String(res.rfq_id),
      awardId: String(res.award_id),
      quoteId: String(res.quote_id),
      supplierId: String(res.supplier_id),
      agreedTransactionValue: Number(res.agreed_transaction_value || 0),
      feeRatePercent: Number(res.fee_rate_percent || 0.5),
      feeAmount: Number(res.fee_amount || 0),
      gstRatePercent: Number(res.gst_rate_percent || 18),
      gstAmount: Number(res.gst_amount || 0),
      totalFeePayable: Number(res.total_fee_payable || 0),
      currency: String(res.currency ?? 'INR'),
      status: (res.status as any) || 'PENDING',
      nonRefundTermsAccepted: Boolean(res.non_refund_terms_accepted),
      termsVersion: (res.terms_version as string | null) ?? null,
      paidAt: (res.paid_at as string | null) ?? null,
      nonRefundPolicySummary: String(res.non_refund_policy_summary ?? ''),
    },
  };
}

export async function acceptSupplierFeeTerms(
  rfqId: string,
  termsVersion = '2026-10-V1',
): Promise<{ ok: true; termsVersion: string; acceptedAt: string } | { ok: false; error: string }> {
  const { data, error } = await supabase.rpc('accept_supplier_fee_terms', {
    p_rfq_id: rfqId,
    p_terms_version: termsVersion,
  });
  if (error) return { ok: false, error: error.message };
  const res = (data ?? {}) as Record<string, unknown>;
  if (!res.ok) return { ok: false, error: String(res.error ?? 'Failed to accept terms') };
  return {
    ok: true,
    termsVersion: String(res.terms_version ?? termsVersion),
    acceptedAt: String(res.accepted_at ?? new Date().toISOString()),
  };
}

export async function paySupplierFeeSimulated(
  rfqId: string,
  idempotencyKey?: string,
  paymentReference?: string,
): Promise<{ ok: true; feeOrderId: string; status: string; totalPaid: number } | { ok: false; error: string }> {
  const { data, error } = await supabase.rpc('pay_supplier_fee_simulated', {
    p_rfq_id: rfqId,
    p_idempotency_key: idempotencyKey ?? null,
    p_payment_reference: paymentReference ?? null,
  });
  if (error) return { ok: false, error: error.message };
  const res = (data ?? {}) as Record<string, unknown>;
  if (!res.ok) return { ok: false, error: String(res.error ?? 'Failed to settle simulated fee') };
  return {
    ok: true,
    feeOrderId: String(res.fee_order_id ?? ''),
    status: String(res.status ?? 'SUCCEEDED'),
    totalPaid: Number(res.total_fee_paid || 0),
  };
}

export async function requestSupplierFeeRefund(
  rfqId: string,
  reason: string,
  exceptionCategory: 'DUPLICATE_PAYMENT' | 'GATEWAY_ERROR' | 'PLATFORM_REVEAL_FAILURE',
): Promise<{ ok: true; status: string; message: string } | { ok: false; error: string }> {
  const { data, error } = await supabase.rpc('request_supplier_fee_refund', {
    p_rfq_id: rfqId,
    p_reason: reason,
    p_exception_category: exceptionCategory,
  });
  if (error) return { ok: false, error: error.message };
  const res = (data ?? {}) as Record<string, unknown>;
  if (!res.ok) return { ok: false, error: String(res.error ?? 'Refund request failed') };
  return {
    ok: true,
    status: String(res.status ?? 'DISPUTED'),
    message: String(res.message ?? ''),
  };
}
