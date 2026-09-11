import type { ParsedRequirement, RequirementMode } from '@otp/domain';
import type { IntakeDraft } from '../types/intake-draft';

const INTAKE_STORAGE_KEY_PREFIX = 'otp_active_intake_draft';

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
  };
  parsed?: ParsedRequirement | null;
}

function getStorageKey(orgId?: string | null): string {
  return orgId ? `${INTAKE_STORAGE_KEY_PREFIX}_${orgId}` : INTAKE_STORAGE_KEY_PREFIX;
}

export function saveLocalIntakeDraft(
  state: Omit<SavedIntakeState, 'version' | 'updatedAt'>,
  orgId?: string | null,
): void {
  try {
    const payload: SavedIntakeState = {
      ...state,
      version: 1,
      updatedAt: Date.now(),
    };
    localStorage.setItem(getStorageKey(orgId), JSON.stringify(payload));
  } catch (err) {
    console.warn('Failed to save intake draft locally:', err);
  }
}

export function loadLocalIntakeDraft(orgId?: string | null): SavedIntakeState | null {
  try {
    const raw = localStorage.getItem(getStorageKey(orgId));
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

export function clearLocalIntakeDraft(orgId?: string | null): void {
  try {
    localStorage.removeItem(getStorageKey(orgId));
    localStorage.removeItem(INTAKE_STORAGE_KEY_PREFIX);
  } catch (err) {
    console.warn('Failed to clear local intake draft:', err);
  }
}
