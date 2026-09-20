import { supabase } from '@/lib/supabase';
import { fetchCurrentProfile } from '@/features/auth/user-role';
import { scrubClarificationPii } from '../utils/pii-scrubber';

export type ClarificationCategory =
  | 'TECHNICAL_SPEC'
  | 'COMMERCIAL_TERMS'
  | 'DELIVERY_LOGISTICS'
  | 'COMPLIANCE';

export const CLARIFICATION_CATEGORIES: {
  key: ClarificationCategory;
  label: string;
  icon: string;
  description: string;
}[] = [
  {
    key: 'TECHNICAL_SPEC',
    label: 'Technical Spec',
    icon: '⚙️',
    description: 'Engineering specifications, dimensions, materials, tolerances, scope of work',
  },
  {
    key: 'COMMERCIAL_TERMS',
    label: 'Commercial Terms',
    icon: '💰',
    description: 'Payment terms, milestone breakdown, statutory taxes, price validity',
  },
  {
    key: 'DELIVERY_LOGISTICS',
    label: 'Delivery & Logistics',
    icon: '🚚',
    description: 'Lead times, shipment mode, site access, unloading, transit insurance',
  },
  {
    key: 'COMPLIANCE',
    label: 'Compliance & Regulatory',
    icon: '📋',
    description: 'Certifications, statutory approvals, warranties, inspection protocols',
  },
];

export interface ClarificationMessage {
  id: string;
  rfqId?: string;
  invitationId: string | null;
  anonymousLabel?: string;
  authorDisplay: string;
  authorSide: 'BUYER' | 'SUPPLIER';
  body: string;
  createdAt: string;
  redactions?: string[];
  inquiryCategory: ClarificationCategory;
  lineItemRef: string | null;
  isBroadcast: boolean;
}

interface MaskedClarificationRow {
  message_id: string;
  rfq_id?: string;
  invitation_id: string | null;
  anonymous_label?: string;
  author_side: 'BUYER' | 'SUPPLIER';
  author_display: string;
  body: string;
  created_at: string;
  redactions?: string[];
  inquiry_category?: string;
  line_item_ref?: string | null;
  is_broadcast?: boolean;
}

interface SupplierRow {
  message_id: string;
  rfq_id?: string;
  invitation_id: string | null;
  author_side: 'BUYER' | 'SUPPLIER';
  author_display: string;
  body: string;
  created_at: string;
  redactions?: string[];
  inquiry_category?: string;
  line_item_ref?: string | null;
  is_broadcast?: boolean;
}

function normalizeCategory(raw?: string): ClarificationCategory {
  if (
    raw === 'COMMERCIAL_TERMS' ||
    raw === 'DELIVERY_LOGISTICS' ||
    raw === 'COMPLIANCE'
  ) {
    return raw;
  }
  return 'TECHNICAL_SPEC';
}

function mapMaskedClarification(row: MaskedClarificationRow): ClarificationMessage {
  return {
    id: row.message_id,
    rfqId: row.rfq_id,
    invitationId: row.invitation_id,
    anonymousLabel: row.anonymous_label,
    authorDisplay: row.author_display,
    authorSide: row.author_side,
    body: row.body,
    createdAt: row.created_at,
    redactions: row.redactions || [],
    inquiryCategory: normalizeCategory(row.inquiry_category),
    lineItemRef: row.line_item_ref || null,
    isBroadcast: Boolean(row.is_broadcast),
  };
}

function mapSupplier(row: SupplierRow): ClarificationMessage {
  return {
    id: row.message_id,
    rfqId: row.rfq_id,
    invitationId: row.invitation_id,
    authorDisplay: row.author_display,
    authorSide: row.author_side,
    body: row.body,
    createdAt: row.created_at,
    redactions: row.redactions || [],
    inquiryCategory: normalizeCategory(row.inquiry_category),
    lineItemRef: row.line_item_ref || null,
    isBroadcast: Boolean(row.is_broadcast),
  };
}

