import { supabase } from '@/lib/supabase';
import type { AwardStatus } from '@otp/domain';

export interface AwardSummary {
  id: string;
  rfqId: string;
  quoteId: string;
  awardedBy: string;
  justificationText: string;
  status: AwardStatus;
  awardedAt: string;
  revealedAt: string | null;
  votesLockedAt: string | null;
}

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

function mapAward(row: AwardRow): AwardSummary {
  return {
    id: row.id,
    rfqId: row.rfq_id,
    quoteId: row.quote_id,
    awardedBy: row.awarded_by,
    justificationText: row.justification?.text ?? JSON.stringify(row.justification),
    status: row.status,
    awardedAt: row.awarded_at,
    revealedAt: row.revealed_at,
    votesLockedAt: row.votes_locked_at,
  };
}

export async function fetchAward(rfqId: string): Promise<
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
  return { ok: true, award: mapAward(data as AwardRow) };
}

/**
 * Locks the award.
 *
 * One call, one transaction: the vote tally is frozen onto the award, the
 * quotes are marked selected and not selected, and the RFQ and requirement
 * move to AWARDED. The suppliers stay anonymous — revealing is a separate,
 * deliberate act, which is the whole point of identity-protected evaluation.
 */
export async function lockAward(
  rfqId: string,
  quoteId: string,
  justificationText: string,
): Promise<
  { ok: true; awardId: string; votesLockedAt: string | null } | { ok: false; error: string }
> {
  const { data, error } = await supabase.rpc('lock_award', {
    p_rfq_id: rfqId,
    p_quote_id: quoteId,
    p_justification: justificationText,
  });

  if (error) return { ok: false, error: error.message };

  const result = (data ?? {}) as { award_id?: string; votes_locked_at?: string };
  if (!result.award_id) return { ok: false, error: 'The award was not recorded' };

  return {
    ok: true,
    awardId: result.award_id,
    votesLockedAt: result.votes_locked_at ?? null,
  };
}

export interface AtomicAwardResult {
  awardId: string;
  rfqId: string;
  quoteId: string;
  status: string;
  revealed: boolean;
  poId?: string | null;
  poNumber?: string | null;
  supplierId?: string | null;
  businessName?: string | null;
}

/**
 * Atomically locks the award, unmasks identities, and creates the Purchase Order in a single transaction.
 */
export async function lockAndRevealAwardAtomic(
  rfqId: string,
  quoteId: string,
  justificationText: string,
  autoReveal = true,
): Promise<
  { ok: true; result: AtomicAwardResult } | { ok: false; error: string }
> {
  const { data, error } = await supabase.rpc('lock_and_reveal_award_atomic', {
    p_rfq_id: rfqId,
    p_quote_id: quoteId,
    p_justification: justificationText,
    p_auto_reveal: autoReveal,
  });

  if (error) return { ok: false, error: error.message };

  const res = (data ?? {}) as Record<string, unknown>;
  if (!res.award_id) return { ok: false, error: 'Atomic award transaction failed' };

  return {
    ok: true,
    result: {
      awardId: String(res.award_id),
      rfqId: String(res.rfq_id),
      quoteId: String(res.quote_id),
      status: String(res.status),
      revealed: Boolean(res.revealed),
      poId: res.po_id ? String(res.po_id) : null,
      poNumber: res.po_number ? String(res.po_number) : null,
      supplierId: res.supplier_id ? String(res.supplier_id) : null,
      businessName: res.business_name ? String(res.business_name) : null,
    },
  };
}

export interface FrozenVote {
  quoteId: string | null;
  choice: string;
  votingPower: number;
  buyerType: string | null;
}

/**
 * The tally as it stood the moment the award was locked.
 *
 * Read from the award rather than recomputed, so what justified the decision
 * cannot drift after the fact.
 */
export async function fetchVoteSnapshot(rfqId: string): Promise<
  { ok: true; lockedAt: string | null; votes: FrozenVote[] } | { ok: false; error: string }
