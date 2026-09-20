import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { REQUIREMENT_PROMPT_KEY } from '@/features/site/components/RequirementPrompt';
import { useRoleContext } from '@/features/roles';
import { useAuth } from '@/features/auth';
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
import { UnifiedThreeTierIntake } from '../components';
import {
  fetchOrganizationSubscription,
  SubscriptionPaymentModal,
  type OrganizationSubscription,
} from '@/features/subscription';

function readHandoff(queryText: string | null): string {
  return queryText?.trim() || sessionStorage.getItem(REQUIREMENT_PROMPT_KEY)?.trim() || '';
}

export function RequirementIntakePage() {
  const navigate = useNavigate();
  const { context } = useRoleContext();
  const { user } = useAuth();
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

  const [suggestedWeights, setSuggestedWeights] = useState<Record<string, number>>({});
  const [publishError, setPublishError] = useState<string | null>(null);
  const [isPublishing, setIsPublishing] = useState(false);
  const [subscription, setSubscription] = useState<OrganizationSubscription | null>(null);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [restoredNotice, setRestoredNotice] = useState(false);

  useEffect(() => {
    if (!requirementId) {
      const local = loadLocalIntakeDraft(context.organizationId);
      if (local?.draft?.status && local.draft.status !== 'DRAFT') {
        clearLocalIntakeDraft(context.organizationId);
        return;
      }
      if (local?.draft?.requirementId && !local.draft.requirementId.startsWith('local-')) {
        setSearchParams({ draft: local.draft.requirementId }, { replace: true });
        setRestoredNotice(true);
      } else if (local?.draft) {
        setDraft(local.draft);
        setRestoredNotice(true);
      }
    }
  }, [requirementId, context.organizationId, setSearchParams, setDraft]);

  // Sync draft state to localStorage on changes
  useEffect(() => {
    if (draft) {
      if (draft.status && draft.status !== 'DRAFT') {
        clearLocalIntakeDraft(context.organizationId);
        return;
      }
      saveLocalIntakeDraft(
        {
          stepIndex: 0,
          furthestIndex: 0,
          draft,
        },
        context.organizationId,
      );
    }
  }, [draft, context.organizationId]);

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

  async function handlePublishWithSourcing(sourcingPatch: DraftPatch) {
    if (!draft) return;

    // Check if user is unauthenticated
    if (!user || !context.profileId) {
      const latestDraft = {
        ...draft,
        ...sourcingPatch,
        sourcing: {
          ...draft.sourcing,
          ...sourcingPatch.sourcing,
        },
      };
      saveLocalIntakeDraft(
        {
          stepIndex: 0,
          furthestIndex: 0,
          draft: latestDraft,
        },
        context.organizationId,
      );
      const redirectUrl = `/login?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`;
      navigate(redirectUrl);
      return;
    }

    if (subscription?.isExpired && (!subscription.freeRfqCredits || subscription.freeRfqCredits <= 0)) {
      setIsPaymentModalOpen(true);
      setPublishError('Your prepaid subscription has expired and you have 0 free RFQ credits remaining. Please recharge via UPI to publish requirements.');
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
      ...sourcingPatch,
      sourcing: {
        ...draft.sourcing,
        ...sourcingPatch.sourcing,
      },
    };

    const result = await publishDraft(latestDraft);
    setIsPublishing(false);

    if (!result.ok) {
      if (result.error?.toLowerCase().includes('authenticated') || result.error?.toLowerCase().includes('not logged in')) {
        const redirectUrl = `/login?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`;
        navigate(redirectUrl);
        return;
      }
      setPublishError(result.error);
      if (typeof window !== 'undefined') {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
      return;
    }

    clearLocalIntakeDraft(context.organizationId);
    navigate(`/requirements/${result.requirementId}/discover`);
  }

  const handleStartDraft = useCallback(
    async (payload: { title: string; originalText: string; parsed?: DraftPatch }) => {
      const created = await start({
        title: payload.title,
        originalText: payload.originalText,
        parsed: payload.parsed,
      });
      if (created) {
        setSearchParams({ draft: created.requirementId }, { replace: true });
      }
      return created;
    },
    [start, setSearchParams],
  );

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
    <div className="min-h-full pb-36 sm:pb-28 max-w-4xl mx-auto w-full px-3 sm:px-6 pt-2 sm:pt-3 space-y-3" data-testid="requirement-intake-page">
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
            New Requirement — 3-Tier Progressive Intake
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

      {/* Notice if requirement is already published/completed */}
      {draft?.status && draft.status !== 'DRAFT' && (
        <div className="rounded-2xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 p-4 space-y-2.5 shadow-2xs">
          <div className="flex items-center gap-2 text-amber-900 dark:text-amber-200 font-bold text-sm">
            <span>ℹ️</span>
            <span>Requirement Already {draft.status === 'COMPLETED' ? 'Completed' : 'Published'} (Status: {draft.status})</span>
          </div>
          <p className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
            This requirement is currently in status <strong>{draft.status}</strong>. Only DRAFT requirements can be edited or published through the intake flow.
          </p>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button
              type="button"
              onClick={() => {
                clearLocalIntakeDraft(context.organizationId);
                setSearchParams({}, { replace: true });
                window.location.href = '/requirements/new';
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-bold shadow-xs hover:bg-primary/90 transition mobile-touch-target cursor-pointer"
            >
              <span>+</span> Start Fresh Requirement
            </button>
            <Link
              to={draft.status === 'QUOTING' ? `/requirements/${draft.requirementId}/discover` : `/requirements/${draft.requirementId}`}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-border bg-card text-foreground text-xs font-bold hover:bg-muted transition mobile-touch-target cursor-pointer"
            >
              <span>📄</span> View Sourcing Lifecycle →
            </Link>
          </div>
        </div>
      )}

      {/* Subscription Notice */}
      {subscription?.isExpired && (subscription.freeRfqCredits > 0 ? (
        <div className="mt-2 rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-2.5 text-xs text-emerald-950 dark:text-emerald-200 shadow-2xs flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-1.5">
            <span className="font-bold text-xs">🎁 1 Free RFQ Starter Credit Available.</span>
            <span className="text-[11px] text-emerald-800 dark:text-emerald-300">You can publish this requirement for free!</span>
          </div>
        </div>
      ) : (
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
      ))}

      {draftError && (
        <p className="mt-2 rounded-xl border border-red-200 bg-red-50 p-2.5 text-xs text-red-700 font-medium">
          {draftError}
        </p>
      )}

      {/* Main Unified 3-Tier Intake Experience */}
      <div className="mt-3">
        <UnifiedThreeTierIntake
          taxonomy={taxonomy}
          draft={draft}
          suggestedWeights={suggestedWeights}
          initialHandoffText={handoff}
          isSaving={isSaving}
          isPublishing={isPublishing}
          publishError={publishError}
          subscription={subscription}
          restoredNotice={restoredNotice}
          onSave={save}
          onStart={handleStartDraft}
          onPublish={handlePublishWithSourcing}
          onOpenPaymentModal={() => setIsPaymentModalOpen(true)}
          onClearDraft={() => clearLocalIntakeDraft(context.organizationId)}
        />
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

      {/* Safe bottom spacer ensuring full scroll clearance above MobileBottomNav */}
      <div className="h-28 sm:h-16 shrink-0 w-full" aria-hidden="true" />
    </div>
  );
}
