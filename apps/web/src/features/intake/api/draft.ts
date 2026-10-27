import { isDemoMode } from '@/features/demo/demo-config';
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
  delivery_state?: string | null;
  delivery_pincode: string | null;
  delivery_line1: string | null;
  site_notes: string | null;
}

const DRAFT_COLUMNS =
  'id, organization_id, title, description, status, category_id, subcategory_id, requirement_mode, quantity, unit, attributes, quality, commercial, required_by_mode, required_by_days, required_by_date, fulfilment_mode, delivery_city, delivery_state, delivery_pincode, delivery_line1, site_notes';

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

export function extractPinFromText(text?: string | null): string | null {
  if (!text) return null;
  const match = text.match(/\b([1-9][0-9]{5})\b/);
  return match && match[1] ? match[1] : null;
}


export function inferIndianCity(
  pincode?: string | null,
  state?: string | null,
): string | null {
  if (pincode && /^[0-9]{6}$/.test(pincode.trim())) {
    const pin = pincode.trim();
    const p3 = pin.slice(0, 3);
    const p2 = pin.slice(0, 2);

    // Karnataka
    if (['560', '561', '562'].includes(p3)) return 'Bengaluru';
    if (p3 === '570') return 'Mysuru';
    if (p3 === '575') return 'Mangaluru';
    if (p3 === '580') return 'Hubballi';
    if (p3 === '590') return 'Belagavi';
    if (p3 === '583') return 'Ballari';
    if (p3 === '577') return 'Davanagere';
    if (p3 === '572') return 'Tumakuru';
    if (p3 === '573') return 'Hassan';

    // Tamil Nadu
    if (p3 === '600') return 'Chennai';
    if (p3 === '641') return 'Coimbatore';
    if (p3 === '625') return 'Madurai';
    if (p3 === '620') return 'Tiruchirappalli';
    if (p3 === '636') return 'Salem';
    if (p3 === '638') {
      if (pin === '638301') return 'Bhavani, Erode';
      return 'Erode';
    }
    if (p3 === '632') return 'Vellore';
    if (p3 === '627') return 'Tirunelveli';
    if (p3 === '635') return 'Hosur';
    if (p3 === '639') return 'Karur';
    if (p3 === '637') return 'Namakkal';
    if (p3 === '642') return 'Pollachi';
    if (p3 === '624') return 'Dindigul';
    if (p3 === '613') return 'Thanjavur';

    // Maharashtra
    if (p3 === '400') return 'Mumbai';
    if (p3 === '411') return 'Pune';
    if (p3 === '440') return 'Nagpur';
    if (p3 === '422') return 'Nashik';
    if (['401', '402'].includes(p3)) return 'Thane';
    if (p3 === '431') return 'Chhatrapati Sambhajinagar';
    if (p3 === '416') return 'Kolhapur';
    if (p3 === '413') return 'Solapur';

    // Delhi NCR
    if (p2 === '11') return 'New Delhi';
    if (p3 === '122') return 'Gurugram';
    if (p3 === '201') return 'Noida';

    // Telangana / AP
    if (p3 === '500') return 'Hyderabad';
    if (p3 === '506') return 'Warangal';
    if (p3 === '530') return 'Visakhapatnam';
    if (p3 === '520') return 'Vijayawada';
    if (p3 === '522') return 'Guntur';
    if (p3 === '517') return 'Tirupati';

    // Gujarat
    if (p3 === '380') return 'Ahmedabad';
    if (p3 === '395') return 'Surat';
    if (p3 === '390') return 'Vadodara';
    if (p3 === '360') return 'Rajkot';
    if (p3 === '396') return 'Vapi';
    if (p3 === '382') return 'Gandhinagar';

    // West Bengal
    if (p3 === '700') return 'Kolkata';
    if (p3 === '711') return 'Howrah';
    if (p3 === '734') return 'Siliguri';
    if (p3 === '713') return 'Durgapur';

    // Kerala
    if (p3 === '682') return 'Kochi';
    if (p3 === '695') return 'Thiruvananthapuram';
    if (p3 === '673') return 'Kozhikode';
    if (p3 === '680') return 'Thrissur';

    // Rajasthan
    if (p3 === '302') return 'Jaipur';
    if (p3 === '342') return 'Jodhpur';
    if (p3 === '313') return 'Udaipur';
    if (p3 === '324') return 'Kota';
    if (p3 === '301') return 'Bhiwadi';

    // Madhya Pradesh
    if (p3 === '452') return 'Indore';
    if (p3 === '462') return 'Bhopal';
    if (p3 === '482') return 'Jabalpur';
    if (p3 === '474') return 'Gwalior';

    // Punjab / Haryana
    if (p2 === '16') return 'Chandigarh';
    if (p3 === '141') return 'Ludhiana';
    if (p3 === '143') return 'Amritsar';
    if (p3 === '144') return 'Jalandhar';
    if (p3 === '121') return 'Faridabad';
    if (p3 === '132') return 'Panipat';

    // Uttar Pradesh
    if (p3 === '208') return 'Kanpur';
    if (p3 === '226') return 'Lucknow';
    if (p3 === '221') return 'Varanasi';
    if (p3 === '282') return 'Agra';
    if (p3 === '250') return 'Meerut';

    // Bihar / Jharkhand / Odisha / Assam / Goa / NE
    if (p3 === '800') return 'Patna';
    if (p3 === '834') return 'Ranchi';
    if (p3 === '751') return 'Bhubaneswar';
    if (p3 === '781') return 'Guwahati';
    if (p3 === '403') return 'Panaji';
    if (p3 === '795') return 'Imphal';
  }

  if (state) {
    const s = state.trim().toLowerCase();
    if (s === 'karnataka') return 'Bengaluru';
    if (s === 'tamil nadu') return 'Chennai';
    if (s === 'maharashtra') return 'Mumbai';
    if (s === 'delhi') return 'Delhi';
    if (s === 'telangana') return 'Hyderabad';
    if (s === 'andhra pradesh') return 'Visakhapatnam';
    if (s === 'gujarat') return 'Ahmedabad';
    if (s === 'west bengal') return 'Kolkata';
    if (s === 'kerala') return 'Kochi';
    if (s === 'rajasthan') return 'Jaipur';
    if (s === 'madhya pradesh') return 'Indore';
    if (s === 'uttar pradesh') return 'Lucknow';
    if (s === 'haryana' || s === 'punjab') return 'Chandigarh';
    if (s === 'odisha') return 'Bhubaneswar';
    if (s === 'assam') return 'Guwahati';
    if (s === 'bihar') return 'Patna';
    if (s === 'jharkhand') return 'Ranchi';
    if (s === 'goa') return 'Panaji';
    if (s === 'chhattisgarh') return 'Raipur';
    if (s === 'uttarakhand') return 'Dehradun';
    if (s === 'jammu and kashmir') return 'Srinagar';
    if (s === 'manipur') return 'Imphal';
  }

  return null;
}