> {
  const { data, error } = await supabase
    .from('awards')
    .select('vote_snapshot')
    .eq('rfq_id', rfqId)
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: true, lockedAt: null, votes: [] };

  const snapshot = (data.vote_snapshot ?? {}) as {
    locked_at?: string;
    votes?: {
      quote_id?: string | null;
      choice?: string;
      voting_power?: number;
      buyer_type?: string | null;
    }[];
  };

  return {
    ok: true,
    lockedAt: snapshot.locked_at ?? null,
    votes: (snapshot.votes ?? []).map((vote) => ({
      quoteId: vote.quote_id ?? null,
      choice: vote.choice ?? 'RECOMMEND',
      votingPower: Number(vote.voting_power ?? 1),
      buyerType: vote.buyer_type ?? null,
    })),
  };
}

export interface UnmaskedSupplierResult {
  awardId: string;
  poId?: string;
  supplierId?: string;
  businessName?: string;
  legalName?: string;
  gstin?: string;
  contactPhone?: string;
  contactEmail?: string;
  aliasBeforeReveal?: string;
}

/**
 * Atomically commits the intent to award, records buyer attestation,
 * creates the Purchase Order draft, and unmasks the verified supplier identity.
 */
export async function confirmIntentToAwardAndUnmask(
  rfqId: string,
  quoteId: string,
  commitmentNote: string = 'Confirmed by buyer committee for on-platform execution',
): Promise<{ ok: true; data: UnmaskedSupplierResult } | { ok: false; error: string }> {
  const { data, error } = await supabase.rpc('confirm_intent_to_award_and_unmask', {
    p_rfq_id: rfqId,
    p_quote_id: quoteId,
    p_commitment_note: commitmentNote,
  });

  if (error) return { ok: false, error: error.message };

  const res = (data ?? {}) as {
    award_id?: string;
    po_id?: string;
    supplier_id?: string;
    business_name?: string;
    legal_name?: string;
    gstin?: string;
    contact_phone?: string;
    contact_email?: string;
    alias_before_reveal?: string;
  };

  return {
    ok: true,
    data: {
      awardId: res.award_id ?? '',
      poId: res.po_id,
      supplierId: res.supplier_id,
      businessName: res.business_name,
      legalName: res.legal_name,
      gstin: res.gstin,
      contactPhone: res.contact_phone,
      contactEmail: res.contact_email,
      aliasBeforeReveal: res.alias_before_reveal,
    },
  };
}

/**
 * Pre-reveal Unlock / Revise Selection (Zero Penalty on Buyer Reliability Score)
 */
export async function unlockAwardDecision(rfqId: string): Promise<
  { ok: true } | { ok: false; error: string }
> {
  const { error } = await supabase.rpc('unlock_award_decision', {
    p_rfq_id: rfqId,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export interface RunnerUpAwardResult {
  awardId: string;
  runnerUpQuoteId: string;
  runnerUpAlias: string;
  totalCost: number;
}

/**
 * 1-Click Auto-Award to Runner-Up Quote (No-Fault Protected)
 */
export async function awardRunnerUpQuote(
  rfqId: string,
  reason: string = 'Previous winning supplier was unresponsive or failed inspection',
): Promise<{ ok: true; data: RunnerUpAwardResult } | { ok: false; error: string }> {
  const { data, error } = await supabase.rpc('award_runner_up_quote', {
    p_rfq_id: rfqId,
    p_reason: reason,
  });

  if (error) return { ok: false, error: error.message };

  const res = (data ?? {}) as {
    award_id?: string;
    runner_up_quote_id?: string;
    runner_up_alias?: string;
    total_cost?: number;
  };

  return {
    ok: true,
    data: {
      awardId: res.award_id ?? '',
      runnerUpQuoteId: res.runner_up_quote_id ?? '',
      runnerUpAlias: res.runner_up_alias ?? 'Runner-Up Supplier',
      totalCost: Number(res.total_cost ?? 0),
    },
  };
}


