import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  attributeSchemaFor,
  RuleBasedRequirementParser,
  type ParsedRequirement,
  type RequirementMode,
  type TaxonomySnapshot,
} from '@otp/domain';
import { Button, WizardStepper, type WizardStep } from '@/components/ui';
import { REQUIREMENT_PROMPT_KEY } from '@/features/site';
import { useRoleContext } from '@/features/roles';
import { fetchSuggestedWeights } from '../api/taxonomy';
import { publishDraft } from '../api/draft';
import type { DraftPatch } from '../api/draft';
import { useIntakeDraft } from '../hooks/use-intake-draft';
import { useTaxonomy } from '../hooks/use-taxonomy';
import {
  clearLocalIntakeDraft,
  loadLocalIntakeDraft,
  saveLocalIntakeDraft,
} from '../lib/intake-storage';
import {
  WhatDoYouNeedStep,
  WhereLocationStep,
  WhenAndBudgetStep,
  ScopeAndSpecificationsStep,
  AttachmentsStep,
  ReviewAndPublishStep,
} from '../components';
import {
  fetchOrganizationSubscription,
  SubscriptionPaymentModal,
  type OrganizationSubscription,
} from '@/features/subscription';

const STEPS: WizardStep[] = [
  { id: 'need', label: '1. What' },
  { id: 'location', label: '2. Where' },
  { id: 'timing_budget', label: '3. When & Budget' },
  { id: 'specifications', label: '4. Specs' },
  { id: 'attachments', label: '5. Attachments' },
  { id: 'review_publish', label: '6. Review & Publish' },
];

const STEP_TITLES = [
  'What do you need?',
  'Where is this needed?',
  'When & Budget?',
  'Scope & Specifications',
  'Drawings & Attachments',
  'Review & Publish',
];

const parser = new RuleBasedRequirementParser();

function readHandoff(queryText: string | null): string {
  return queryText?.trim() || sessionStorage.getItem(REQUIREMENT_PROMPT_KEY)?.trim() || '';
}

