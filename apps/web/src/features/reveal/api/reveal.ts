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