export function inferIndianState(
  pincode?: string | null,
  city?: string | null,
): string | null {
  if (pincode && /^[0-9]{6}$/.test(pincode.trim())) {
    const p2 = pincode.trim().slice(0, 2);
    const p3 = pincode.trim().slice(0, 3);
    if (p2 === '11') return 'Delhi';
    if (p2 === '12' || p2 === '13') return 'Haryana';
    if (p2 === '14' || p2 === '15') return 'Punjab';
    if (p2 === '16') return 'Chandigarh';
    if (p2 === '17') return 'Himachal Pradesh';
    if (p2 === '18' || p2 === '19') return 'Jammu and Kashmir';
    if (['20', '21', '22', '23', '25', '26', '27', '28'].includes(p2)) return 'Uttar Pradesh';
    if (p2 === '24') return 'Uttarakhand';
    if (['30', '31', '32', '33', '34'].includes(p2)) return 'Rajasthan';
    if (['36', '37', '38', '39'].includes(p2)) return 'Gujarat';
    if (p2 === '40') return pincode.trim().startsWith('403') ? 'Goa' : 'Maharashtra';
    if (['41', '42', '43', '44'].includes(p2)) return 'Maharashtra';
    if (['45', '46', '47', '48'].includes(p2)) return 'Madhya Pradesh';
    if (p2 === '49') return 'Chhattisgarh';
    if (p2 === '50') return 'Telangana';
    if (['51', '52', '53'].includes(p2)) return 'Andhra Pradesh';
    if (['56', '57', '58', '59'].includes(p2)) return 'Karnataka';
    if (['60', '61', '62', '63', '64'].includes(p2)) return 'Tamil Nadu';
    if (p3 === '605') return 'Puducherry';
    if (['67', '68', '69'].includes(p2)) return 'Kerala';
    if (['70', '71', '72', '73', '74'].includes(p2)) return 'West Bengal';
    if (['75', '76', '77'].includes(p2)) return 'Odisha';
    if (p2 === '78') return 'Assam';
    if (p3 === '795') return 'Manipur';
    if (p3 === '796') return 'Mizoram';
    if (p3 === '797') return 'Nagaland';
    if (p3 === '798') return 'Nagaland';
    if (p3 === '799') return 'Tripura';
    if (p3 === '793') return 'Meghalaya';
    if (p3 === '794') return 'Meghalaya';
    if (p3 === '790' || p3 === '791' || p3 === '792') return 'Arunachal Pradesh';
    if (p3 === '737') return 'Sikkim';
    if (['80', '84', '85'].includes(p2)) return 'Bihar';
    if (['81', '82', '83'].includes(p2)) return 'Jharkhand';
  }
  if (city) {
    const c = city.trim().toLowerCase();
    if (['bengaluru', 'bangalore', 'mysuru', 'hubballi', 'belagavi', 'mangaluru'].includes(c)) return 'Karnataka';
    if (['chennai', 'coimbatore', 'madurai', 'salem', 'tiruppur', 'erode'].includes(c)) return 'Tamil Nadu';
    if (['mumbai', 'pune', 'nagpur', 'nashik', 'thane'].includes(c)) return 'Maharashtra';
    if (['delhi', 'new delhi'].includes(c)) return 'Delhi';
    if (['hyderabad', 'secunderabad', 'warangal'].includes(c)) return 'Telangana';
    if (['ahmedabad', 'surat', 'vadodara', 'rajkot'].includes(c)) return 'Gujarat';
    if (['kolkata', 'howrah', 'siliguri'].includes(c)) return 'West Bengal';
  }
  return null;
}

