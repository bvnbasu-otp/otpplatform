import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  AttachmentKind,
  AttachmentScope,
  attributeSchemaFor,
  normalizeEvaluationWeights,
  REQUIREMENT_MODE_LABELS,
  type EvaluationCriterionDef,
  type SourcingMode,
  type TaxonomySnapshot,
} from '@otp/domain';
import { Badge, Button, Card, Field, NumberInput, RadioCardGroup } from '@/components/ui';
import { EvaluationCriteriaEditor } from '@/features/evaluation/components/EvaluationCriteriaEditor';
import { useRoleContext } from '@/features/roles';
import { useAuth } from '@/features/auth';
import { formatSize, signedUrlFor, useAttachments, type Attachment } from '@/features/attachments';
import type { DraftPatch } from '../../api/draft';
import type { IntakeDraft } from '../../types/intake-draft';

export interface ReviewAndPublishStepProps {
  draft: IntakeDraft;
  taxonomy: TaxonomySnapshot;
  criteria: EvaluationCriterionDef[];
  suggestedWeights: Record<string, number>;
  isBusy: boolean;
  error?: string | null;
  onBack: () => void;
  onEditStep: (index: number) => void;
  onPublish: (sourcingPatch: DraftPatch) => void;
}

const SOURCING_OPTIONS = [
  {
    value: 'IDENTITY_PROTECTED',
    label: '🛡️ Identity-Protected (Recommended)',
    description:
      'Suppliers quote with sealed identity protection on technical and commercial merit. Identity is only revealed upon final award confirmation.',
  },
  {
    value: 'OPEN_RFQ',
    label: '📢 Open RFQ Tender',
    description: 'Your organization name and requirement are visible upfront to all verified suppliers.',
  },
  {
    value: 'INVITE_SELECTED',
    label: '🎯 Direct Curated Invite',
    description: 'Manually invite specific verified suppliers on the discovery screen.',
  },
  {
    value: 'PREVIOUS_SUPPLIERS',
    label: '🤝 Existing Supplier Network',
    description: 'Limit invitations exclusively to suppliers who have delivered for your organization before.',
  },
];

function iconForAttachment(kind: AttachmentKind): string {
  switch (kind) {
    case AttachmentKind.VOICE_NOTE:
      return '🎙️';
    case AttachmentKind.DRAWING:
      return '📐';
    case AttachmentKind.PHOTO:
      return '🖼️';
    case AttachmentKind.HANDWRITTEN:
      return '✍️';
    default:
      return '📄';
  }
}