export function RequirementIntakePage() {
  const navigate = useNavigate();
  const { context } = useRoleContext();
  const [searchParams, setSearchParams] = useSearchParams();
  const requirementId = searchParams.get('draft');
  const [handoff] = useState(() =>
    requirementId ? '' : readHandoff(searchParams.get('q')),
  );

  useEffect(() => {
    sessionStorage.removeItem(REQUIREMENT_PROMPT_KEY);
  }, []);

  const { taxonomy, isLoading: taxonomyLoading, error: taxonomyError } = useTaxonomy();
  const { draft, setDraft, isLoading: draftLoading, isSaving, error: draftError, start, save } =
    useIntakeDraft(requirementId, context.organizationId);

  const [stepIndex, setStepIndex] = useState(0);
  const [furthestIndex, setFurthestIndex] = useState(0);
  const [parsed, setParsed] = useState<ParsedRequirement | null>(null);
  const [suggestedWeights, setSuggestedWeights] = useState<Record<string, number>>({});
  const [publishError, setPublishError] = useState<string | null>(null);
  const [isPublishing, setIsPublishing] = useState(false);
  const [subscription, setSubscription] = useState<OrganizationSubscription | null>(null);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [restoredNotice, setRestoredNotice] = useState(false);

  // Auto-scroll to top on step transitions
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [stepIndex]);

  useEffect(() => {
    if (!requirementId) {
      const local = loadLocalIntakeDraft(context.organizationId);
      if (local?.draft?.requirementId && !local.draft.requirementId.startsWith('local-')) {
        setSearchParams({ draft: local.draft.requirementId }, { replace: true });
        if (typeof local.stepIndex === 'number' && local.stepIndex >= 0 && local.stepIndex < STEPS.length) {
          setStepIndex(local.stepIndex);
        }
        if (typeof local.furthestIndex === 'number') setFurthestIndex(local.furthestIndex);
        if (local.parsed) setParsed(local.parsed);
        setRestoredNotice(true);
      } else if (local?.draft) {
        setDraft(local.draft);
        if (typeof local.stepIndex === 'number' && local.stepIndex >= 0 && local.stepIndex < STEPS.length) {
          setStepIndex(local.stepIndex);
        }
        if (typeof local.furthestIndex === 'number') setFurthestIndex(local.furthestIndex);
        if (local.parsed) setParsed(local.parsed);
        setRestoredNotice(true);
      }
    }
  }, [requirementId, context.organizationId, setSearchParams, setDraft]);

  // Sync draft state to localStorage on changes
  useEffect(() => {
    if (draft) {
      saveLocalIntakeDraft(
        {
          stepIndex,
          furthestIndex,
          draft,
          parsed,
        },
        context.organizationId,
      );
    }
  }, [stepIndex, furthestIndex, draft, parsed, context.organizationId]);

  useEffect(() => {
    if (context.organizationId) {
      void fetchOrganizationSubscription(context.organizationId).then((res) => {
        if (res.ok) setSubscription(res.subscription);
      });
    }
  }, [context.organizationId]);

  const subcategory = useMemo(
    () => taxonomy.subcategories.find((s) => s.id === draft?.subcategoryId) ?? null,
    [taxonomy.subcategories, draft?.subcategoryId],
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

  useEffect(() => {
    if (!subcategory) return;

    let cancelled = false;
    void fetchSuggestedWeights(subcategory.id).then((result) => {
      if (!cancelled && result.ok) setSuggestedWeights(result.weights);
    });

    return () => {
      cancelled = true;
    };
  }, [subcategory]);

  const goTo = useCallback((index: number) => {
    setStepIndex(index);
    setFurthestIndex((furthest) => Math.max(furthest, index));
  }, []);

  const handleParse = useCallback(
    async (text: string) => {
      const result = await parser.parse({ text, taxonomy });
      setParsed(result);
      return result;
    },
    [taxonomy],
  );

  async function handleScopeSubmit(payload: {
    title: string;
    originalText: string;
    categoryId: string | null;
    subcategoryId: string;
    requirementMode: RequirementMode;
    quantity: number | null;
    unit: string | null;
    parsed?: ParsedRequirement;
  }) {
    const activeParsed = payload.parsed ?? parsed;
    const parsedPatch = activeParsed
      ? parsedToPatch(activeParsed, taxonomy)
      : {};

    if (!draft) {
      const created = await start({
        title: payload.title,
        originalText: payload.originalText,
        parsed: {
          ...parsedPatch,
          categoryId: payload.categoryId,
          subcategoryId: payload.subcategoryId,
          requirementMode: payload.requirementMode,
          quantity: payload.quantity ?? parsedPatch.quantity ?? null,
          unit: payload.unit ?? parsedPatch.unit ?? null,
        },
      });
      if (!created) return;

      setSearchParams({ draft: created.requirementId }, { replace: true });
      goTo(1);
    } else {
      const saved = await save({
        ...parsedPatch,
        title: payload.title,
        originalText: payload.originalText,
        categoryId: payload.categoryId,
        subcategoryId: payload.subcategoryId,
        requirementMode: payload.requirementMode,
        quantity: payload.quantity,
        unit: payload.unit,
      });
      if (saved) goTo(1);
    }
  }

  async function saveAndAdvance(patch: DraftPatch, next: number) {
    const saved = await save(patch);
    if (saved) goTo(next);
  }

  async function handlePublishWithSourcing(sourcingPatch: DraftPatch) {
    if (!draft) return;

    if (subscription?.isExpired) {
      setIsPaymentModalOpen(true);
      setPublishError('Your prepaid subscription has expired. Please recharge via UPI to publish requirements.');
      return;
    }

    setIsPublishing(true);
    setPublishError(null);

    const saved = await save(sourcingPatch);
    if (!saved) {
      setIsPublishing(false);
      setPublishError('Could not save sourcing parameters.');
      return;
    }

    const latestDraft = {
      ...draft,
      sourcing: {
        ...draft.sourcing,
        ...sourcingPatch.sourcing,
      },
    };

    const result = await publishDraft(latestDraft);
    setIsPublishing(false);

    if (!result.ok) {
      setPublishError(result.error);
      return;
    }

    clearLocalIntakeDraft(context.organizationId);
    navigate(`/requirements/${result.requirementId}/discover`);
  }

  if (taxonomyLoading || draftLoading) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8" data-testid="requirement-intake-page">
        <p className="rounded-md border p-6 text-sm text-muted-foreground">
          Loading requirement intake…
        </p>
      </div>
    );
  }

  if (taxonomyError) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8" data-testid="requirement-intake-page">
        <p className="rounded-md border border-red-200 bg-red-50 p-6 text-sm text-red-700">
          The category catalog could not be loaded: {taxonomyError}
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-16 max-w-4xl mx-auto w-full px-3 sm:px-6 pt-3" data-testid="requirement-intake-page">
      {/* Top Header Bar */}
      <header className="rounded-xl border bg-card px-3.5 py-2.5 shadow-2xs shrink-0 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Link
            to="/dashboard"
            className="text-xs font-bold text-muted-foreground hover:text-foreground transition flex items-center gap-1"
          >
            <span>←</span>
            <span>Dashboard</span>
          </Link>
          <span className="text-muted-foreground/60">|</span>
          <h1 className="text-xs sm:text-sm font-extrabold text-foreground truncate">
            New Requirement
          </h1>
        </div>

        {restoredNotice && draft && (
          <div className="flex items-center gap-1.5 text-[11px] text-primary bg-primary/10 px-2 py-1 rounded-lg border border-primary/20 shrink-0">
            <span>💾 Draft recovered</span>
            <button
              type="button"
              onClick={() => {
                clearLocalIntakeDraft(context.organizationId);
                setRestoredNotice(false);
                setSearchParams({}, { replace: true });
                window.location.reload();
              }}
              className="text-[10px] font-bold underline hover:opacity-80 transition ml-1"
            >
              Clear
            </button>
          </div>
        )}
      </header>

      {/* Subscription Notice */}
      {subscription?.isExpired && (
        <div className="mt-2 rounded-xl border border-rose-300 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/40 p-2.5 text-xs text-rose-900 dark:text-rose-200 shadow-2xs flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-1.5">
            <span className="font-bold text-xs">🔒 Read-Only: Subscription Expired.</span>
            <span className="text-[11px] text-rose-800 dark:text-rose-300">Recharge via UPI to publish.</span>
          </div>
          <button
            type="button"
            onClick={() => setIsPaymentModalOpen(true)}
            className="shrink-0 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold px-3 py-1.5 text-xs shadow-2xs transition"
          >
            ⚡ Recharge Plan
          </button>
        </div>
      )}

      {/* Progressive Step Progress Meter (Mobile + Desktop Responsive) */}
      <div className="mt-3 rounded-xl border bg-card/80 p-3 shadow-2xs">
        {/* Mobile 1-Line Step Meter */}
        <div className="sm:hidden space-y-1.5">
          <div className="flex items-center justify-between text-xs font-bold text-foreground">
            <span className="flex items-center gap-1.5">
              <span className="rounded-full bg-primary/10 text-primary px-2 py-0.5 text-[11px] font-extrabold border border-primary/20">
                Step {stepIndex + 1} of {STEPS.length}
              </span>
              <span className="text-muted-foreground">·</span>
              <span className="truncate">{STEP_TITLES[stepIndex]}</span>
            </span>
            <span className="text-[11px] font-medium text-muted-foreground">
              {Math.round(((stepIndex + 1) / STEPS.length) * 100)}%
            </span>
          </div>
          {/* Progress Bar */}
          <div className="w-full bg-muted h-1.5 rounded-full overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-300 rounded-full"
              style={{ width: `${((stepIndex + 1) / STEPS.length) * 100}%` }}
            />
          </div>
        </div>

        {/* Desktop / Tablet Wizard Stepper */}
        <div className="hidden sm:block">
          <WizardStepper
            steps={STEPS}
            currentIndex={stepIndex}
            furthestIndex={furthestIndex}
            onStepSelect={setStepIndex}
          />
        </div>
      </div>

      {draftError && (
        <p className="mt-2 rounded-xl border border-red-200 bg-red-50 p-2.5 text-xs text-red-700 font-medium">
          {draftError}
        </p>
      )}

      {/* Main Step Content Area */}
      <div className="mt-3">
        {stepIndex === 0 && (
          <WhatDoYouNeedStep
            initialText={draft?.originalText ?? handoff}
            draft={draft}
            taxonomy={taxonomy}
            parsed={parsed}
            isBusy={isSaving}
            onParse={handleParse}
            onSubmit={(payload) => void handleScopeSubmit(payload)}
          />
        )}

        {stepIndex === 1 && draft && (
          <WhereLocationStep
            draft={draft}
            taxonomy={taxonomy}
            isBusy={isSaving}
            onBack={() => goTo(0)}
            onSubmit={(patch) => void saveAndAdvance(patch, 2)}
          />
        )}

        {stepIndex === 2 && draft && (
          <WhenAndBudgetStep
            draft={draft}
            isBusy={isSaving}
            onBack={() => goTo(1)}
            onSubmit={(patch) => void saveAndAdvance(patch, 3)}
          />
        )}

        {stepIndex === 3 && draft && (
          <ScopeAndSpecificationsStep
            draft={draft}
            requiredAttributes={requiredAttributes}
            optionalAttributes={optionalAttributes}
            isBusy={isSaving}
            onBack={() => goTo(2)}
            onSubmit={(patch) => void saveAndAdvance(patch, 4)}
          />
        )}

        {stepIndex === 4 && draft && (
          <AttachmentsStep
            draft={draft}
            isBusy={isSaving}
            onBack={() => goTo(3)}
            onSubmit={() => goTo(5)}
          />
        )}

        {stepIndex === 5 && draft && (
          <ReviewAndPublishStep
            draft={draft}
            taxonomy={taxonomy}
            criteria={taxonomy.criteria}
            suggestedWeights={suggestedWeights}
            isBusy={isPublishing || isSaving}
            error={publishError}
            onBack={() => goTo(4)}
            onEditStep={goTo}
            onPublish={(sourcingPatch) => void handlePublishWithSourcing(sourcingPatch)}
          />
        )}

        {stepIndex > 0 && !draft && (
          <div className="rounded-xl border bg-card p-6 text-center space-y-3">
            <p className="text-xs text-muted-foreground">
              Draft requirement could not be found or has expired.
            </p>
            <Button variant="secondary" onClick={() => goTo(0)} className="min-h-[44px]">
              Start new requirement
            </Button>
          </div>
        )}
      </div>

      {context.organizationId && (
        <SubscriptionPaymentModal
          isOpen={isPaymentModalOpen}
          onClose={() => setIsPaymentModalOpen(false)}
          organizationId={context.organizationId}
          organizationName={context.organizationName || 'Your Organization'}
          initialTierId={subscription?.tierId}
          initialCycle={subscription?.plan || 'MONTHLY'}
          onSuccess={() => {
            void fetchOrganizationSubscription(context.organizationId!).then((res) => {
              if (res.ok) setSubscription(res.subscription);
            });
          }}
        />
      )}
    </div>
  );
}

