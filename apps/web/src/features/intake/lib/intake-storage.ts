import type { BuyerPersona, ParsedRequirement, RequirementMode } from '@otp/domain';
import type { IntakeDraft } from '../types/intake-draft';

const INTAKE_STORAGE_KEY_PREFIX = 'otp_active_intake_draft';
const LEGACY_INTAKE_STORAGE_KEY_PREFIX = `${INTAKE_STORAGE_KEY_PREFIX}_`;

export type LegacyIntakeDraftStatus = 'present' | 'none' | 'unavailable' | 'discard-failed';
export type LegacyIntakeDraftDiscardResult = 'cancelled' | 'discarded' | 'failed';

export const LEGACY_INTAKE_DRAFT_DISCARD_CONFIRMATION =
  'Legacy intake drafts have no ownership metadata and cannot be reliably attributed to an account. Discard ALL matching legacy intake-draft keys in this browser profile? Correctly scoped v2 drafts will be preserved.';

export interface IntakeDraftStorageScope {
  authUserId: string;
  profileId: string;
  organizationId: string | null;
  persona: BuyerPersona;
}

export interface SavedIntakeState {
  version: 1;
  updatedAt: number;
  stepIndex: number;
  furthestIndex: number;
  draft: IntakeDraft | null;
  scopeState?: {
    originalText: string;
    title: string;
    categoryId: string | null;
    subcategoryId: string;
    requirementMode: RequirementMode;
    quantity: number | null;
    unit: string | null;
  } | null;
  parsed?: ParsedRequirement | null;
}

export function getIntakeDraftStorageKey(
  scope: IntakeDraftStorageScope | null | undefined,
): string | null {
  if (
    !scope ||
    typeof scope.authUserId !== 'string' ||
    !scope.authUserId.trim() ||
    typeof scope.profileId !== 'string' ||
    !scope.profileId.trim() ||
    (scope.organizationId != null &&
      (typeof scope.organizationId !== 'string' || !scope.organizationId.trim())) ||
    !['INDIVIDUAL', 'RWA', 'MSME'].includes(scope.persona) ||
    (!scope.organizationId && scope.persona !== 'INDIVIDUAL')
  ) {
    return null;
  }

  const identity = JSON.stringify([
    scope.authUserId,
    scope.profileId,
    scope.organizationId,
    scope.persona,
  ]);
  return `${INTAKE_STORAGE_KEY_PREFIX}:v2:${encodeURIComponent(identity)}`;
}

export function saveLocalIntakeDraft(
  state: Omit<SavedIntakeState, 'version' | 'updatedAt'>,
  scope: IntakeDraftStorageScope | null | undefined,
): void {
  const key = getIntakeDraftStorageKey(scope);
  if (!key) return;

  try {
    const payload: SavedIntakeState = {
      ...state,
      version: 1,
      updatedAt: Date.now(),
    };
    localStorage.setItem(key, JSON.stringify(payload));
  } catch (err) {
    console.warn('Failed to save intake draft locally:', err);
  }
}

export function loadLocalIntakeDraft(
  scope: IntakeDraftStorageScope | null | undefined,
): SavedIntakeState | null {
  const key = getIntakeDraftStorageKey(scope);
  if (!key) return null;

  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SavedIntakeState;
    if (parsed && parsed.version === 1 && typeof parsed.updatedAt === 'number') {
      // Retain drafts saved within the last 30 days
      const thirtyDays = 30 * 24 * 60 * 60 * 1000;
      if (Date.now() - parsed.updatedAt < thirtyDays) {
        return parsed;
      }
    }
  } catch (err) {
    console.warn('Failed to load local intake draft:', err);
  }
  return null;
}

export function clearLocalIntakeDraft(
  scope: IntakeDraftStorageScope | null | undefined,
): void {
  const key = getIntakeDraftStorageKey(scope);
  if (!key) return;

  try {
    localStorage.removeItem(key);
  } catch (err) {
    console.warn('Failed to clear local intake draft:', err);
  }
}

function getLegacyStorageKeys(): string[] {
  const keys: string[] = [];
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (key && (
      key === INTAKE_STORAGE_KEY_PREFIX ||
      key.startsWith(LEGACY_INTAKE_STORAGE_KEY_PREFIX)
    )) {
      keys.push(key);
    }
  }
  return keys;
}

export function getLegacyLocalIntakeDraftStatus(): LegacyIntakeDraftStatus {
  try {
    return getLegacyStorageKeys().length > 0 ? 'present' : 'none';
  } catch (err) {
    console.warn('Failed to inspect legacy intake draft keys:', err);
    return 'unavailable';
  }
}

export function clearLegacyLocalIntakeDrafts(): boolean {
  try {
    for (const key of getLegacyStorageKeys()) {
      localStorage.removeItem(key);
    }
    return true;
  } catch (err) {
    console.warn('Failed to clear legacy intake draft keys:', err);
    return false;
  }
}

export function discardLegacyLocalIntakeDrafts(
  confirmDiscard: (message: string) => boolean,
): LegacyIntakeDraftDiscardResult {
  if (!confirmDiscard(LEGACY_INTAKE_DRAFT_DISCARD_CONFIRMATION)) {
    return 'cancelled';
  }
  return clearLegacyLocalIntakeDrafts() ? 'discarded' : 'failed';
}

export function getLegacyIntakeDraftNotice(
  status: LegacyIntakeDraftStatus,
): { message: string; actionLabel: string } | null {
  if (status === 'none') return null;
  if (status === 'unavailable') {
    return {
      message: 'We could not check older local intake drafts. They are never restored automatically. You can retry removal of all matching legacy keys; correctly scoped v2 drafts will be preserved.',
      actionLabel: 'Review and discard legacy drafts',
    };
  }
  if (status === 'discard-failed') {
    return {
      message: 'We could not remove all matching legacy intake-draft keys. No legacy draft is restored automatically, and correctly scoped v2 drafts are preserved. You can retry after reviewing the confirmation.',
      actionLabel: 'Review and retry legacy discard',
    };
  }
  return {
    message: 'Older local intake drafts cannot be reliably attributed to an authenticated user because the old keys contain no ownership metadata. They were not restored. The action below removes all matching legacy intake-draft keys in this browser profile; correctly scoped v2 drafts are preserved.',
    actionLabel: 'Review and discard legacy drafts',
  };
}
