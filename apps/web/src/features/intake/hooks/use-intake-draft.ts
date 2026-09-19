import { useCallback, useEffect, useState } from 'react';
import {
  createDraft,
  fetchDraft,
  updateDraft,
  type CreateDraftInput,
  type DraftPatch,
} from '../api/draft';
import type { IntakeDraft } from '../types/intake-draft';
import { clearLocalIntakeDraft, loadLocalIntakeDraft, saveLocalIntakeDraft } from '../lib/intake-storage';

/**
 * Owns the draft requirement for the wizard with offline fallback.
 *
 * Saves to both Supabase and local storage so progress survives network loss,
 * page refreshes, and tab closures.
 */
export function useIntakeDraft(requirementId: string | null, orgId?: string | null) {
  const [draft, setDraft] = useState<IntakeDraft | null>(() => {
    if (!requirementId) {
      const local = loadLocalIntakeDraft(orgId);
      if (local?.draft?.status && local.draft.status !== 'DRAFT') {
        clearLocalIntakeDraft(orgId);
        return null;
      }
      return local?.draft ?? null;
    }
    return null;
  });
  const [isLoading, setIsLoading] = useState(Boolean(requirementId && !draft));
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!requirementId) {
      const local = loadLocalIntakeDraft(orgId);
      if (local?.draft) {
        if (local.draft.status && local.draft.status !== 'DRAFT') {
          clearLocalIntakeDraft(orgId);
          setDraft(null);
        } else {
          setDraft(local.draft);
        }
      } else {
        setDraft(null);
      }
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    void fetchDraft(requirementId).then((result) => {
      if (cancelled) return;
      if (result.ok) {
        if (result.draft.status && result.draft.status !== 'DRAFT') {
          clearLocalIntakeDraft(orgId);
        } else {
          saveLocalIntakeDraft({ stepIndex: 0, furthestIndex: 0, draft: result.draft }, orgId);
        }
        setDraft(result.draft);
        setError(null);
      } else {
        const local = loadLocalIntakeDraft(orgId);
        if (local?.draft && local.draft.requirementId === requirementId) {
          if (local.draft.status && local.draft.status !== 'DRAFT') {
            clearLocalIntakeDraft(orgId);
            setDraft(null);
          } else {
            setDraft(local.draft);
            setError(null);
          }
        } else {
          setError(result.error);
        }
      }
      setIsLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [requirementId, orgId]);

  const start = useCallback(
    async (input: CreateDraftInput) => {
      setIsSaving(true);
      const result = await createDraft(input);
      setIsSaving(false);

      if (!result.ok) {
        // Fallback for offline draft creation
        const offlineId = `local-${Date.now()}`;
        const localDraft: IntakeDraft = {
          requirementId: offlineId,
          organizationId: orgId ?? 'local',
          originalText: input.originalText,
          title: input.title,
          categoryId: input.parsed?.categoryId ?? null,
          subcategoryId: input.parsed?.subcategoryId ?? null,
          requirementMode: input.parsed?.requirementMode ?? null,
          quantity: input.parsed?.quantity ?? null,
          unit: input.parsed?.unit ?? null,
          attributes: input.parsed?.attributes ?? {},
          quality: (input.parsed?.quality ?? {}) as IntakeDraft['quality'],
          commercial: (input.parsed?.commercial ?? {}) as IntakeDraft['commercial'],
          sourcing: {
            sourcingMode: 'IDENTITY_PROTECTED',
            minQuotesRequired: 3,
            quoteDeadlineDays: 7,
            evaluationWeights: {},
            evaluationWeightsSource: 'SUGGESTED',
            geographicReach: 'LOCAL',
            ...(input.parsed?.sourcing ?? {}),
          },
          requiredByMode: input.parsed?.requiredByMode ?? null,
          requiredByDays: input.parsed?.requiredByDays ?? null,
          requiredByDate: input.parsed?.requiredByDate ?? null,
          fulfilmentMode: input.parsed?.fulfilmentMode ?? null,
          deliveryCity: input.parsed?.deliveryCity ?? null,
          deliveryPincode: input.parsed?.deliveryPincode ?? null,
          deliveryLine1: input.parsed?.deliveryLine1 ?? null,
          siteNotes: input.parsed?.siteNotes ?? null,
          status: 'DRAFT',
        };
        setDraft(localDraft);
        saveLocalIntakeDraft({ stepIndex: 1, furthestIndex: 1, draft: localDraft }, orgId);
        setError(null);
        return localDraft;
      }

      setDraft(result.draft);
      saveLocalIntakeDraft({ stepIndex: 1, furthestIndex: 1, draft: result.draft }, orgId);
      setError(null);
      return result.draft;
    },
    [orgId],
  );

  const save = useCallback(
    async (patch: DraftPatch) => {
      if (!draft) return null;

      const optimisticDraft: IntakeDraft = {
        ...draft,
        ...patch,
        attributes: patch.attributes ? { ...draft.attributes, ...patch.attributes } : draft.attributes,
        quality: patch.quality ? { ...draft.quality, ...patch.quality } : draft.quality,
        commercial: patch.commercial ? { ...draft.commercial, ...patch.commercial } : draft.commercial,
        sourcing: patch.sourcing ? { ...draft.sourcing, ...patch.sourcing } : draft.sourcing,
      };

      setDraft(optimisticDraft);
      saveLocalIntakeDraft({ stepIndex: 0, furthestIndex: 0, draft: optimisticDraft }, orgId);

      setIsSaving(true);
      const result = await updateDraft(draft, patch);
      setIsSaving(false);

      if (!result.ok) {
        // In offline/poor network, keep optimistic draft
        console.warn('Server save encountered issue, persisted locally:', result.error);
        return optimisticDraft;
      }

      setDraft(result.draft);
      saveLocalIntakeDraft({ stepIndex: 0, furthestIndex: 0, draft: result.draft }, orgId);
      setError(null);
      return result.draft;
    },
    [draft, orgId],
  );

  /** Local-only edit, for controls that should not write on every keystroke. */
  const patchLocal = useCallback(
    (patch: DraftPatch) => {
      setDraft((current) => {
        if (!current) return current;
        const updated = { ...current, ...patch };
        saveLocalIntakeDraft({ stepIndex: 0, furthestIndex: 0, draft: updated }, orgId);
        return updated;
      });
    },
    [orgId],
  );

  return { draft, setDraft, isLoading, isSaving, error, start, save, patchLocal, setError };
}
