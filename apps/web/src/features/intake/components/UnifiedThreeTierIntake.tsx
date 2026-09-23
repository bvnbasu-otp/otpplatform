import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  attributeSchemaFor,
  RuleBasedRequirementParser,
  type AttributeDef,
  type AttributeValue,
  type FulfilmentMode,
  type ParsedRequirement,
  type RequiredByMode,
  type RequirementMode,
  type SourcingMode,
  type TaxonomySnapshot,
} from '@otp/domain';
import { Badge, Button } from '@/components/ui';
import { useAuth } from '@/features/auth';
import { useRoleContext } from '@/features/roles';
import type { DraftPatch } from '../api/draft';
import type { IntakeDraft } from '../types/intake-draft';
import {
  TemplatesAndExamplesModal,
  type ProcurementTemplate,
} from './TemplatesAndExamplesModal';
import { Tier1TellOtpCard } from './Tier1TellOtpCard';
import { Tier2PrecisionScopeCard } from './Tier2PrecisionScopeCard';
import { Tier3SourcingControlsCard } from './Tier3SourcingControlsCard';
import type { OrganizationSubscription } from '@/features/subscription';

export interface UnifiedThreeTierIntakeProps {
  taxonomy: TaxonomySnapshot;
  draft: IntakeDraft | null;
  suggestedWeights: Record<string, number>;
  initialHandoffText?: string;
  isSaving: boolean;
  isPublishing: boolean;
  publishError?: string | null;
  subscription: OrganizationSubscription | null;
  restoredNotice: boolean;
  onSave: (patch: DraftPatch) => Promise<IntakeDraft | null>;
  onStart: (payload: {
    title: string;
    originalText: string;
    parsed?: DraftPatch;
  }) => Promise<IntakeDraft | null>;
  onPublish: (sourcingPatch: DraftPatch) => Promise<void>;
  onOpenPaymentModal: () => void;
  onClearDraft: () => void;
}

const parser = new RuleBasedRequirementParser();

