import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import {
  createDraft,
  fetchDraft,
  updateDraft,
  type CreateDraftInput,
  type DraftPatch,
} from '../api/draft';
import type { IntakeDraft } from '../types/intake-draft';
import { applyIntakeDraftResultForCurrentScope } from '../lib/intake-draft-scope-guard';
import {
  clearLocalIntakeDraft,
  getIntakeDraftStorageKey,
  loadLocalIntakeDraft,
  saveLocalIntakeDraft,
  type IntakeDraftStorageScope,
} from '../lib/intake-storage';

/**
 * Owns the draft requirement for the wizard with offline fallback.
 *
 * Saves to both Supabase and local storage so progress survives network loss,
 * page refreshes, and tab closures.
 */
export function useIntakeDraft(
  requirementId: string | null,
  scope: IntakeDraftStorageScope | null,
) {
  const scopeKey = getIntakeDraftStorageKey(scope);
  const scopeKeyRef = useRef(scopeKey);
  scopeKeyRef.current = scopeKey;
  const [draftState, setDraftState] = useState<{
    scopeKey: string | null;
    draft: IntakeDraft | null;
  }>(() => ({
    scopeKey,
    draft: scope ? loadLocalIntakeDraft(scope)?.draft ?? null : null,
  }));
  const draft = draftState.scopeKey === scopeKey ? draftState.draft : null;
  const setDraft: Dispatch<SetStateAction<IntakeDraft | null>> = useCallback(
    (nextDraft) => {
      if (scopeKeyRef.current !== scopeKey) return;
      setDraftState((current) => {
        const currentDraft = current.scopeKey === scopeKey ? current.draft : null;
        const updatedDraft =
          typeof nextDraft === 'function' ? nextDraft(currentDraft) : nextDraft;
        return { scopeKey, draft: updatedDraft };
      });
    },
    [scopeKey],
  );
  const [isLoading, setIsLoading] = useState(Boolean(requirementId && scopeKey));
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
    setIsSaving(false);
    if (!scope || !scopeKey) {
      setDraftState({ scopeKey, draft: null });
      setIsLoading(false);
      return;
    }

    if (!requirementId) {
      const local = loadLocalIntakeDraft(scope);
      if (local?.draft) {
        if (local.draft.status && local.draft.status !== 'DRAFT') {
          clearLocalIntakeDraft(scope);
          setDraftState({ scopeKey, draft: null });
        } else {
          setDraftState({ scopeKey, draft: local.draft });
        }
      } else {
        setDraftState({ scopeKey, draft: null });
      }
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    void applyIntakeDraftResultForCurrentScope(
      fetchDraft(requirementId),
      scopeKeyRef,
      scopeKey,
      (result) => {
        if (cancelled) return;
        if (result.ok) {
          if (result.draft.status && result.draft.status !== 'DRAFT') {
            clearLocalIntakeDraft(scope);
          } else {
            saveLocalIntakeDraft(
              { stepIndex: 0, furthestIndex: 0, draft: result.draft },
              scope,
            );
          }
          setDraftState({ scopeKey, draft: result.draft });
          setError(null);
        } else {
          const local = loadLocalIntakeDraft(scope);
          if (local?.draft && local.draft.requirementId === requirementId) {
            if (local.draft.status && local.draft.status !== 'DRAFT') {
              clearLocalIntakeDraft(scope);
              setDraftState({ scopeKey, draft: null });
            } else {
              setDraftState({ scopeKey, draft: local.draft });
              setError(null);
            }
          } else {
            setError(result.error);
          }
        }
        setIsLoading(false);
      },
    );

    return () => {
      cancelled = true;
    };
  }, [requirementId, scope, scopeKey]);

  const start = useCallback(
    async (input: CreateDraftInput): Promise<IntakeDraft | null> => {
      if (!scope || !scopeKey) {
        setError('Draft recovery is unavailable until your buyer identity is resolved.');
        return null;
      }

      setIsSaving(true);
      let createdDraft: IntakeDraft | null = null;
      const applied = await applyIntakeDraftResultForCurrentScope(
        createDraft(input),
        scopeKeyRef,
        scopeKey,
        (result) => {
          setIsSaving(false);
          if (!result.ok) {
            const offlineId = `local-${Date.now()}`;
            const localDraft: IntakeDraft = {
              requirementId: offlineId,
              organizationId: scope.organizationId ?? 'local',
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
            saveLocalIntakeDraft({ stepIndex: 1, furthestIndex: 1, draft: localDraft }, scope);
            setError(null);
            createdDraft = localDraft;
            return;
          }

          setDraftState({ scopeKey, draft: result.draft });
          saveLocalIntakeDraft({ stepIndex: 1, furthestIndex: 1, draft: result.draft }, scope);
          setError(null);
          createdDraft = result.draft;
        },
      );
      return applied ? createdDraft : null;
    },
    [scope, scopeKey],
  );

  const save = useCallback(
    async (patch: DraftPatch) => {
      if (!draft || !scope || !scopeKey) {
        if (!scopeKey) {
          setError('Draft recovery is unavailable until your buyer identity is resolved.');
        }
        return null;
      }

      const optimisticDraft: IntakeDraft = {
        ...draft,
        ...patch,
        attributes: patch.attributes ? { ...draft.attributes, ...patch.attributes } : draft.attributes,
        quality: patch.quality ? { ...draft.quality, ...patch.quality } : draft.quality,
        commercial: patch.commercial ? { ...draft.commercial, ...patch.commercial } : draft.commercial,
        sourcing: patch.sourcing ? { ...draft.sourcing, ...patch.sourcing } : draft.sourcing,
      };

      setDraft(optimisticDraft);
      saveLocalIntakeDraft({ stepIndex: 0, furthestIndex: 0, draft: optimisticDraft }, scope);

      setIsSaving(true);
      let savedDraft: IntakeDraft | null = optimisticDraft;
      const applied = await applyIntakeDraftResultForCurrentScope(
        updateDraft(draft, patch),
        scopeKeyRef,
        scopeKey,
        (result) => {
          setIsSaving(false);
          if (!result.ok) {
            console.warn('Server save encountered issue, persisted locally:', result.error);
            return;
          }

          setDraft(result.draft);
          saveLocalIntakeDraft({ stepIndex: 0, furthestIndex: 0, draft: result.draft }, scope);
          setError(null);
          savedDraft = result.draft;
        },
      );
      return applied ? savedDraft : null;
    },
    [draft, scope, scopeKey, setDraft],
  );

  /** Local-only edit, for controls that should not write on every keystroke. */
  const patchLocal = useCallback(
    (patch: DraftPatch) => {
      if (!scope || !scopeKey) return;
      setDraft((current) => {
        if (!current) return current;
        const updated = { ...current, ...patch };
        saveLocalIntakeDraft({ stepIndex: 0, furthestIndex: 0, draft: updated }, scope);
        return updated;
      });
    },
    [scope, scopeKey, setDraft],
  );

  const clearDraft = useCallback(() => {
    setDraft(null);
    clearLocalIntakeDraft(scope);
    setError(null);
  }, [scope, setDraft]);

  return { draft, setDraft, isLoading, isSaving, error, start, save, patchLocal, setError, clearDraft };
}
