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
  const now = new Date().toISOString();

  const { data: quote, error: quoteErr } = await supabase
    .from('quotes')
    .insert({
      rfq_id: rfqId,
      supplier_id: supplierId,
      invitation_id: invitationId,
      status: 'SUBMITTED',
      current_version: 1,
      submitted_at: now,
    })
    .select('id')
    .single();

  if (quoteErr) return { ok: false, error: quoteErr.message };

  const { error: versionErr } = await supabase.from('quote_versions').insert({
    quote_id: quote.id,
    version: 1,
    snapshot,
    notes: input.notes ?? null,
    created_by: profileId,
  });

  if (versionErr) return { ok: false, error: versionErr.message };

  await supabase
    .from('rfq_invitations')
    .update({ status: 'QUOTED' })
    .eq('id', invitationId);

  return { ok: true, quoteId: quote.id };
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
  if (rfq?.status !== 'CLARIFICATION') {
    return { ok: false, error: 'Final quote revisions are only allowed during negotiation' };
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

  const nextVersion = quote.current_version + 1;
  const snapshot = toSnapshotPayload(input);
  const now = new Date().toISOString();

  const { error: versionErr } = await supabase.from('quote_versions').insert({
    quote_id: quoteId,
    version: nextVersion,
    snapshot,
    notes: input.notes ?? null,
    created_by: profileId,
  });

  if (versionErr) return { ok: false, error: versionErr.message };

  const { error: updateErr } = await supabase
    .from('quotes')
    .update({
      status: 'REVISED',
      current_version: nextVersion,
      submitted_at: now,
      evaluation_score: null,
    })
    .eq('id', quoteId);

  if (updateErr) return { ok: false, error: updateErr.message };

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