export async function fetchClarificationMessagesForBuyer(rfqId: string): Promise<
  { ok: true; messages: ClarificationMessage[] } | { ok: false; error: string }
> {
  const { data, error } = await supabase
    .from('rfq_clarifications_masked')
    .select(
      'message_id, rfq_id, invitation_id, anonymous_label, author_side, author_display, body, created_at, redactions, inquiry_category, line_item_ref, is_broadcast',
    )
    .eq('rfq_id', rfqId)
    .order('created_at', { ascending: true });

  if (error) return { ok: false, error: error.message };
  return { ok: true, messages: (data as MaskedClarificationRow[]).map(mapMaskedClarification) };
}

export async function fetchClarificationMessagesForSupplier(
  rfqId: string,
  invitationId?: string,
): Promise<{ ok: true; messages: ClarificationMessage[] } | { ok: false; error: string }> {
  let query = supabase
    .from('rfq_clarification_supplier')
    .select(
      'message_id, rfq_id, invitation_id, author_side, author_display, body, created_at, redactions, inquiry_category, line_item_ref, is_broadcast',
    )
    .eq('rfq_id', rfqId);

  if (invitationId) {
    // Return both broadcast addenda and messages specific to this invitation
    query = query.or(`is_broadcast.eq.true,invitation_id.eq.${invitationId}`);
  }

  const { data, error } = await query.order('created_at', { ascending: true });

  if (error) return { ok: false, error: error.message };
  return { ok: true, messages: (data as SupplierRow[]).map(mapSupplier) };
}