function toDraft(row: RequirementRow): IntakeDraft {
  const pin = row.delivery_pincode || extractPinFromText(row.title) || extractPinFromText(row.description);
  const city = row.delivery_city || inferIndianCity(pin, row.delivery_state);
  const state =
    row.delivery_state ??
    (row.attributes?.delivery_state as string | undefined) ??
    inferIndianState(pin, city);

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
    deliveryCity: city,
    deliveryState: state,
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
      is_demo: isDemoMode,
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
  const pin = patch.deliveryPincode || extractPinFromText(patch.title) || extractPinFromText(patch.originalText);
  const derivedCity = patch.deliveryCity || (pin ? inferIndianCity(pin) : undefined);
  const derivedState =
    patch.deliveryState ??
    inferIndianState(pin ?? patch.deliveryPincode, derivedCity ?? patch.deliveryCity);

  if (derivedCity !== undefined) columns.delivery_city = derivedCity;
  if (derivedState !== undefined && derivedState !== null) {
    columns.delivery_state = derivedState;
  }
  if (pin !== undefined && pin !== null) {
    columns.delivery_pincode = pin;
  }
  if (patch.deliveryLine1 !== undefined) columns.delivery_line1 = patch.deliveryLine1;
  if (patch.siteNotes !== undefined) columns.site_notes = patch.siteNotes;

  if (derivedState !== undefined && derivedState !== null) {
    const existingAttrs = (columns.attributes as Record<string, unknown> | undefined) ?? patch.attributes ?? {};
    columns.attributes = {
      ...existingAttrs,
      delivery_state: derivedState,
    };
  }

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

export function mergeDraftPatch(draft: IntakeDraft, patch: DraftPatch): IntakeDraft {
  return {
    ...draft,
    ...patch,
    attributes: patch.attributes ?? draft.attributes,
    quality: patch.quality ? { ...draft.quality, ...patch.quality } : draft.quality,
    commercial: patch.commercial ? { ...draft.commercial, ...patch.commercial } : draft.commercial,
    sourcing: patch.sourcing ? { ...draft.sourcing, ...patch.sourcing } : draft.sourcing,
  };
}

/**
 * Saves the buyer's latest edits and then publishes.
 *
 * publish_requirement reads the requirement row, not the client draft, so the
 * edits must be on the server first. If that save fails we stop: publishing
 * the stale row would silently drop manual category / scope / location edits.
 */
export async function persistAndPublishDraft(
  draft: IntakeDraft,
  patch: DraftPatch,
): Promise<PublishResult> {
  let current = mergeDraftPatch(draft, patch);

  if (!draft.requirementId.startsWith('local-')) {
    const saved = await updateDraft(draft, patch);
    if (!saved.ok) {
      return { ok: false, error: `Could not save your latest edits before publishing: ${saved.error}` };
    }
    current = saved.draft;
  }

  return publishDraft(current);
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
