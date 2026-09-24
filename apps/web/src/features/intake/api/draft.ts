import type { AttributeValue } from '@otp/domain';
import { supabase } from '@/lib/supabase';
import { fetchCurrentProfile } from '@/features/auth/user-role';
import { fetchUserOrganization } from '@/features/requirement/api/requirements';
import {
  DEFAULT_SOURCING,
  type CommercialDetails,
  type IntakeDraft,
  type QualityDetails,
  type SourcingChoices,
} from '../types/intake-draft';

/**
 * Reading and writing the DRAFT requirement behind the wizard.
 *
 * Every step saves through here, so leaving the wizard loses nothing and
 * nothing about the flow lives in component state that the buyer cannot get
 * back.
 */

type Result<T> = ({ ok: true } & T) | { ok: false; error: string };

interface RequirementRow {
  id: string;
  organization_id: string;
  title: string;
  description: string | null;
  status: string;
  category_id: string | null;
  subcategory_id: string | null;
  requirement_mode: string | null;
  quantity: string | number | null;
  unit: string | null;
  attributes: Record<string, AttributeValue> | null;
  quality: Record<string, unknown> | null;
  commercial: Record<string, unknown> | null;
  required_by_mode: string | null;
  required_by_days: number | null;
  required_by_date: string | null;
  fulfilment_mode: string | null;
  delivery_city: string | null;
  delivery_pincode: string | null;
  delivery_line1: string | null;
  site_notes: string | null;
}

const DRAFT_COLUMNS =
  'id, organization_id, title, description, status, category_id, subcategory_id, requirement_mode, quantity, unit, attributes, quality, commercial, required_by_mode, required_by_days, required_by_date, fulfilment_mode, delivery_city, delivery_pincode, delivery_line1, site_notes';

/**
 * Sourcing choices ride inside `commercial` under one reserved key. They are
 * commercial terms of the enquiry, and this keeps them with the draft without
 * inventing columns for values that end up on the RFQ.
 */
const SOURCING_KEY = '__sourcing';

function readSourcing(commercial: Record<string, unknown> | null): SourcingChoices {
  const stored = commercial?.[SOURCING_KEY];
  if (!stored || typeof stored !== 'object') return { ...DEFAULT_SOURCING };
  return { ...DEFAULT_SOURCING, ...(stored as Partial<SourcingChoices>) };
}

function readCommercial(
  commercial: Record<string, unknown> | null,
): CommercialDetails {
  if (!commercial) return {};
  const { [SOURCING_KEY]: _sourcing, ...rest } = commercial;
  return rest as CommercialDetails;
}

function toDraft(row: RequirementRow): IntakeDraft {
  return {
    requirementId: row.id,
    organizationId: row.organization_id,
    originalText: row.description ?? '',
    title: row.title,
    categoryId: row.category_id,
    subcategoryId: row.subcategory_id,
    requirementMode: row.requirement_mode as IntakeDraft['requirementMode'],
    quantity: row.quantity === null ? null : Number(row.quantity),
    unit: row.unit,
    attributes: row.attributes ?? {},
    quality: (row.quality ?? {}) as QualityDetails,
    commercial: readCommercial(row.commercial),
    sourcing: readSourcing(row.commercial),
    requiredByMode: row.required_by_mode as IntakeDraft['requiredByMode'],
    requiredByDays: row.required_by_days,
    requiredByDate: row.required_by_date,
    fulfilmentMode: row.fulfilment_mode as IntakeDraft['fulfilmentMode'],
    deliveryCity: row.delivery_city,
    deliveryPincode: row.delivery_pincode,
    deliveryLine1: row.delivery_line1,
    siteNotes: row.site_notes,
    status: row.status,
  };
}

export type DraftResult = Result<{ draft: IntakeDraft }>;

export interface CreateDraftInput {
  title: string;
  originalText: string;
  /**
   * What the parser understood. Written with the insert rather than as a
   * follow-up update, so the understanding step is reading saved values from
   * the first moment it renders.
   */
  parsed?: DraftPatch;
}

export async function createDraft(input: CreateDraftInput): Promise<DraftResult> {
  const profile = await fetchCurrentProfile();
  if (!profile) return { ok: false, error: 'Not authenticated' };

  const org = await fetchUserOrganization();
  const orgId = org.ok ? org.org.organizationId : null;

  const { data, error } = await supabase
    .from('requirements')
    .insert({
      organization_id: orgId,
      created_by: profile.profileId,
      // requirement_type is derived from requirement_mode by trigger; the
      // insert needs a value for the NOT NULL column and the understanding
      // step replaces it as soon as a mode is chosen.
      requirement_type: 'SERVICE',
      status: 'DRAFT',
      title: input.title,
      description: input.originalText,
      ...columnsFor(input.parsed ?? {}, {}, DEFAULT_SOURCING),
    })
    .select(DRAFT_COLUMNS)
    .single();

  if (error) return { ok: false, error: error.message };
  return { ok: true, draft: toDraft(data as RequirementRow) };
}

export async function fetchDraft(requirementId: string): Promise<DraftResult> {
  const { data, error } = await supabase
    .from('requirements')
    .select(DRAFT_COLUMNS)
    .eq('id', requirementId)
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: 'Requirement not found' };

  return { ok: true, draft: toDraft(data as RequirementRow) };
}

