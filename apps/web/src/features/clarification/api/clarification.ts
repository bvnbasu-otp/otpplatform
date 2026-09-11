import { supabase } from '@/lib/supabase';
import { fetchCurrentProfile } from '@/features/auth/user-role';

export interface ClarificationMessage {
  id: string;
  invitationId: string;
  anonymousLabel?: string;
  authorDisplay: string;
  authorSide: 'BUYER' | 'SUPPLIER';
  body: string;
  createdAt: string;
}

interface MaskedClarificationRow {
  message_id: string;
  invitation_id: string;
  anonymous_label: string;
  author_side: 'BUYER' | 'SUPPLIER';
  author_display: string;
  body: string;
  created_at: string;
}

interface SupplierRow {
  message_id: string;
  invitation_id: string;
  author_side: 'BUYER' | 'SUPPLIER';
  author_display: string;
  body: string;
  created_at: string;
}

function mapMaskedClarification(row: MaskedClarificationRow): ClarificationMessage {
  return {
    id: row.message_id,
    invitationId: row.invitation_id,
    anonymousLabel: row.anonymous_label,
    authorDisplay: row.author_display,
    authorSide: row.author_side,
    body: row.body,
    createdAt: row.created_at,
  };
}

function mapSupplier(row: SupplierRow): ClarificationMessage {
  return {
    id: row.message_id,
    invitationId: row.invitation_id,
    authorDisplay: row.author_display,
    authorSide: row.author_side,
    body: row.body,
    createdAt: row.created_at,
  };
}

export async function fetchClarificationMessagesForBuyer(rfqId: string): Promise<
  { ok: true; messages: ClarificationMessage[] } | { ok: false; error: string }
> {
  const { data, error } = await supabase
    .from('rfq_clarifications_masked')
    .select(
      'message_id, invitation_id, anonymous_label, author_side, author_display, body, created_at',
    )
    .eq('rfq_id', rfqId)
    .order('created_at', { ascending: true });

  if (error) return { ok: false, error: error.message };
  return { ok: true, messages: (data as MaskedClarificationRow[]).map(mapMaskedClarification) };
}

export async function fetchClarificationMessagesForSupplier(
  rfqId: string,
  invitationId: string,
): Promise<{ ok: true; messages: ClarificationMessage[] } | { ok: false; error: string }> {
  const { data, error } = await supabase
    .from('rfq_clarification_supplier')
    .select('message_id, invitation_id, author_side, author_display, body, created_at')
    .eq('rfq_id', rfqId)
    .eq('invitation_id', invitationId)
    .order('created_at', { ascending: true });

  if (error) return { ok: false, error: error.message };
  return { ok: true, messages: (data as SupplierRow[]).map(mapSupplier) };
}

export async function postClarificationMessage(
  rfqId: string,
  invitationId: string,
  body: string,
  authorSide: 'BUYER' | 'SUPPLIER',
): Promise<{ ok: true } | { ok: false; error: string }> {
  const profile = await fetchCurrentProfile();
  if (!profile) return { ok: false, error: 'Not authenticated' };

  const trimmed = body.trim();
  if (!trimmed) return { ok: false, error: 'Message cannot be empty' };

  const { error } = await supabase.from('rfq_clarification_messages').insert({
    rfq_id: rfqId,
    invitation_id: invitationId,
    author_profile_id: profile.profileId,
    author_side: authorSide,
    body: trimmed,
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function closeInitialQuoting(rfqId: string): Promise<
  { ok: true } | { ok: false; error: string }
> {
  const { error } = await supabase.rpc('close_initial_quoting', { p_rfq_id: rfqId });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function closeClarificationForEvaluation(rfqId: string): Promise<
  { ok: true } | { ok: false; error: string }
> {
  const { error } = await supabase.rpc('close_clarification_for_evaluation', {
    p_rfq_id: rfqId,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function waiveMinQuotesAndEvaluate(rfqId: string): Promise<
  { ok: true } | { ok: false; error: string }
> {
  const { error } = await supabase.rpc('waive_min_quotes_and_evaluate', {
    p_rfq_id: rfqId,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function fetchRfqStatus(rfqId: string): Promise<
  { ok: true; status: string; minQuotesRequired: number } | { ok: false; error: string }
> {
  const { data, error } = await supabase
    .from('rfqs')
    .select('status, min_quotes_required')
    .eq('id', rfqId)
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: 'RFQ not found' };
  return {
    ok: true,
    status: data.status,
    minQuotesRequired: data.min_quotes_required,
  };
}

export async function fetchFinalQuoteCount(rfqId: string): Promise<number> {
  const { data } = await supabase
    .from('quotes_identity_protected')
    .select('status')
    .eq('rfq_id', rfqId)
    .eq('status', 'FINAL');

  return data?.length ?? 0;
}

export async function fetchInvitedLabels(rfqId: string): Promise<
  { ok: true; labels: { invitationId: string; anonymousLabel: string }[] } | { ok: false; error: string }
> {
  const { data, error } = await supabase
    .from('rfq_invitations_manager')
    .select('invitation_id, anonymous_label')
    .eq('rfq_id', rfqId);

  if (error) return { ok: false, error: error.message };
  return {
    ok: true,
    labels: (data ?? []).map((row) => ({
      invitationId: row.invitation_id as string,
      anonymousLabel: row.anonymous_label as string,
    })),
  };
}