function parsedToPatch(
  parsed: ParsedRequirement,
  taxonomy: TaxonomySnapshot,
): DraftPatch {
  const subcategory = taxonomy.subcategories.find(
    (s) => s.code === parsed.subcategoryCode,
  );

  const patch: DraftPatch = {};

  if (subcategory) {
    patch.categoryId = subcategory.categoryId;
    patch.subcategoryId = subcategory.id;
    patch.requirementMode =
      parsed.requirementMode ?? subcategory.defaultRequirementMode;
  }
  if (parsed.quantity !== null) patch.quantity = parsed.quantity;
  if (parsed.unit) patch.unit = parsed.unit;
  if (parsed.attributes.length > 0) {
    patch.attributes = Object.fromEntries(
      parsed.attributes.map((a) => [a.code, a.value]),
    );
  }
  if (parsed.deliveryCity) patch.deliveryCity = parsed.deliveryCity;
  if (parsed.deliveryPincode) patch.deliveryPincode = parsed.deliveryPincode;
  if (parsed.timing.isImmediate) {
    patch.requiredByMode = 'IMMEDIATE';
  } else if (parsed.timing.requiredByDays !== null) {
    patch.requiredByMode = 'WITHIN_DAYS';
    patch.requiredByDays = parsed.timing.requiredByDays;
  }
  if (parsed.warrantyMonths !== null) {
    patch.quality = { warrantyMonths: parsed.warrantyMonths };
  }

  return patch;
}