export async function postClarificationMessage(
  rfqId: string,
  invitationId: string,
  body: string,
  authorSide: 'BUYER' | 'SUPPLIER',
  options?: {
    inquiryCategory?: ClarificationCategory;
    lineItemRef?: string | null;
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const profile = await fetchCurrentProfile();
  if (!profile) return { ok: false, error: 'Not authenticated' };

  const trimmed = body.trim();
  if (!trimmed) return { ok: false, error: 'Message cannot be empty' };

  const piiCheck = scrubClarificationPii(trimmed);
  if (piiCheck.onlyPii) {
    return {
      ok: false,
      error: 'Cannot submit message containing only contact details. Questions must refer to requirement specifications.',
    };
  }

  const { error } = await supabase.from('rfq_clarification_messages').insert({
    rfq_id: rfqId,
    invitation_id: invitationId,
    author_profile_id: profile.profileId,
    author_side: authorSide,
    body: trimmed,
    inquiry_category: options?.inquiryCategory || 'TECHNICAL_SPEC',
    line_item_ref: options?.lineItemRef ? options.lineItemRef.trim() : null,
    is_broadcast: false,
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function postBroadcastClarification(
  rfqId: string,
  body: string,
  options?: {
    inquiryCategory?: ClarificationCategory;
    lineItemRef?: string | null;
  },
): Promise<{ ok: true; messageId?: string } | { ok: false; error: string }> {
  const profile = await fetchCurrentProfile();
  if (!profile) return { ok: false, error: 'Not authenticated' };

  const trimmed = body.trim();
  if (!trimmed) return { ok: false, error: 'Broadcast addendum cannot be empty' };

  const piiCheck = scrubClarificationPii(trimmed);
  if (piiCheck.onlyPii) {
    return {
      ok: false,
      error: 'Cannot publish broadcast addendum containing only contact details.',
    };
  }

  // Attempt atomic RPC first
  const { data: rpcData, error: rpcError } = await supabase.rpc(
    'post_broadcast_clarification_atomic',
    {
      p_rfq_id: rfqId,
      p_body: trimmed,
      p_inquiry_category: options?.inquiryCategory || 'TECHNICAL_SPEC',
      p_line_item_ref: options?.lineItemRef ? options.lineItemRef.trim() : null,
    },
  );

  if (!rpcError && rpcData) {
    const parsed = typeof rpcData === 'string' ? JSON.parse(rpcData) : rpcData;
    if (parsed.ok) {
      return { ok: true, messageId: parsed.message_id };
    }
    return { ok: false, error: parsed.error || 'Failed to post broadcast addendum' };
  }

  // Fallback to direct insert
  const { data: insertData, error: insertError } = await supabase
    .from('rfq_clarification_messages')
    .insert({
      rfq_id: rfqId,
      invitation_id: null,
      author_profile_id: profile.profileId,
      author_side: 'BUYER',
      body: trimmed,
      inquiry_category: options?.inquiryCategory || 'TECHNICAL_SPEC',
      line_item_ref: options?.lineItemRef ? options.lineItemRef.trim() : null,
      is_broadcast: true,
    })
    .select('id')
    .maybeSingle();

  if (insertError) return { ok: false, error: insertError.message };
  return { ok: true, messageId: insertData?.id };
}

export function subscribeClarificationMessages(
  rfqId: string,
  onUpdate: () => void,
): () => void {
  if (!rfqId) return () => {};

  const channelName = `clarification-realtime-${rfqId}-${Math.random().toString(36).slice(2, 7)}`;
  const channel = supabase
    .channel(channelName)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'rfq_clarification_messages',
        filter: `rfq_id=eq.${rfqId}`,
      },
      () => {
        onUpdate();
      },
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}

export interface RequirementSpecReference {
  id: string;
  label: string;
  category?: string;
  detail?: string;
}

export async function fetchRequirementSpecsAndItems(
  rfqId: string,
): Promise<{ ok: true; items: RequirementSpecReference[] } | { ok: false; error: string }> {
  try {
    const { data: rfqData, error: rfqErr } = await supabase
      .from('rfqs')
      .select('requirement_id, title')
      .eq('id', rfqId)
      .maybeSingle();

    if (rfqErr || !rfqData) {
      return {
        ok: true,
        items: [{ id: 'general', label: 'General / Overall Scope' }],
      };
    }

    const { data: reqData } = await supabase
      .from('requirements')
      .select('title, description, structured_specs')
      .eq('id', rfqData.requirement_id)
      .maybeSingle();

    const items: RequirementSpecReference[] = [
      { id: 'general', label: `General: ${rfqData.title || reqData?.title || 'Scope'}` },
    ];

    if (reqData?.structured_specs && typeof reqData.structured_specs === 'object') {
      const specs = reqData.structured_specs as Record<string, any>;
      // If structured specs contains line items
      if (Array.isArray(specs.line_items) || Array.isArray(specs.items)) {
        const list = Array.isArray(specs.line_items) ? specs.line_items : specs.items;
        list.forEach((item: any, idx: number) => {
          items.push({
            id: `item-${idx + 1}`,
            label: item.title || item.name || `Line Item #${idx + 1}`,
            detail: item.quantity ? `Qty: ${item.quantity} ${item.unit || ''}` : undefined,
          });
        });
      }
      // If structured specs has attributes
      if (specs.attributes && typeof specs.attributes === 'object') {
        Object.entries(specs.attributes).forEach(([k, v]) => {
          items.push({
            id: `attr-${k}`,
            label: `Spec: ${k}`,
            detail: String(v),
          });
        });
      }
    }

    // Default handy categories if none present
    if (items.length === 1) {
      items.push(
        { id: 'spec-tech', label: 'Technical Specifications & Bill of Materials' },
        { id: 'spec-delivery', label: 'Delivery Schedule & Milestone Timelines' },
        { id: 'spec-commercial', label: 'Commercial Terms, Taxes & Payment Schedule' },
        { id: 'spec-warranty', label: 'Warranty, Inspection & Quality Protocols' },
      );
    }

    return { ok: true, items };
  } catch (err: any) {
    return {
      ok: true,
      items: [{ id: 'general', label: 'General / Overall Scope' }],
    };
  }
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
