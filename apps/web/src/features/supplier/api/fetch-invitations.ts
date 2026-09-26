import {
  assertSupplierFacingPayloadSafe,
  stripSupplierFacingBuyerIdentity,
  type FulfilmentMode,
  type InviteStatus,
  type RequiredByMode,
  type RequirementMode,
  type RfqStatus,
  type SourcingMode,
} from '@otp/domain';
import { supabase } from '@/lib/supabase';
import {
  PROTECTED_BUYER_LABEL,
  scrubBuyerFreeText,
  scrubBuyerFreeTextDeep,
} from '../lib/identity-shield';
import type { SupplierInvitation, SupplierRfqDetail } from '../types/supplier-quote';

/**
 * Everything here reads rfqs_supplier_masked rather than rfqs and
 * rfq_invitations directly.
 *
 * The view carries the full specification and is already scoped to this
 * supplier's own invitations. It is not trusted on the buyer, though: for
 * OPEN_RFQ enquiries its buyer_display_name is the organization's real name,
 * so that column is never requested and the buyer is always shown as
 * protected. The buyer reaches a supplier through rfq_buyer_revealed after
 * award, not through these views.
 *
 * Stripping here keeps the UI clean; it is not the security boundary. The
 * view and RLS are.
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
  /** Not selected. Ignored if present: it names the buyer on OPEN_RFQ enquiries. */
  buyer_display_name?: string;
}

// Legacy alias
export type BlindRfqRow = IdentityProtectedRfqRow;

export const SUPPLIER_RFQ_LIST_COLUMNS =
  'rfq_id, public_ref, title, status, sourcing_mode, quote_deadline, min_quotes_required, ' +
  'invitation_id, my_alias, my_invitation_status, invited_at, ' +
  'category, subcategory, delivery_city, quantity, unit';

export const SUPPLIER_RFQ_DETAIL_COLUMNS =
  `${SUPPLIER_RFQ_LIST_COLUMNS}, description, requirement_mode, ` +
  'attributes, quality, commercial, required_by_mode, required_by_days, required_by_date, ' +
  'fulfilment_mode, evaluation_weights';

function sanitizeBlock(block: Record<string, unknown> | null | undefined): Record<string, unknown> {
  return scrubBuyerFreeTextDeep(stripSupplierFacingBuyerIdentity(block ?? {}));
}

export function toInvitation(row: IdentityProtectedRfqRow): SupplierInvitation {
  const invitation: SupplierInvitation = {
    invitationId: row.invitation_id,
    rfqId: row.rfq_id,
    publicRef: row.public_ref,
    anonymousLabel: row.my_alias,
    status: row.my_invitation_status,
    invitedAt: row.invited_at,
    rfqTitle: scrubBuyerFreeText(row.title),
    rfqStatus: row.status,
    quoteDeadline: row.quote_deadline,
    buyerDisplayName: PROTECTED_BUYER_LABEL,
    buyerAnonymous: true,
    sourcingMode: row.sourcing_mode,
    minQuotesRequired: row.min_quotes_required,
    category: row.category ?? null,
    subcategory: row.subcategory ?? null,
    deliveryCity: row.delivery_city ?? null,
    quantity: row.quantity === null || row.quantity === undefined ? null : Number(row.quantity),
    unit: row.unit ?? null,
  };
  assertSupplierFacingPayloadSafe(invitation as unknown as Record<string, unknown>);
  return invitation;
}

export function toDetail(row: IdentityProtectedRfqRow): SupplierRfqDetail {
  const detail: SupplierRfqDetail = {
    ...toInvitation(row),
    description: scrubBuyerFreeText(row.description),
    category: row.category,
    subcategory: row.subcategory,
    requirementMode: row.requirement_mode,
    quantity: row.quantity === null ? null : Number(row.quantity),
    unit: row.unit,
    attributes: sanitizeBlock(row.attributes),
    quality: sanitizeBlock(row.quality),
    commercial: sanitizeBlock(row.commercial),
    requiredByMode: row.required_by_mode,
    requiredByDays: row.required_by_days,
    requiredByDate: row.required_by_date,
    fulfilmentMode: row.fulfilment_mode,
    deliveryCity: row.delivery_city,
    evaluationWeights: row.evaluation_weights ?? {},
  };
  assertSupplierFacingPayloadSafe(detail as unknown as Record<string, unknown>);
  return detail;
}

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : 'Failed to map supplier RFQ';
}

export async function fetchSupplierInvitations(): Promise<
  { ok: true; invitations: SupplierInvitation[] } | { ok: false; error: string }
> {
  const { data, error } = await supabase
    .from('rfqs_supplier_masked')
    .select(SUPPLIER_RFQ_LIST_COLUMNS)
    .order('invited_at', { ascending: false });

  if (error) return { ok: false, error: error.message };

  try {
    return {
      ok: true,
      invitations: ((data ?? []) as unknown as IdentityProtectedRfqRow[]).map(toInvitation),
    };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

export async function fetchSupplierRfq(
  rfqId: string,
): Promise<
  { ok: true; rfq: SupplierRfqDetail | null } | { ok: false; error: string }
> {
  const { data, error } = await supabase
    .from('rfqs_supplier_masked')
    .select(SUPPLIER_RFQ_DETAIL_COLUMNS)
    .eq('rfq_id', rfqId)
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: true, rfq: null };

  try {
    return { ok: true, rfq: toDetail(data as unknown as IdentityProtectedRfqRow) };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

export async function markInvitationViewed(invitationId: string): Promise<void> {
  await supabase
    .from('rfq_invitations')
    .update({ status: 'VIEWED', viewed_at: new Date().toISOString() })
    .eq('id', invitationId)
    .eq('status', 'INVITED');
}