export type DraftPatch = Partial<
  Omit<IntakeDraft, 'requirementId' | 'organizationId' | 'status'>
>;

/**
 * Turns the fields a step owns into columns. Only keys the step actually set
 * are included, so an early step cannot wipe an answer given on a later one.
 */
function columnsFor(
  patch: DraftPatch,
  currentCommercial: CommercialDetails,
  currentSourcing: SourcingChoices,
): Record<string, unknown> {
  const columns: Record<string, unknown> = {};

  if (patch.title !== undefined) columns.title = patch.title;
  if (patch.originalText !== undefined) columns.description = patch.originalText;
  if (patch.categoryId !== undefined) columns.category_id = patch.categoryId;
  if (patch.subcategoryId !== undefined) columns.subcategory_id = patch.subcategoryId;
  if (patch.requirementMode !== undefined) {
    columns.requirement_mode = patch.requirementMode;
  }
  if (patch.quantity !== undefined) columns.quantity = patch.quantity;
  if (patch.unit !== undefined) columns.unit = patch.unit;
  if (patch.attributes !== undefined) columns.attributes = patch.attributes;
  if (patch.quality !== undefined) columns.quality = patch.quality;
  if (patch.commercial !== undefined || patch.sourcing !== undefined) {
    columns.commercial = {
      ...(patch.commercial ?? currentCommercial),
      [SOURCING_KEY]: patch.sourcing ?? currentSourcing,
    };
  }
  if (patch.requiredByMode !== undefined) {
    columns.required_by_mode = patch.requiredByMode;
  }
  if (patch.requiredByDays !== undefined) {
    columns.required_by_days = patch.requiredByDays;
  }
  if (patch.requiredByDate !== undefined) {
    columns.required_by_date = patch.requiredByDate;
  }
  if (patch.fulfilmentMode !== undefined) {
    columns.fulfilment_mode = patch.fulfilmentMode;
  }
  if (patch.deliveryCity !== undefined) columns.delivery_city = patch.deliveryCity;
  if (patch.deliveryPincode !== undefined) {
    columns.delivery_pincode = patch.deliveryPincode;
  }
  if (patch.deliveryLine1 !== undefined) columns.delivery_line1 = patch.deliveryLine1;
  if (patch.siteNotes !== undefined) columns.site_notes = patch.siteNotes;

  return columns;
}

export async function updateDraft(
  draft: IntakeDraft,
  patch: DraftPatch,
): Promise<DraftResult> {
  if (draft.requirementId.startsWith('local-')) {
    // Attempt to sync and promote local draft to server once online
    const createRes = await createDraft({
      title: patch.title ?? draft.title,
      originalText: draft.originalText,
      parsed: { ...draft, ...patch },
    });
    if (createRes.ok) {
      return createRes;
    }
    return { ok: false, error: createRes.error };
  }

  const { data, error } = await supabase
    .from('requirements')
    .update({
      ...columnsFor(patch, draft.commercial, draft.sourcing),
      updated_at: new Date().toISOString(),
    })
    .eq('id', draft.requirementId)
    .select(DRAFT_COLUMNS)
    .single();

  if (error) return { ok: false, error: error.message };
  return { ok: true, draft: toDraft(data as RequirementRow) };
}

export type PublishResult = Result<{
  requirementId: string;
  rfqId: string;
  publicRef: string;
}>;

/**
 * Turns the draft into a live enquiry.
 *
 * Submitting the requirement, creating its RFQ and recording the buyer's
 * weights is one server-side act. Done from here as three calls it could fail
 * halfway and leave a published requirement with nothing to quote against.
 */
export async function publishDraft(draft: IntakeDraft): Promise<PublishResult> {
  let requirementId = draft.requirementId;

  if (requirementId.startsWith('local-')) {
    // If draft was previously saved locally/offline, promote to server first
    const createRes = await createDraft({
      title: draft.title,
      originalText: draft.originalText,
      parsed: draft,
    });
    if (!createRes.ok) {
      return { ok: false, error: `Could not sync draft to server: ${createRes.error}` };
    }
    requirementId = createRes.draft.requirementId;
  }

  const { data, error } = await supabase.rpc('publish_requirement', {
    p_requirement_id: requirementId,
    p_sourcing_mode: draft.sourcing.sourcingMode,
    p_min_quotes_required: draft.sourcing.minQuotesRequired,
    p_quote_deadline_days: draft.sourcing.quoteDeadlineDays,
    p_weights: draft.sourcing.evaluationWeights,
    p_weights_source: draft.sourcing.evaluationWeightsSource,
  });

  if (error) return { ok: false, error: error.message };

  const result = data as { rfqId: string; publicRef: string };
  return {
    ok: true,
    requirementId,
    rfqId: result.rfqId,
    publicRef: result.publicRef,
  };
}

/** The most recent unfinished draft, so "continue where you left off" works. */
export async function fetchLatestDraft(): Promise<
  { ok: true; draft: IntakeDraft | null } | { ok: false; error: string }
> {
  const profile = await fetchCurrentProfile();
  if (!profile) return { ok: false, error: 'Not authenticated' };

  const { data, error } = await supabase
    .from('requirements')
    .select(DRAFT_COLUMNS)
    .eq('created_by', profile.profileId)
    .eq('status', 'DRAFT')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  return { ok: true, draft: data ? toDraft(data as RequirementRow) : null };
}
