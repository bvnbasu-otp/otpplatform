import { supabase } from '@/lib/supabase';
import {
  type QuoteSnapshotInput,
  toSnapshotPayload,
} from '../types/supplier-quote';

export async function submitSupplierQuote(
  profileId: string,
  rfqId: string,
  invitationId: string,
  supplierId: string,
  input: QuoteSnapshotInput,
): Promise<{ ok: true; quoteId: string } | { ok: false; error: string }> {
  const { data: rfq, error: rfqErr } = await supabase
    .from('rfqs')
    .select('status')
    .eq('id', rfqId)
    .maybeSingle();

  if (rfqErr) return { ok: false, error: rfqErr.message };
  if (rfq?.status !== 'OPEN') {
    return { ok: false, error: 'Initial quotes can only be submitted while RFQ is OPEN' };
  }

  const snapshot = toSnapshotPayload(input);
  const { data, error } = await supabase.rpc('submit_supplier_quote_atomic', {
    p_rfq_id: rfqId,
    p_invitation_id: invitationId,
    p_supplier_id: supplierId,
    p_snapshot: snapshot,
    p_notes: input.notes ?? null,
  });

  if (error) return { ok: false, error: error.message };
  const result = data as { ok?: boolean; quoteId?: string } | null;
  if (!result?.ok || !result.quoteId) {
    return { ok: false, error: 'Quote submission did not complete atomically' };
  }

  // The profile id is deliberately not sent: the RPC derives it from auth.uid().
  void profileId;
  return { ok: true, quoteId: result.quoteId };
}

export async function reviseSupplierQuote(
  profileId: string,
  quoteId: string,
  rfqId: string,
  input: QuoteSnapshotInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: rfq, error: rfqErr } = await supabase
    .from('rfqs')
    .select('status')
    .eq('id', rfqId)
    .maybeSingle();

  if (rfqErr) return { ok: false, error: rfqErr.message };
  if (rfq?.status !== 'CLARIFICATION' && rfq?.status !== 'OPEN') {
    return { ok: false, error: 'Quote revisions are only allowed while RFQ is open or during negotiation' };
  }

  const { data: quote, error: quoteErr } = await supabase
    .from('quotes')
    .select('current_version, status')
    .eq('id', quoteId)
    .maybeSingle();

  if (quoteErr || !quote) return { ok: false, error: quoteErr?.message ?? 'Quote not found' };
  if (!['SUBMITTED', 'REVISED'].includes(quote.status)) {
    return { ok: false, error: 'Quote cannot be revised in current status' };
  }

  const snapshot = toSnapshotPayload(input);
  const { data, error } = await supabase.rpc('revise_supplier_quote_atomic', {
    p_quote_id: quoteId,
    p_snapshot: snapshot,
    p_notes: input.notes ?? null,
  });

  if (error) return { ok: false, error: error.message };
  const result = data as { ok?: boolean } | null;
  if (!result?.ok) return { ok: false, error: 'Quote revision did not complete atomically' };
  void profileId;
  return { ok: true };
}

export async function finalizeSupplierQuote(
  quoteId: string,
  rfqId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: rfq, error: rfqErr } = await supabase
    .from('rfqs')
    .select('status')
    .eq('id', rfqId)
    .maybeSingle();

  if (rfqErr) return { ok: false, error: rfqErr.message };
  if (rfq?.status !== 'CLARIFICATION') {
    return { ok: false, error: 'Final quotes can only be submitted during negotiation' };
  }

  const { error } = await supabase
    .from('quotes')
    .update({ status: 'FINAL' })
    .eq('id', quoteId);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function fetchSupplierIdForProfile(
  profileId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from('supplier_users')
    .select('supplier_id')
    .eq('profile_id', profileId)
    .limit(1)
    .maybeSingle();

  return data?.supplier_id ?? null;
}