export function ReviewAndPublishStep({
  draft,
  taxonomy,
  criteria,
  suggestedWeights,
  isBusy,
  error,
  onBack,
  onEditStep,
  onPublish,
}: ReviewAndPublishStepProps) {
  const { context } = useRoleContext();
  const { user } = useAuth();
  const isFullGovernance = ['RESIDENTIAL_RWA', 'COMMUNITY', 'ENTERPRISE', 'RWA'].includes(
    context.buyerType || '',
  );

  const [sourcingMode, setSourcingMode] = useState<string>(
    draft.sourcing.sourcingMode || 'IDENTITY_PROTECTED',
  );
  const [minQuotes, setMinQuotes] = useState<number | null>(
    draft.sourcing.minQuotesRequired || 3,
  );
  const [deadlineDays, setDeadlineDays] = useState<number | null>(
    draft.sourcing.quoteDeadlineDays || 7,
  );
  const [weights, setWeights] = useState<Record<string, number>>(
    draft.sourcing.evaluationWeights,
  );
  const [source, setSource] = useState<'SUGGESTED' | 'CUSTOM'>(
    draft.sourcing.evaluationWeightsSource || 'SUGGESTED',
  );
  const [showWeightSliders, setShowWeightSliders] = useState(false);
  const [openingAttachmentId, setOpeningAttachmentId] = useState<string | null>(null);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Fetch real attachments for this draft
  const { attachments, isLoading: attachmentsLoading } = useAttachments({
    scope: AttachmentScope.REQUIREMENT,
    requirementId: draft.requirementId,
  });

  useEffect(() => {
    if (Object.keys(weights).length === 0 && Object.keys(suggestedWeights).length > 0) {
      setWeights({ ...suggestedWeights });
      setSource('SUGGESTED');
    }
  }, [suggestedWeights, weights]);

  const subcategory = taxonomy.subcategories.find((s) => s.id === draft.subcategoryId);
  const category = taxonomy.categories.find((c) => c.id === draft.categoryId);
  const schema = attributeSchemaFor(taxonomy, subcategory?.code);
  const criterionName = new Map(criteria.map((c) => [c.code, c.name]));
  const normalizedWeights = safeNormalize(weights);

  // DEF-003: Dynamic quorum explanation helper text and badge based on active sourcing mode
  const quorumHelper = useMemo(() => {
    switch (sourcingMode) {
      case 'IDENTITY_PROTECTED':
        return '🛡️ Identity-Protected Quorum: Minimum 3 sealed quotes recommended for unbiased commercial & technical merit evaluation before unsealing.';
      case 'OPEN_RFQ':
        return '📢 Open RFQ Quorum: Minimum 3 quotes recommended (up to 5) for healthy competitive tender benchmarking across verified suppliers.';
      case 'INVITE_SELECTED':
        return '🎯 Direct Curated Quorum: Minimum 2–3 quotes recommended from specifically invited suppliers.';
      case 'PREVIOUS_SUPPLIERS':
        return '🤝 Network Quorum: Minimum 1–2 quotes required from your verified past supplier relationships.';
      default:
        return 'Optimal competitive pricing is achieved with 3+ quotes.';
    }
  }, [sourcingMode]);

  // Validate required vs optional domain fields
  const missingValidation = useMemo(() => {
    const errors: Array<{ message: string; stepIndex: number; label: string }> = [];
    const warnings: Array<{ message: string; stepIndex: number; label: string }> = [];

    // Step 1 check
    if (!draft.title?.trim() || !draft.originalText?.trim() || !draft.subcategoryId) {
      errors.push({
        message: 'Requirement title, description, and vertical are required.',
        stepIndex: 0,
        label: 'Step 1: What do you need?',
      });
    }

    // Step 2 check
    if (!draft.deliveryCity?.trim() || !draft.deliveryPincode?.trim() || !/^[0-9]{6}$/.test(draft.deliveryPincode.trim())) {
      errors.push({
        message: 'Delivery city and valid 6-digit PIN code are required.',
        stepIndex: 1,
        label: 'Step 2: Where?',
      });
    }

    // Step 3 check
    if (draft.requiredByMode === 'WITHIN_DAYS' && (!draft.requiredByDays || draft.requiredByDays < 1)) {
      errors.push({
        message: 'Target turnaround days must be specified.',
        stepIndex: 2,
        label: 'Step 3: When & Budget',
      });
    } else if (draft.requiredByMode === 'SPECIFIC_DATE' && !draft.requiredByDate) {
      errors.push({
        message: 'Specific required-by target date must be set.',
        stepIndex: 2,
        label: 'Step 3: When & Budget',
      });
    }

    // Warnings (non-blocking)
    if (!draft.commercial?.budgetAmount) {
      warnings.push({
        message: 'No internal budget ceiling set. Suppliers will quote based on open market pricing.',
        stepIndex: 2,
        label: 'Step 3: Budget Ceiling',
      });
    }

    // Step 4 required attributes check
    const requiredAttrs = schema.filter((a) => a.isRequired);
    const missingAttrs = requiredAttrs.filter(
      (a) => draft.attributes[a.code] === undefined || draft.attributes[a.code] === '',
    );
    if (missingAttrs.length > 0) {
      errors.push({
        message: `Missing mandatory specifications: ${missingAttrs.map((a) => a.label).join(', ')}.`,
        stepIndex: 3,
        label: 'Step 4: Specifications',
      });
    }

    if (attachments.length === 0) {
      warnings.push({
        message: 'No drawings or BoQ files attached. Attaching specifications helps suppliers quote tighter margins.',
        stepIndex: 4,
        label: 'Step 5: Attachments',
      });
    }

    return { errors, warnings };
  }, [draft, schema, attachments.length]);

  const timingText =
    draft.requiredByMode === 'WITHIN_DAYS'
      ? `Within ${draft.requiredByDays ?? 15} days`
      : draft.requiredByMode === 'SPECIFIC_DATE'
        ? `By ${draft.requiredByDate ?? 'specified date'}`
        : draft.requiredByMode === 'IMMEDIATE'
          ? '⚡ Immediately (Urgent)'
          : '🤝 Flexible Schedule';

  async function handleOpenAttachment(att: Attachment) {
    setOpeningAttachmentId(att.attachmentId);
    setAttachmentError(null);
    try {
      const res = await signedUrlFor(att.storagePath);
      if (res.ok) {
        window.open(res.url, '_blank', 'noopener,noreferrer');
      } else {
        setAttachmentError(res.error || 'Could not open file preview.');
      }
    } finally {
      setOpeningAttachmentId(null);
    }
  }

  function handlePublish() {
    if (draft.status && draft.status !== 'DRAFT') {
      setValidationError(`Only a DRAFT requirement can be published; this requirement is currently ${draft.status}.`);
      return;
    }
    if (missingValidation.errors.length > 0) {
      setValidationError(missingValidation.errors[0]?.message ?? 'Please complete all required fields.');
      return;
    }
    if (!minQuotes || minQuotes < 1) {
      setValidationError('Please specify how many quotes you require before deciding.');
      return;
    }
    if (!deadlineDays || deadlineDays < 1) {
      setValidationError('Please set a quote submission deadline in days.');
      return;
    }
    const positive = Object.values(weights).filter((w) => w > 0);
    if (positive.length === 0) {
      setValidationError('At least one scoring criterion must have a weight above zero.');
      return;
    }

    setValidationError(null);
    onPublish({
      sourcing: {
        sourcingMode: sourcingMode as SourcingMode,
        minQuotesRequired: minQuotes,
        quoteDeadlineDays: deadlineDays,
        evaluationWeights: weights,
        evaluationWeightsSource: source,
        geographicReach: draft.sourcing.geographicReach ?? 'LOCAL',
      },
    });
  }

  return (
    <div className="space-y-4" data-testid="review-and-publish-step">
      {/* 0. Ready Status Header Banner */}
      <div className="rounded-xl border border-primary/20 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent p-3.5 shadow-2xs flex flex-wrap items-center justify-between gap-2">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <span className="text-base">📋</span>
            <h2 className="text-xs sm:text-sm font-extrabold text-foreground">
              Requirement Review &amp; Confirmation
            </h2>
            <Badge tone="success">✨ Ready for Sourcing</Badge>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Verify what suppliers will quote for. Tap <strong>Edit</strong> on any section to make quick adjustments.
          </p>
        </div>
      </div>

      {!user && !context.profileId && (
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-xs text-foreground space-y-1">
          <div className="flex items-center gap-1.5 font-bold text-primary">
            <span>🔑</span> Guest / Unauthenticated Draft
          </div>
          <p className="text-muted-foreground text-[11px] leading-relaxed">
            Your draft is safely saved on this device. Clicking <strong>Start Sourcing →</strong> will direct you to sign in or register to broadcast your requirement to verified suppliers.
          </p>
        </div>
      )}

      {/* Validation Errors & Warnings Alert Banners */}
      {missingValidation.errors.length > 0 && (
        <div className="rounded-xl border border-rose-300 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/40 p-3.5 text-xs text-rose-900 dark:text-rose-200 space-y-2">
          <div className="flex items-center gap-1.5 font-bold text-rose-700 dark:text-rose-400">
            <span>⚠️</span> Required Details Missing Before Sourcing:
          </div>
          <ul className="space-y-1 pl-4 list-disc text-[11px]">
            {missingValidation.errors.map((err) => (
              <li key={err.message} className="flex items-center justify-between gap-2">
                <span>{err.message}</span>
                <button
                  type="button"
                  onClick={() => onEditStep(err.stepIndex)}
                  className="font-bold underline text-rose-700 dark:text-rose-300 hover:opacity-80 shrink-0 min-h-[32px] px-1 py-0.5"
                >
                  Edit {err.label} →
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {missingValidation.warnings.length > 0 && missingValidation.errors.length === 0 && (
        <div className="rounded-xl border border-amber-300 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/40 p-3 text-xs text-amber-900 dark:text-amber-200 space-y-1.5">
          <div className="flex items-center gap-1.5 font-bold text-amber-800 dark:text-amber-300">
            <span>💡</span> Advisory Considerations:
          </div>
          <div className="space-y-1 text-[11px]">
            {missingValidation.warnings.map((warn) => (
              <div key={warn.message} className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">{warn.message}</span>
                <button
                  type="button"
                  onClick={() => onEditStep(warn.stepIndex)}
                  className="font-semibold text-primary underline hover:opacity-80 shrink-0 min-h-[32px] px-1 py-0.5"
                >
                  {warn.label} →
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 1. Requirement & Scope Card */}
      <Card
        title="1. What You Need (Requirement & Scope)"
        description="Core requirement details and procurement scope."
        action={
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onEditStep(0)}
            className="text-xs min-h-[38px] px-3 font-bold mobile-touch-target"
          >
            ✏️ Edit
          </Button>
        }
      >
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-extrabold text-foreground">
              {draft.title || 'Untitled Requirement'}
            </h3>
            {draft.requirementMode && (
              <span className="rounded-md bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary border border-primary/20">
                {REQUIREMENT_MODE_LABELS[draft.requirementMode]}
              </span>
            )}
          </div>

          <p className="text-xs text-foreground bg-muted/30 p-2.5 rounded-lg border leading-relaxed italic">
            &ldquo;{draft.originalText}&rdquo;
          </p>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs pt-1">
            <Item label="Category">{category?.name ?? 'Not set'}</Item>
            <Item label="Vertical">{subcategory?.name ?? 'Not set'}</Item>
            <Item label="Quantity & Unit">
              {draft.quantity !== null
                ? `${draft.quantity} ${draft.unit ?? 'units'}`
                : 'Turnkey Scope / Lump Sum'}
            </Item>
          </div>
        </div>
      </Card>

      {/* 2. Delivery Location & Fulfilment Card */}
      <Card
        title="2. Where (Location & Sourcing Reach)"
        description="Delivery location, geographic supplier matching, and site access."
        action={
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onEditStep(1)}
            className="text-xs min-h-[38px] px-3 font-bold mobile-touch-target"
          >
            ✏️ Edit
          </Button>
        }
      >
        <div className="space-y-3 text-xs">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <Item label="City & PIN">
              {`${draft.deliveryCity ?? 'Not set'} ${draft.deliveryPincode ? `(${draft.deliveryPincode})` : ''}`}
            </Item>
            <Item label="Sourcing Reach">
              {draft.sourcing.geographicReach === 'LOCAL'
                ? '📍 Local Suppliers'
                : draft.sourcing.geographicReach === 'STATE'
                  ? '🗺️ State / Regional'
                  : '🌐 PAN-India Reach'}
            </Item>
            <Item label="Fulfilment Mode">
              {draft.fulfilmentMode ? draft.fulfilmentMode.replace(/_/g, ' ') : 'Supplier Delivery'}
            </Item>
          </div>

          {(draft.deliveryLine1 || draft.siteNotes) && (
            <div className="rounded-lg border bg-muted/20 p-2.5 space-y-1 text-xs">
              <div className="flex items-center gap-1 text-[11px] font-semibold text-muted-foreground">
                <span>🔒 Private Facility Details (Encrypted until Award):</span>
              </div>
              {draft.deliveryLine1 && (
                <p className="text-foreground text-[11px]">
                  <strong>Address:</strong> {draft.deliveryLine1}
                </p>
              )}
              {draft.siteNotes && (
                <p className="text-muted-foreground text-[11px]">
                  <strong>Access Notes:</strong> {draft.siteNotes}
                </p>
              )}
            </div>
          )}
        </div>
      </Card>

      {/* 3. Timeline & Commercial Terms Card */}
      <Card
        title="3. When & Budget (Schedule & Commercial Terms)"
        description="Turnaround timeline, payment structure, and internal budget ceiling."
        action={
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onEditStep(2)}
            className="text-xs min-h-[38px] px-3 font-bold mobile-touch-target"
          >
            ✏️ Edit
          </Button>
        }
      >
        <div className="space-y-3 text-xs">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <Item label="Delivery Schedule">{timingText}</Item>
            <Item label="Budget Ceiling" privacyNotice="Private">
              {draft.commercial.budgetAmount !== null && draft.commercial.budgetAmount !== undefined
                ? `₹${draft.commercial.budgetAmount.toLocaleString('en-IN')}`
                : 'Not specified (Open pricing)'}
            </Item>
            <Item label="Payment Terms">
              {draft.commercial.paymentTerms || '100% on delivery & sign-off'}
            </Item>
            <Item label="Price Inclusions">
              {[
                draft.commercial.priceIncludesTransport ? 'Transport included' : null,
                draft.commercial.priceIncludesGst ? 'GST included' : null,
              ]
                .filter(Boolean)
                .join(', ') || 'Ex-works'}
            </Item>
          </div>

          {draft.commercial.notes && (
            <div className="pt-1 text-[11px] text-muted-foreground">
              <strong>Commercial Remarks:</strong> {draft.commercial.notes}
            </div>
          )}
        </div>
      </Card>

      {/* 4. Technical Specifications & Quality Card */}
      <Card
        title="4. Specifications & Quality Standards"
        description="Category parameters, warranty expectations, and inspection criteria."
        action={
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onEditStep(3)}
            className="text-xs min-h-[38px] px-3 font-bold mobile-touch-target"
          >
            ✏️ Edit
          </Button>
        }
      >
        <div className="space-y-3 text-xs">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <Item label="Warranty Expected">
              {draft.quality.warrantyMonths
                ? `${draft.quality.warrantyMonths} Months`
                : 'Standard Manufacturer Warranty'}
            </Item>
            <Item label="Inspection Signoff">
              {draft.quality.inspectionRequired ? 'Pre-dispatch Signoff' : 'Standard'}
            </Item>
            <Item label="Physical Sample">
              {draft.quality.sampleRequired ? 'Sample Approval Required' : 'Not Required'}
            </Item>
            {draft.quality.certifications && draft.quality.certifications.length > 0 && (
              <Item label="Certifications Required">
                {draft.quality.certifications.join(', ')}
              </Item>
            )}
          </div>

          {Object.keys(draft.attributes).length > 0 ? (
            <div className="pt-2 border-t space-y-1.5">
              <span className="text-[11px] font-bold text-foreground block">
                Technical Specifications:
              </span>
              <div className="flex flex-wrap gap-1.5">
                {schema
                  .filter((a) => draft.attributes[a.code] !== undefined)
                  .map((a) => (
                    <span
                      key={a.code}
                      className="inline-flex items-center gap-1 rounded-lg bg-muted/60 px-2.5 py-1 text-[11px] font-medium text-foreground border shadow-2xs"
                    >
                      <span className="text-muted-foreground">{a.label}:</span>
                      <strong>{formatAttrVal(draft.attributes[a.code])}</strong>
                    </span>
                  ))}
              </div>
            </div>
          ) : (
            <p className="text-[11px] text-muted-foreground italic pt-1">
              ✓ Standard vertical specifications apply.
            </p>
          )}

          {draft.quality.notes && (
            <div className="pt-1 text-[11px] text-muted-foreground">
              <strong>Quality Remarks:</strong> {draft.quality.notes}
            </div>
          )}
        </div>
      </Card>

      {/* 5. Drawings, BoQ & Attachments Review Card */}
      <Card
        title={`5. Drawings, BoQ & Attachments (${attachments.length})`}
        description="Technical files, drawings, BoQs, and photos attached to this requirement."
        action={
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onEditStep(4)}
            className="text-xs min-h-[38px] px-3 font-bold mobile-touch-target"
          >
            ✏️ Edit Files
          </Button>
        }
      >
        <div className="space-y-3 text-xs">
          <div className="flex items-center gap-2">
            <span className="rounded-md bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary border border-primary/20">
              🔒 Identity-Protected Files
            </span>
            <span className="text-[11px] text-muted-foreground">
              Metadata stripped before supplier distribution
            </span>
          </div>

          {attachmentsLoading ? (
            <p className="text-xs text-muted-foreground py-2">Loading attachments…</p>
          ) : attachments.length > 0 ? (
            <div className="divide-y rounded-xl border bg-card">
              {attachments.map((att) => (
                <div
                  key={att.attachmentId}
                  className="flex items-center justify-between p-2.5 gap-2 hover:bg-muted/30 transition"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-base shrink-0">{iconForAttachment(att.kind)}</span>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-foreground truncate">
                        {att.originalFilename || att.displayName}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {formatSize(att.sizeBytes)} · {att.displayName}
                      </p>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={openingAttachmentId === att.attachmentId}
                    busy={openingAttachmentId === att.attachmentId}
                    onClick={() => void handleOpenAttachment(att)}
                    className="text-[11px] min-h-[36px] px-2.5 shrink-0 mobile-touch-target"
                  >
                    View / Download ↗
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed p-3 text-center text-[11px] text-muted-foreground bg-muted/20">
              No files attached. You can proceed without attachments or tap <strong>Edit Files</strong> to upload drawings or BoQs.
            </div>
          )}

          {attachmentError && (
            <p className="text-xs text-red-600 font-medium">⚠️ {attachmentError}</p>
          )}
        </div>
      </Card>

      {/* 6. Sourcing Protocol, Quorum & Scoring Weights Card */}
      <Card
        title="6. Sourcing Protocol & Merit Weights"
        description="Supplier invitation protocol and transparent merit scoring criteria."
      >
        <div className="space-y-4">
          <RadioCardGroup
            legend="Sourcing Mode"
            options={SOURCING_OPTIONS}
            value={sourcingMode}
            onValueChange={setSourcingMode}
          />

          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label="Quorum (Minimum Quotes Needed)"
              help={quorumHelper}
            >
              {({ id }) => (
                <div className="space-y-1.5">
                  <NumberInput
                    id={id}
                    min={1}
                    value={minQuotes}
                    onValueChange={setMinQuotes}
                  />
                  <div
                    className="rounded-lg border border-primary/20 bg-primary/5 p-2 text-[11px] text-foreground flex items-start gap-1.5 animate-in fade-in-50"
                    data-testid="quorum-explanation-badge"
                  >
                    <span className="shrink-0 mt-0.5">ℹ️</span>
                    <span className="leading-snug">{quorumHelper}</span>
                  </div>
                </div>
              )}
            </Field>

            <Field label="Quote Submission Window" hint="days from publishing">
              {({ id }) => (
                <NumberInput
                  id={id}
                  min={1}
                  unit="days"
                  value={deadlineDays}
                  onValueChange={setDeadlineDays}
                />
              )}
            </Field>
          </div>

          {/* Full Governance Section if Applicable */}
          {isFullGovernance && (
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-xs text-foreground space-y-1">
              <div className="flex items-center gap-1.5 font-bold text-primary">
                <span>🏛️</span> Full Governance &amp; Committee Approval:
              </div>
              <p className="text-muted-foreground leading-relaxed text-[11px]">
                As an RWA / Enterprise buyer, sealed quotes will be aggregated transparently for multi-member committee evaluation and audit recording following the quote submission deadline.
              </p>
            </div>
          )}

          <div className="border-t pt-3">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-xs font-bold text-foreground">Merit Evaluation Weights</h4>
                <p className="text-[11px] text-muted-foreground">
                  Quotes are evaluated transparently against these merit weights.
                </p>
              </div>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setShowWeightSliders(!showWeightSliders)}
                className="text-xs min-h-[36px] mobile-touch-target"
              >
                {showWeightSliders ? 'Hide Sliders ▲' : '⚙️ Customize Weights ▼'}
              </Button>
            </div>

            {/* Quick Merit Formula Badges */}
            <div className="mt-2.5 flex flex-wrap gap-2">
              {Object.entries(normalizedWeights).map(([code, weight]) => (
                <span
                  key={code}
                  className="inline-flex items-center gap-1.5 rounded-full border bg-muted/40 px-3 py-1 text-xs font-semibold text-foreground shadow-2xs"
                >
                  <span>{criterionName.get(code) ?? code}:</span>
                  <strong className="text-primary">{Math.round(weight > 1 ? weight : weight * 100)}%</strong>
                </span>
              ))}
            </div>

            {showWeightSliders && (
              <div className="mt-3.5 rounded-xl border bg-card p-3.5 space-y-3">
                <EvaluationCriteriaEditor
                  catalog={criteria}
                  weights={weights}
                  onWeightsChange={setWeights}
                  suggested={suggestedWeights}
                  source={source}
                  onSourceChange={setSource}
                />
              </div>
            )}
          </div>
        </div>
      </Card>

      {draft.status && draft.status !== 'DRAFT' && (
        <div className="rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 p-3.5 text-xs text-amber-900 dark:text-amber-200 font-semibold space-y-2 shadow-2xs">
          <div className="flex items-center gap-1.5 font-bold">
            <span>ℹ️</span>
            <span>Requirement Already {draft.status === 'COMPLETED' ? 'Completed' : 'Published'} (Status: {draft.status})</span>
          </div>
          <p className="text-[11px] text-amber-800 dark:text-amber-300 font-normal leading-relaxed">
            Only DRAFT requirements can be published. This requirement has already completed its drafting phase.
          </p>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <a
              href="/requirements/new"
              className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-white shadow hover:opacity-90 transition"
            >
              + Start Fresh Requirement
            </a>
            <a
              href={`/requirements/${draft.requirementId}`}
              className="inline-flex items-center gap-1 rounded-lg border bg-card px-3 py-1.5 text-xs font-bold text-foreground hover:bg-muted transition"
            >
              View Requirement Details →
            </a>
          </div>
        </div>
      )}

      {(validationError || error) && (
        <div className="rounded-xl border border-rose-300 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/40 p-3.5 text-xs text-rose-900 dark:text-rose-200 font-semibold space-y-2">
          <div className="flex items-center gap-1.5">
            <span>⚠️</span>
            <span>{validationError || error}</span>
          </div>
          {(error?.toLowerCase().includes('authenticated') || error?.toLowerCase().includes('not logged in')) && (
            <div className="pt-2 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 border-t border-rose-200 dark:border-rose-900/80">
              <span className="text-[11px] font-normal text-rose-800 dark:text-rose-300">
                Your requirement draft is safely saved in local storage. Sign in as a Buyer to publish and start sourcing.
              </span>
              <a
                href={`/login?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`}
                className="inline-flex items-center gap-1 shrink-0 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-white shadow hover:opacity-90 transition"
              >
                🔑 Sign In to Start Sourcing →
              </a>
            </div>
          )}
        </div>
      )}

      {/* Sourcing Dispatch Info Callout */}
      <div className="rounded-xl border border-primary/20 bg-primary/5 p-3.5 text-xs text-foreground space-y-1">
        <div className="flex items-center gap-1.5 font-bold text-primary">
          <span>🚀</span> What happens next:
        </div>
        <p className="text-muted-foreground leading-relaxed">
          Your requirement will be broadcast to verified suppliers matching your category and location. Suppliers submit sealed, identity-protected quotes with responses expected within 30 minutes.
        </p>
      </div>

      {/* Inline validation or submission error directly above action CTA */}
      {(validationError || error) && (
        <div className="rounded-lg border border-rose-300 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/40 p-2.5 text-xs text-rose-800 dark:text-rose-200 font-bold flex items-center gap-1.5">
          <span>⚠️</span>
          <span>{validationError || error}</span>
        </div>
      )}

      {/* Action CTA with Double-Submission Protection */}
      <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-2.5 pt-3 border-t border-border/70">
        <Button variant="ghost" onClick={onBack} className="min-h-[48px] mobile-touch-target">
          ← Back
        </Button>
        <Button
          type="button"
          variant="action"
          size="lg"
          onClick={handlePublish}
          disabled={isBusy || missingValidation.errors.length > 0 || (Boolean(draft.status) && draft.status !== 'DRAFT')}
          busy={isBusy}
          busyLabel="Publishing RFQ & Discovering Suppliers…"
          className="min-h-[48px] w-full sm:w-auto font-extrabold text-sm shadow-md mobile-touch-target"
          data-testid="publish-requirement-btn"
        >
          🚀 Start Sourcing →
        </Button>
      </div>
    </div>
  );
}

function Item({
  label,
  children,
  privacyNotice,
}: {
  label: string;
  children: ReactNode;
  privacyNotice?: string;
}) {
  return (
    <div>
      <dt className="flex items-center gap-1 text-[11px] text-muted-foreground">
        <span>{label}</span>
        {privacyNotice && (
          <span className="rounded bg-muted px-1 py-0.2 text-[9px] font-semibold text-muted-foreground border">
            🔒 {privacyNotice}
          </span>
        )}
      </dt>
      <dd className="mt-0.5 text-xs font-semibold text-foreground truncate">{children}</dd>
    </div>
  );
}

function formatAttrVal(val: unknown): string {
  if (val === null || val === undefined) return '—';
  if (typeof val === 'boolean') return val ? 'Yes' : 'No';
  if (Array.isArray(val)) return val.join(', ');
  return String(val);
}

function safeNormalize(weights: Record<string, number>): Record<string, number> {
  try {
    return normalizeEvaluationWeights(weights).weights;
  } catch {
    return {};
  }
}
