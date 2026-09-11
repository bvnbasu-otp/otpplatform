import type { QuoteStatus } from '@otp/domain';
import { supabase } from '@/lib/supabase';
import type { SupplierQuote, SupplierQuoteSnapshot } from '../types/supplier-quote';

interface QuoteRow {
  id: string;
  rfq_id: string;
  invitation_id: string;
  status: QuoteStatus;
  current_version: number;
  submitted_at: string | null;
}

interface VersionRow {
  version: number;
  snapshot: SupplierQuoteSnapshot;
}

export async function fetchSupplierQuoteForRfq(rfqId: string): Promise<{
  ok: true;
  quote: SupplierQuote | null;
} | { ok: false; error: string }> {
  const { data: quotes, error } = await supabase
    .from('quotes')
    .select('id, rfq_id, invitation_id, status, current_version, submitted_at')
    .eq('rfq_id', rfqId)
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!quotes) return { ok: true, quote: null };

  const row = quotes as QuoteRow;
  const { data: versions, error: vErr } = await supabase
    .from('quote_versions')
    .select('version, snapshot')
    .eq('quote_id', row.id)
    .eq('version', row.current_version)
    .maybeSingle();

  if (vErr) return { ok: false, error: vErr.message };

  const versionRow = versions as VersionRow | null;

  return {
    ok: true,
    quote: {
      quoteId: row.id,
      rfqId: row.rfq_id,
      invitationId: row.invitation_id,
      status: row.status,
      currentVersion: row.current_version,
      submittedAt: row.submitted_at,
      snapshot: versionRow?.snapshot ?? null,
    },
  };
}