export function UnifiedThreeTierIntake({
  taxonomy,
  draft,
  suggestedWeights,
  initialHandoffText = '',
  isSaving,
  isPublishing,
  publishError,
  subscription,
  restoredNotice,
  onSave,
  onStart,
  onPublish,
  onOpenPaymentModal,
  onClearDraft,
}: UnifiedThreeTierIntakeProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { context } = useRoleContext();
  const isFullGovernance = ['RESIDENTIAL_RWA', 'COMMUNITY', 'ENTERPRISE', 'RWA'].includes(
    context.buyerType || '',
  );

  // Form State: Tier 1
  const [text, setText] = useState(draft?.originalText ?? initialHandoffText);
  const [title, setTitle] = useState(draft?.title ?? '');
  const [categoryId, setCategoryId] = useState(draft?.categoryId ?? '');
  const [subcategoryId, setSubcategoryId] = useState(draft?.subcategoryId ?? '');
  const [mode, setMode] = useState<RequirementMode | ''>(draft?.requirementMode ?? '');
  const [city, setCity] = useState(draft?.deliveryCity ?? '');
  const [pincode, setPincode] = useState(draft?.deliveryPincode ?? '');
  const [fulfilment, setFulfilment] = useState<FulfilmentMode | string>(
    draft?.fulfilmentMode ?? 'SUPPLIER_DELIVERY',
  );
  const [timing, setTiming] = useState<RequiredByMode | string>(
    draft?.requiredByMode ?? 'WITHIN_DAYS',
  );
  const [days, setDays] = useState<number | null>(draft?.requiredByDays ?? 7);
  const [date, setDate] = useState<string>(draft?.requiredByDate ?? '');
  const [budgetAmount, setBudgetAmount] = useState<number | null>(
    draft?.commercial.budgetAmount ?? null,
  );

  // Form State: Tier 2
  const [quantity, setQuantity] = useState<number | null>(draft?.quantity ?? 1);
  const [unit, setUnit] = useState<string>(draft?.unit ?? 'UNITS');
  const [attributes, setAttributes] = useState<Record<string, AttributeValue>>(
    draft?.attributes ?? {},
  );
  const [warrantyMonths, setWarrantyMonths] = useState<number | null>(
    draft?.quality.warrantyMonths ?? 12,
  );
  const [certifications, setCertifications] = useState<string>(
    (draft?.quality.certifications ?? []).join(', '),
  );
  const [inspectionRequired, setInspectionRequired] = useState<boolean>(
    draft?.quality.inspectionRequired ?? false,
  );
  const [sampleRequired, setSampleRequired] = useState<boolean>(
    draft?.quality.sampleRequired ?? false,
  );
  const [qualityNotes, setQualityNotes] = useState<string>(draft?.quality.notes ?? '');
  const [isTier2Expanded, setIsTier2Expanded] = useState(false);

  // Form State: Tier 3
  const [isTier3Expanded, setIsTier3Expanded] = useState(false);
  const [sourcingMode, setSourcingMode] = useState<SourcingMode>(
    draft?.sourcing.sourcingMode ?? 'IDENTITY_PROTECTED',
  );
  const [minQuotes, setMinQuotes] = useState<number | null>(
    draft?.sourcing.minQuotesRequired ?? 3,
  );
  const [deadlineDays, setDeadlineDays] = useState<number | null>(
    draft?.sourcing.quoteDeadlineDays ?? 7,
  );
  const [geographicReach, setGeographicReach] = useState<'PAN_INDIA' | 'LOCAL' | 'STATE'>(
    draft?.sourcing.geographicReach ?? 'LOCAL',
  );
  const [evaluationWeights, setEvaluationWeights] = useState<Record<string, number>>(
    draft?.sourcing.evaluationWeights ?? {},
  );
  const [weightsSource, setWeightsSource] = useState<'SUGGESTED' | 'CUSTOM'>(
    draft?.sourcing.evaluationWeightsSource ?? 'SUGGESTED',
  );
  const [line1, setLine1] = useState<string>(draft?.deliveryLine1 ?? '');
  const [siteNotes, setSiteNotes] = useState<string>(draft?.siteNotes ?? '');

  // Meta State
  const [parsed, setParsed] = useState<ParsedRequirement | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isTemplatesModalOpen, setIsTemplatesModalOpen] = useState(false);

  // Sync state if draft loads later
  useEffect(() => {
    if (draft) {
      if (draft.originalText && !text) setText(draft.originalText);
      if (draft.title && !title) setTitle(draft.title);
      if (draft.categoryId && !categoryId) setCategoryId(draft.categoryId);
      if (draft.subcategoryId && !subcategoryId) setSubcategoryId(draft.subcategoryId);
      if (draft.requirementMode && !mode) setMode(draft.requirementMode);
      if (draft.deliveryCity && !city) setCity(draft.deliveryCity);
      if (draft.deliveryPincode && !pincode) setPincode(draft.deliveryPincode);
      if (draft.fulfilmentMode) setFulfilment(draft.fulfilmentMode);
      if (draft.requiredByMode) setTiming(draft.requiredByMode);
      if (draft.requiredByDays !== null && draft.requiredByDays !== undefined) setDays(draft.requiredByDays);
      if (draft.requiredByDate) setDate(draft.requiredByDate);
      if (draft.commercial.budgetAmount !== null && draft.commercial.budgetAmount !== undefined) {
        setBudgetAmount(draft.commercial.budgetAmount);
      }
      if (draft.quantity !== null && draft.quantity !== undefined) setQuantity(draft.quantity);
      if (draft.unit) setUnit(draft.unit);
      if (draft.attributes && Object.keys(draft.attributes).length > 0) {
        setAttributes((prev) => ({ ...draft.attributes, ...prev }));
      }
      if (draft.quality.warrantyMonths !== null && draft.quality.warrantyMonths !== undefined) {
        setWarrantyMonths(draft.quality.warrantyMonths);
      }
      if (draft.quality.certifications) {
        setCertifications(draft.quality.certifications.join(', '));
      }
      if (draft.quality.inspectionRequired !== undefined) {
        setInspectionRequired(draft.quality.inspectionRequired);
      }
      if (draft.quality.sampleRequired !== undefined) {
        setSampleRequired(draft.quality.sampleRequired);
      }
      if (draft.quality.notes) setQualityNotes(draft.quality.notes);
      if (draft.sourcing.sourcingMode) setSourcingMode(draft.sourcing.sourcingMode);
      if (draft.sourcing.minQuotesRequired) setMinQuotes(draft.sourcing.minQuotesRequired);
      if (draft.sourcing.quoteDeadlineDays) setDeadlineDays(draft.sourcing.quoteDeadlineDays);
      if (draft.sourcing.geographicReach) setGeographicReach(draft.sourcing.geographicReach);
      if (draft.sourcing.evaluationWeights && Object.keys(draft.sourcing.evaluationWeights).length > 0) {
        setEvaluationWeights(draft.sourcing.evaluationWeights);
      }
      if (draft.deliveryLine1) setLine1(draft.deliveryLine1);
      if (draft.siteNotes) setSiteNotes(draft.siteNotes);
    }
  }, [draft]);

  // Dynamic Taxonomy Schema lookup for active subcategory
  const subcategory = useMemo(
    () => taxonomy.subcategories.find((s) => s.id === subcategoryId) ?? null,
    [taxonomy.subcategories, subcategoryId],
  );

  const schema = useMemo(
    () => attributeSchemaFor(taxonomy, subcategory?.code),
    [taxonomy, subcategory?.code],
  );

  const requiredAttributes = useMemo(
    () => schema.filter((a) => a.isRequired),
    [schema],
  );

  const optionalAttributes = useMemo(
    () => schema.filter((a) => !a.isRequired),
    [schema],
  );

  // Sync suggested weights if no custom weights set
  useEffect(() => {
    if (Object.keys(evaluationWeights).length === 0 && Object.keys(suggestedWeights).length > 0) {
      setEvaluationWeights({ ...suggestedWeights });
      setWeightsSource('SUGGESTED');
    }
  }, [suggestedWeights, evaluationWeights]);

  // Natural Language AI Parsing Handler
  const handleParse = useCallback(
    async (rawText: string) => {
      setIsParsing(true);
      try {
        const result = await parser.parse({ text: rawText, taxonomy });
        setParsed(result);

        if (result.title) {
          setTitle(result.title);
        } else if (!title || title === initialHandoffText.slice(0, 80)) {
          setTitle(rawText.slice(0, 80));
        }

        if (result.subcategoryCode) {
          const found = taxonomy.subcategories.find((s) => s.code === result.subcategoryCode);
          if (found) {
            setSubcategoryId(found.id);
            setCategoryId(found.categoryId);
            if (result.requirementMode) {
              setMode(result.requirementMode);
            } else if (found.defaultRequirementMode) {
              setMode(found.defaultRequirementMode as RequirementMode);
            }
          }
        }

        if (result.deliveryCity) setCity(result.deliveryCity);
        if (result.deliveryPincode) setPincode(result.deliveryPincode);

        if (result.timing.isImmediate) {
          setTiming('IMMEDIATE');
          setDays(null);
        } else if (result.timing.requiredByDays !== null) {
          setTiming('WITHIN_DAYS');
          setDays(result.timing.requiredByDays);
        }

        if (result.warrantyMonths !== null) {
          setWarrantyMonths(result.warrantyMonths);
        }

        if (result.quantity !== null) {
          setQuantity(result.quantity);
        }
        if (result.unit) {
          setUnit(result.unit);
        }

        if (result.attributes.length > 0) {
          const parsedAttrs: Record<string, AttributeValue> = {};
          for (const a of result.attributes) {
            parsedAttrs[a.code] = a.value;
          }
          setAttributes((prev) => ({ ...prev, ...parsedAttrs }));
        }

        return result;
      } finally {
        setIsParsing(false);
      }
    },
    [taxonomy, title, initialHandoffText],
  );

  // Run parser on mount if initial handoff text exists
  useEffect(() => {
    if (text.trim().length >= 10 && !subcategoryId && !draft) {
      void handleParse(text.trim());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Attribute change handler
  const handleAttributeChange = useCallback((code: string, value: AttributeValue | null) => {
    setAttributes((current) => {
      if (value === null || value === '' || (Array.isArray(value) && value.length === 0)) {
        const { [code]: _cleared, ...rest } = current;
        return rest;
      }
      return { ...current, [code]: value };
    });
    setErrors((prev) => {
      const { [code]: _resolved, ...rest } = prev;
      return rest;
    });
  }, []);

  // Template selection handler
  const handleSelectTemplate = useCallback(
    (tmpl: ProcurementTemplate) => {
      setTitle(tmpl.title);
      setText(tmpl.description);
      if (tmpl.mode) setMode(tmpl.mode as RequirementMode);
      if (tmpl.defaultUnit) setUnit(tmpl.defaultUnit);
      if (tmpl.suggestedQuantity) setQuantity(tmpl.suggestedQuantity);
      if (tmpl.standardWarrantyMonths) setWarrantyMonths(tmpl.standardWarrantyMonths);

      const foundSub = taxonomy.subcategories.find(
        (s) =>
          s.name.toLowerCase().includes(tmpl.subcategory.toLowerCase()) ||
          tmpl.subcategory.toLowerCase().includes(s.name.toLowerCase()),
      );
      if (foundSub) {
        setSubcategoryId(foundSub.id);
        setCategoryId(foundSub.categoryId);
      }

      setIsTemplatesModalOpen(false);
    },
    [taxonomy.subcategories],
  );

  // Clear all form inputs
  const handleClear = useCallback(() => {
    setText('');
    setTitle('');
    setCategoryId('');
    setSubcategoryId('');
    setMode('');
    setCity('');
    setPincode('');
    setTiming('WITHIN_DAYS');
    setDays(7);
    setDate('');
    setBudgetAmount(null);
    setQuantity(1);
    setUnit('UNITS');
    setAttributes({});
    setWarrantyMonths(12);
    setCertifications('');
    setInspectionRequired(false);
    setSampleRequired(false);
    setQualityNotes('');
    setLine1('');
    setSiteNotes('');
    setErrors({});
    setValidationError(null);
    onClearDraft();
  }, [onClearDraft]);

  // Validation
  const validateForm = useCallback(() => {
    const nextErrors: Record<string, string> = {};

    if (!text.trim() || text.trim().length < 5) {
      nextErrors.text = 'Please describe your requirement in a sentence or two.';
    }
    if (!title.trim()) {
      nextErrors.title = 'Requirement title is required.';
    }
    if (!subcategoryId) {
      nextErrors.subcategoryId = 'Please choose the specific type of work (vertical).';
    }
    if (!mode) {
      nextErrors.requirementMode = 'Please choose procurement mode.';
    }
    if (!city.trim()) {
      nextErrors.deliveryCity = 'Delivery / service city is required.';
    }
    if (!pincode.trim() || !/^[0-9]{6}$/.test(pincode.trim())) {
      nextErrors.deliveryPincode = 'Postal PIN code must be a valid 6-digit number.';
    }
    if (timing === 'WITHIN_DAYS' && (!days || days < 1)) {
      nextErrors.requiredByDays = 'Please specify target turnaround days.';
    }
    if (timing === 'SPECIFIC_DATE' && !date) {
      nextErrors.requiredByDate = 'Please select target date.';
    }
    if (!minQuotes || minQuotes < 1) {
      nextErrors.minQuotes = 'Minimum quotes required must be at least 1.';
    }
    if (!deadlineDays || deadlineDays < 1) {
      nextErrors.deadlineDays = 'Quote deadline must be at least 1 day.';
    }

    // Required attributes check
    for (const attr of requiredAttributes) {
      if (attr.isRequired && (attributes[attr.code] === undefined || attributes[attr.code] === '')) {
        nextErrors[attr.code] = `${attr.label} is required for this category.`;
      }
    }

    setErrors(nextErrors);
    return nextErrors;
  }, [text, title, subcategoryId, mode, city, pincode, timing, days, date, minQuotes, deadlineDays, requiredAttributes, attributes]);

  // Dominant Action Submit Handler
  async function handleLaunchSourcing() {
    setValidationError(null);
    const validationErrors = validateForm();
    const errorKeys = Object.keys(validationErrors);

    if (errorKeys.length > 0) {
      const firstError = validationErrors[errorKeys[0]!];
      setValidationError(firstError || 'Please complete all required fields.');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    const payloadPatch: DraftPatch = {
      title: title.trim(),
      originalText: text.trim(),
      categoryId: categoryId || null,
      subcategoryId: subcategoryId || null,
      requirementMode: (mode as RequirementMode) || null,
      quantity,
      unit: unit.trim() || null,
      attributes,
      quality: {
        warrantyMonths,
        certifications: certifications
          .split(',')
          .map((c) => c.trim())
          .filter(Boolean),
        inspectionRequired,
        sampleRequired,
        notes: qualityNotes.trim() || null,
      },
      commercial: {
        budgetAmount,
        priceIncludesTransport: true,
        priceIncludesGst: true,
      },
      sourcing: {
        sourcingMode: sourcingMode || 'IDENTITY_PROTECTED',
        minQuotesRequired: minQuotes || 3,
        quoteDeadlineDays: deadlineDays || 7,
        evaluationWeights,
        evaluationWeightsSource: weightsSource,
        geographicReach,
      },
      requiredByMode: (timing as RequiredByMode) || null,
      requiredByDays: timing === 'WITHIN_DAYS' ? days : null,
      requiredByDate: timing === 'SPECIFIC_DATE' ? date : null,
      fulfilmentMode: (fulfilment as FulfilmentMode) || null,
      deliveryCity: city.trim() || null,
      deliveryPincode: pincode.trim() || null,
      deliveryLine1: line1.trim() || null,
      siteNotes: siteNotes.trim() || null,
    };

    // Unauthenticated user handling
    if (!user || !context.profileId) {
      await onSave(payloadPatch);
      const redirectUrl = `/login?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`;
      navigate(redirectUrl);
      return;
    }

    // Subscription check
    if (subscription?.isExpired && (!subscription.freeRfqCredits || subscription.freeRfqCredits <= 0)) {
      onOpenPaymentModal();
      setValidationError('Your prepaid subscription has expired and you have 0 free RFQ credits remaining. Please recharge via UPI to publish requirements.');
      return;
    }

    if (!draft) {
      const created = await onStart({
        title: title.trim(),
        originalText: text.trim(),
        parsed: payloadPatch,
      });
      if (created) {
        await onPublish(payloadPatch);
      }
    } else {
      await onPublish(payloadPatch);
    }
  }

  // Completeness indicator helpers
  const isTier1Complete = Boolean(
    text.trim().length >= 5 &&
    title.trim() &&
    subcategoryId &&
    mode &&
    city.trim() &&
    pincode.trim() &&
    /^[0-9]{6}$/.test(pincode.trim()),
  );

  const isTier2Complete = Boolean(
    requiredAttributes.every((a) => attributes[a.code] !== undefined && attributes[a.code] !== ''),
  );

  return (
    <div className="space-y-4" data-testid="unified-three-tier-intake">
      {/* Wizard Step Progress Bar */}
      <div className="rounded-xl border border-border/80 bg-card px-3 py-2 flex items-center justify-between gap-3 shadow-2xs">
        <div className="flex items-center gap-2 text-xs font-bold shrink-0">
          <span className="text-primary font-black">Step 1: Scope &amp; Logistics</span>
          <span className="text-muted-foreground/60">·</span>
          <span className="text-[11px] text-muted-foreground font-semibold">{isTier1Complete ? '100%' : '65%'} Complete</span>
        </div>
        <div className="flex-1 max-w-xs bg-muted rounded-full h-1.5 overflow-hidden">
          <div
            className="bg-primary h-full rounded-full transition-all duration-300"
            style={{ width: isTier1Complete ? '100%' : '65%' }}
          />
        </div>
      </div>

      {/* Validation Error Alert */}
      {(validationError || publishError) && (
        <div className="rounded-xl border border-rose-300 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/40 p-3.5 text-xs text-rose-900 dark:text-rose-200 font-semibold space-y-2">
          <div className="flex items-center gap-1.5 font-bold">
            <span>⚠️</span>
            <span>{validationError || publishError}</span>
          </div>
        </div>
      )}

      {/* Tier 1: Tell OTP (Know Now & Natural Language) */}
      <Tier1TellOtpCard
        text={text}
        title={title}
        categoryId={categoryId}
        subcategoryId={subcategoryId}
        mode={mode}
        city={city}
        pincode={pincode}
        fulfilment={fulfilment}
        timing={timing}
        days={days}
        date={date}
        budgetAmount={budgetAmount}
        taxonomy={taxonomy}
        parsed={parsed}
        isParsing={isParsing}
        errors={errors}
        onTextChange={setText}
        onTitleChange={setTitle}
        onCategoryChange={setCategoryId}
        onSubcategoryChange={setSubcategoryId}
        onModeChange={setMode}
        onCityChange={setCity}
        onPincodeChange={setPincode}
        onFulfilmentChange={setFulfilment}
        onTimingChange={(t, d, dt) => {
          setTiming(t);
          if (d !== undefined) setDays(d);
          if (dt !== undefined) setDate(dt ?? '');
        }}
        onBudgetChange={setBudgetAmount}
        onParse={handleParse}
        onClearInput={handleClear}
        onOpenTemplates={() => setIsTemplatesModalOpen(true)}
      />

      {/* Tier 2: Precision Scope (Add Precision - Progressive Accordion) */}
      <Tier2PrecisionScopeCard
        quantity={quantity}
        unit={unit}
        attributes={attributes}
        requiredAttributes={requiredAttributes}
        optionalAttributes={optionalAttributes}
        warrantyMonths={warrantyMonths}
        certifications={certifications}
        inspectionRequired={inspectionRequired}
        sampleRequired={sampleRequired}
        qualityNotes={qualityNotes}
        requirementId={draft?.requirementId ?? null}
        isBusy={isSaving}
        isExpanded={isTier2Expanded}
        onToggleExpand={() => setIsTier2Expanded(!isTier2Expanded)}
        errors={errors}
        onQuantityChange={setQuantity}
        onUnitChange={setUnit}
        onAttributeChange={handleAttributeChange}
        onWarrantyChange={setWarrantyMonths}
        onCertificationsChange={setCertifications}
        onInspectionChange={setInspectionRequired}
        onSampleChange={setSampleRequired}
        onQualityNotesChange={setQualityNotes}
      />

      {/* Tier 3: Sourcing Controls (Progressive Disclosure Accordion) */}
      <Tier3SourcingControlsCard
        sourcingMode={sourcingMode}
        minQuotes={minQuotes}
        deadlineDays={deadlineDays}
        geographicReach={geographicReach}
        evaluationWeights={evaluationWeights}
        evaluationWeightsSource={weightsSource}
        criteria={taxonomy.criteria}
        suggestedWeights={suggestedWeights}
        siteNotes={siteNotes}
        line1={line1}
        isFullGovernance={isFullGovernance}
        isExpanded={isTier3Expanded}
        errors={errors}
        categoryCode={subcategory?.categoryCode}
        subcategoryCode={subcategory?.code}
        onToggleExpand={() => setIsTier3Expanded(!isTier3Expanded)}
        onSourcingModeChange={setSourcingMode}
        onMinQuotesChange={setMinQuotes}
        onDeadlineDaysChange={setDeadlineDays}
        onGeographicReachChange={setGeographicReach}
        onWeightsChange={setEvaluationWeights}
        onWeightsSourceChange={setWeightsSource}
        onSiteNotesChange={setSiteNotes}
        onLine1Change={setLine1}
      />

      {/* Templates & Examples Modal */}
      <TemplatesAndExamplesModal
        isOpen={isTemplatesModalOpen}
        onClose={() => setIsTemplatesModalOpen(false)}
        onSelectTemplate={handleSelectTemplate}
      />

      {/* Sticky Bottom Action Bar with Dominant Primary CTA */}
      <div className="sticky bottom-0 z-30 -mx-3 sm:mx-0 p-2.5 sm:p-3 bg-card/95 backdrop-blur-md border-t sm:border sm:rounded-2xl shadow-lg space-y-2">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
          <div className="flex items-center justify-between sm:justify-start gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleClear}
              className="min-h-[44px] text-xs font-semibold text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/30 mobile-touch-target"
            >
              🗑️ Reset Form
            </Button>
            {draft?.status && draft.status === 'DRAFT' && (
              <span className="text-[11px] text-muted-foreground hidden sm:inline">
                Draft auto-saved
              </span>
            )}
          </div>

          <Button
            type="button"
            variant="action"
            size="lg"
            onClick={() => void handleLaunchSourcing()}
            disabled={isPublishing || isSaving}
            busy={isPublishing}
            busyLabel="Publishing &amp; Discovering Suppliers…"
            className="min-h-[48px] font-extrabold text-sm shadow-md mobile-touch-target w-full sm:w-auto"
            data-testid="publish-requirement-btn"
          >
            Publish Sealed RFQ →
          </Button>
        </div>
      </div>
    </div>
  );
}
