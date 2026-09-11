import type {
  FulfilmentMode,
  InviteStatus,
  RequiredByMode,
  RequirementMode,
  RfqStatus,
  SourcingMode,
} from '@otp/domain';
import { supabase } from '@/lib/supabase';
import type { SupplierInvitation, SupplierRfqDetail } from '../types/supplier-quote';

/**
 * Everything here reads rfqs_supplier_masked rather than rfqs and
 * rfq_invitations directly.
 *
 * The view is the only place that decides what crosses to the supplier side:
 * it carries the full specification, hides the buyer behind "Identity
 * protected" when they asked for that, and is already scoped to this supplier's
 * own invitations. Joining the base tables here would mean re-deciding all of
 * that in the client.
 */

export interface IdentityProtectedRfqRow {
  rfq_id: string;
  public_ref: string | null;
  title: string;
  description: string | null;
  status: RfqStatus;
  sourcing_mode: SourcingMode | null;
  quote_deadline: string | null;
  min_quotes_required: number | null;
  invitation_id: string;
  my_alias: string;
  my_invitation_status: InviteStatus;
  invited_at: string;
  category: string | null;
  subcategory: string | null;
  requirement_mode: RequirementMode | null;
  quantity: number | string | null;
  unit: string | null;
  attributes: Record<string, unknown> | null;
  quality: Record<string, unknown> | null;
  commercial: Record<string, unknown> | null;
  required_by_mode: RequiredByMode | null;
  required_by_days: number | null;
  required_by_date: string | null;
  fulfilment_mode: FulfilmentMode | null;
  delivery_city: string | null;
  evaluation_weights: Record<string, number> | null;
  buyer_display_name: string;
}

// Legacy alias
export type BlindRfqRow = IdentityProtectedRfqRow;

const LIST_COLUMNS =
  'rfq_id, public_ref, title, status, sourcing_mode, quote_deadline, min_quotes_required, ' +
  'invitation_id, my_alias, my_invitation_status, invited_at, buyer_display_name';

const DETAIL_COLUMNS =
  `${LIST_COLUMNS}, description, category, subcategory, requirement_mode, quantity, unit, ` +
  'attributes, quality, commercial, required_by_mode, required_by_days, required_by_date, ' +
  'fulfilment_mode, delivery_city, evaluation_weights';

export function toInvitation(row: IdentityProtectedRfqRow): SupplierInvitation {
  return {
    invitationId: row.invitation_id,
    rfqId: row.rfq_id,
    publicRef: row.public_ref,
    anonymousLabel: row.my_alias,
    status: row.my_invitation_status,
    invitedAt: row.invited_at,
    rfqTitle: row.title,
    rfqStatus: row.status,
    quoteDeadline: row.quote_deadline,
    buyerDisplayName: row.buyer_display_name,
    buyerAnonymous: row.buyer_display_name === 'Identity protected',
    sourcingMode: row.sourcing_mode,
    minQuotesRequired: row.min_quotes_required,
  };
}

export function toDetail(row: IdentityProtectedRfqRow): SupplierRfqDetail {
  return {
    ...toInvitation(row),
    description: row.description,
    category: row.category,
    subcategory: row.subcategory,
    requirementMode: row.requirement_mode,
    quantity: row.quantity === null ? null : Number(row.quantity),
    unit: row.unit,
    attributes: row.attributes ?? {},
    quality: row.quality ?? {},
    commercial: row.commercial ?? {},
    requiredByMode: row.required_by_mode,
    requiredByDays: row.required_by_days,
    requiredByDate: row.required_by_date,
    fulfilmentMode: row.fulfilment_mode,
    deliveryCity: row.delivery_city,
    evaluationWeights: row.evaluation_weights ?? {},
  };
}

export async function fetchSupplierInvitations(): Promise<
  { ok: true; invitations: SupplierInvitation[] } | { ok: false; error: string }
> {
  const { data, error } = await supabase
    .from('rfqs_supplier_masked')
    .select(LIST_COLUMNS)
    .order('invited_at', { ascending: false });

  if (error) return { ok: false, error: error.message };

  return {
    ok: true,
    invitations: ((data ?? []) as unknown as IdentityProtectedRfqRow[]).map(toInvitation),
  };
}

export async function fetchSupplierRfq(
  rfqId: string,
): Promise<
  { ok: true; rfq: SupplierRfqDetail | null } | { ok: false; error: string }
> {
  const { data, error } = await supabase
    .from('rfqs_supplier_masked')
    .select(DETAIL_COLUMNS)
    .eq('rfq_id', rfqId)
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: true, rfq: null };

  return { ok: true, rfq: toDetail(data as unknown as IdentityProtectedRfqRow) };
}

export async function markInvitationViewed(invitationId: string): Promise<void> {
  await supabase
    .from('rfq_invitations')
    .update({ status: 'VIEWED', viewed_at: new Date().toISOString() })
    .eq('id', invitationId)
    .eq('status', 'INVITED');
}
